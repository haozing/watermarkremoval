/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable jsx-a11y/control-has-associated-label */
import {
  ArrowLeftIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useClickAway } from 'react-use'
import Button from './components/Button'
import FileSelect from './components/FileSelect'
import Modal from './components/Modal'
import Editor from './Editor'
import { resizeImageFile, downloadImage } from './utils'
import Progress from './components/Progress'
import { downloadModel } from './adapters/cache'
import ErrorBoundary from './components/ErrorBoundary'
import {
  NotificationProvider,
  useNotifications,
} from './components/ErrorNotification'
import { setGlobalErrorHandler } from './utils/errorManager'
import { inpaintWithSession, createInpaintSession } from './adapters/inpainting'
import { getGlobalInpaintSession } from './lib/sessionManager'
import { Line } from './types/canvas'
import ProcessingOverlay from './components/ProcessingOverlay'
import * as m from './paraglide/messages'
import {
  languageTag,
  onSetLanguageTag,
  setLanguageTag,
} from './paraglide/runtime'

const AppContent: React.FC = () => {
  const [files, setFiles] = useState<File[]>([])
  const [currentFileIndex, setCurrentFileIndex] = useState(0)
  const [stateLanguageTag, setStateLanguageTag] = useState<'en' | 'zh'>('zh')
  const { addNotification } = useNotifications()

  // Batch processing progress
  const [batchProgress, setBatchProgress] = useState<{
    current: number
    total: number
  } | null>(null)

  onSetLanguageTag(() => setStateLanguageTag(languageTag()))

  const [showAbout, setShowAbout] = useState(false)
  const modalRef = useRef(null)

  const [downloadProgress, setDownloadProgress] = useState(100)
  const modelInitialized = useRef(false)

  // Global ort types (loaded dynamically)
  declare global {
    const ort: typeof import('onnxruntime-web')
  }

  useEffect(() => {
    // Set up global error handler
    setGlobalErrorHandler(addNotification)
  }, [addNotification])

  useEffect(() => {
    if (!modelInitialized.current) {
      modelInitialized.current = true
      downloadModel('inpaint', setDownloadProgress)
    }
  }, [])

  useClickAway(modalRef, () => {
    setShowAbout(false)
  })

  // 将绝对坐标转换为相对坐标（百分比）
  const convertMasksToRelative = useCallback(
    (
      templateMasks: Line[],
      originalWidth: number,
      originalHeight: number
    ): Line[] => {
      return templateMasks.map(mask => ({
        ...mask,
        pts: mask.pts.map(pt => ({
          x: pt.x / originalWidth, // 转换为0-1之间的比例
          y: pt.y / originalHeight,
        })),
      }))
    },
    []
  )

  // 将相对坐标转换为指定尺寸的绝对坐标
  const convertMasksToAbsolute = useCallback(
    (
      relativeMasks: Line[],
      targetWidth: number,
      targetHeight: number
    ): Line[] => {
      return relativeMasks.map(mask => ({
        ...mask,
        pts: mask.pts.map(pt => ({
          x: pt.x * targetWidth, // 转换回绝对像素坐标
          y: pt.y * targetHeight,
        })),
      }))
    },
    []
  )

  // Create mask canvas helper with cleanup
  const createMaskCanvas = useCallback(
    (
      templateMasks: Line[],
      width: number,
      height: number
    ): HTMLCanvasElement => {
      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = width
      maskCanvas.height = height
      const maskCtx = maskCanvas.getContext('2d')!

      // Black background
      maskCtx.fillStyle = 'black'
      maskCtx.fillRect(0, 0, width, height)

      // Draw template masks (white) - 使用与drawLines相同的逻辑
      let masksDrawn = 0
      maskCtx.strokeStyle = 'white'
      maskCtx.lineCap = 'round'
      maskCtx.lineJoin = 'round'

      templateMasks.forEach(mask => {
        if (!mask?.pts.length || !mask.size) {
          console.log('跳过无效mask:', {
            ptsLength: mask?.pts?.length,
            size: mask?.size,
          })
          return
        }
        maskCtx.lineWidth = mask.size // 使用与drawLines完全相同的逻辑
        maskCtx.beginPath()
        maskCtx.moveTo(mask.pts[0].x, mask.pts[0].y)
        mask.pts.forEach(pt => maskCtx.lineTo(pt.x, pt.y))
        maskCtx.stroke()
        masksDrawn++
      })

      console.log('Created mask canvas:', {
        templateMasksCount: templateMasks.length,
        masksDrawn,
        canvasSize: { width, height },
      })

      return maskCanvas
    },
    []
  )

  // Create mask visualization for debugging
  const createMaskVisualization = useCallback(
    async (
      imageFile: File,
      templateMasks: Line[],
      filename: string,
      debugInfo?: any
    ): Promise<void> => {
      const canvas = document.createElement('canvas')
      let bitmap: ImageBitmap | null = null
      let fileUrl: string | null = null

      try {
        fileUrl = URL.createObjectURL(imageFile)
        bitmap = await createImageBitmap(imageFile, {
          imageOrientation: 'from-image',
        })

        // Set canvas size to match image
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const ctx = canvas.getContext('2d')!

        // Draw original image as background
        ctx.drawImage(bitmap, 0, 0)

        // Draw masks with bright colors for visibility
        ctx.save()
        templateMasks.forEach((mask, index) => {
          if (mask.pts.length > 0) {
            // Use different colors for different masks
            const colors = [
              'rgba(255, 0, 0, 0.8)',
              'rgba(0, 255, 0, 0.8)',
              'rgba(0, 0, 255, 0.8)',
              'rgba(255, 255, 0, 0.8)',
            ]
            ctx.strokeStyle = colors[index % colors.length]
            ctx.lineWidth = mask.size + 4 // Slightly thicker for visibility
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'

            ctx.beginPath()
            ctx.moveTo(mask.pts[0].x, mask.pts[0].y)
            mask.pts.forEach(pt => ctx.lineTo(pt.x, pt.y))
            ctx.stroke()

            // Add coordinate labels at start and end points
            ctx.fillStyle = 'yellow'
            ctx.font = '14px Arial'
            ctx.strokeStyle = 'black'
            ctx.lineWidth = 1

            const startPt = mask.pts[0]
            const endPt = mask.pts[mask.pts.length - 1]

            // Start point
            const startText = `M${index}-S(${startPt.x.toFixed(
              1
            )},${startPt.y.toFixed(1)})`
            ctx.strokeText(startText, startPt.x + 5, startPt.y - 5)
            ctx.fillText(startText, startPt.x + 5, startPt.y - 5)

            // End point
            const endText = `M${index}-E(${endPt.x.toFixed(
              1
            )},${endPt.y.toFixed(1)})`
            ctx.strokeText(endText, endPt.x + 5, endPt.y + 15)
            ctx.fillText(endText, endPt.x + 5, endPt.y + 15)
          }
        })
        ctx.restore()

        // Add debug info overlay
        if (debugInfo) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
          ctx.fillRect(10, 10, 400, 120)

          ctx.fillStyle = 'white'
          ctx.font = '12px monospace'
          let yPos = 30

          ctx.fillText(`File: ${imageFile.name}`, 20, yPos)
          yPos += 15
          ctx.fillText(
            `Image Size: ${bitmap.width} x ${bitmap.height}`,
            20,
            yPos
          )
          yPos += 15
          ctx.fillText(`Masks Count: ${templateMasks.length}`, 20, yPos)
          yPos += 15
          ctx.fillText(
            `Total Points: ${templateMasks.reduce(
              (sum, m) => sum + m.pts.length,
              0
            )}`,
            20,
            yPos
          )
          yPos += 15
          ctx.fillText(`Type: ${debugInfo.type || 'Unknown'}`, 20, yPos)
          yPos += 15
          if (debugInfo.scaleFactors) {
            ctx.fillText(
              `Scale: ${debugInfo.scaleFactors.x.toFixed(
                3
              )} x ${debugInfo.scaleFactors.y.toFixed(3)}`,
              20,
              yPos
            )
          }
        }

        // Convert to blob and download
        canvas.toBlob(blob => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            downloadImage(url, `${filename}_mask_debug.png`)
            URL.revokeObjectURL(url)
            console.log(`Mask visualization saved: ${filename}_mask_debug.png`)
          }
        }, 'image/png')
      } finally {
        if (bitmap?.close) bitmap.close()
        if (fileUrl) URL.revokeObjectURL(fileUrl)
      }
    },
    []
  )

  // Create comparison visualization between single and batch processing
  const createComparisonVisualization = useCallback(
    async (
      imageFile: File,
      originalMasks: Line[], // 显示canvas上的原始masks
      scaledMasks: Line[], // 缩放后的masks
      filename: string,
      debugInfo: any
    ): Promise<void> => {
      const canvas = document.createElement('canvas')
      let bitmap: ImageBitmap | null = null
      let fileUrl: string | null = null

      try {
        fileUrl = URL.createObjectURL(imageFile)
        bitmap = await createImageBitmap(imageFile, {
          imageOrientation: 'from-image',
        })

        // Create a wider canvas for side-by-side comparison
        canvas.width = bitmap.width * 2 + 20
        canvas.height = bitmap.height
        const ctx = canvas.getContext('2d')!

        // Left side: Original masks (as they would appear in single processing)
        ctx.drawImage(bitmap, 0, 0)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.fillRect(5, 5, 300, 30)
        ctx.fillStyle = 'black'
        ctx.font = '16px Arial'
        ctx.fillText('单张处理 (Display Canvas Coords)', 10, 25)

        // Draw original masks in red
        originalMasks.forEach((mask, index) => {
          if (mask.pts.length > 0) {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'
            ctx.lineWidth = mask.size + 2
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.beginPath()
            ctx.moveTo(mask.pts[0].x, mask.pts[0].y)
            mask.pts.forEach(pt => ctx.lineTo(pt.x, pt.y))
            ctx.stroke()
          }
        })

        // Right side: Scaled masks (as they appear in batch processing)
        ctx.drawImage(bitmap, bitmap.width + 20, 0)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.fillRect(bitmap.width + 25, 5, 300, 30)
        ctx.fillStyle = 'black'
        ctx.fillText('批量处理 (Scaled to Image Coords)', bitmap.width + 30, 25)

        // Draw scaled masks in blue
        scaledMasks.forEach((mask, index) => {
          if (mask.pts.length > 0) {
            ctx.strokeStyle = 'rgba(0, 0, 255, 0.8)'
            ctx.lineWidth = mask.size + 2
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.beginPath()
            ctx.moveTo(mask.pts[0].x + bitmap.width + 20, mask.pts[0].y)
            mask.pts.forEach(pt => ctx.lineTo(pt.x + bitmap.width + 20, pt.y))
            ctx.stroke()
          }
        })

        // Add debug info overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
        ctx.fillRect(10, bitmap.height - 150, canvas.width - 20, 140)

        ctx.fillStyle = 'white'
        ctx.font = '12px monospace'
        let yPos = bitmap.height - 130

        ctx.fillText(`Comparison for: ${imageFile.name}`, 20, yPos)
        yPos += 15
        ctx.fillText(
          `Original Image Size: ${bitmap.width} x ${bitmap.height}`,
          20,
          yPos
        )
        yPos += 15
        if (debugInfo.displayCanvasSize) {
          ctx.fillText(
            `Display Canvas Size: ${debugInfo.displayCanvasSize.width} x ${debugInfo.displayCanvasSize.height}`,
            20,
            yPos
          )
          yPos += 15
          ctx.fillText(
            `Scale Factors: ${debugInfo.scaleFactors.x.toFixed(
              3
            )} x ${debugInfo.scaleFactors.y.toFixed(3)}`,
            20,
            yPos
          )
          yPos += 15
        }
        ctx.fillText(`Masks Count: ${originalMasks.length}`, 20, yPos)
        yPos += 15
        ctx.fillText(
          `Red = Original (Display) Coords, Blue = Scaled (Image) Coords`,
          20,
          yPos
        )

        // Convert to blob and download
        canvas.toBlob(blob => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            downloadImage(url, `${filename}_comparison.png`)
            URL.revokeObjectURL(url)
            console.log(
              `Comparison visualization saved: ${filename}_comparison.png`
            )
          }
        }, 'image/png')
      } finally {
        if (bitmap?.close) bitmap.close()
        if (fileUrl) URL.revokeObjectURL(fileUrl)
      }
    },
    []
  )

  // Process single image with aggressive resource cleanup
  const processSingleImageWithSession = useCallback(
    async (
      file: File,
      templateMasks: Line[],
      session: ort.InferenceSession
    ): Promise<string> => {
      // Work canvas for this operation only
      const canvas = document.createElement('canvas')
      let bitmap: ImageBitmap | null = null
      let fileUrl: string | null = null
      let inputTensor: any = null
      let output: any = null

      try {
        // Double-zero canvas for aggressive resource release
        canvas.width = 0
        canvas.height = 0
        canvas.width = 1
        canvas.height = 1

        fileUrl = URL.createObjectURL(file)
        bitmap = await createImageBitmap(file, {
          imageOrientation: 'from-image',
        })

        // Set target dimensions
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const ctx = canvas.getContext('2d')!

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(bitmap, 0, 0)

        // 详细记录批量处理的templateMasks信息
        console.log(
          '=== 批量处理 - templateMasks详情 ===',
          templateMasks.map((mask, index) => ({
            index,
            ptsCount: mask.pts.length,
            size: mask.size,
            firstPt: mask.pts[0],
            lastPt: mask.pts[mask.pts.length - 1],
          }))
        )

        // Create mask with proper cleanup tracking
        const maskCanvas = createMaskCanvas(
          templateMasks,
          bitmap.width,
          bitmap.height
        )

        // 详细记录批量处理的mask创建信息
        console.log('=== 批量处理mask创建 ===', {
          fileName: file.name,
          templateMasksCount: templateMasks.length,
          maskCanvasSize: {
            width: maskCanvas.width,
            height: maskCanvas.height,
          },
          maskDataUrl: maskCanvas.toDataURL().substring(0, 100) + '...',
          imageSize: { width: bitmap.width, height: bitmap.height },
        })

        // 生成批量处理mask可视化 (调试用)
        try {
          console.log('生成批量处理mask可视化...')
          await createMaskVisualization(
            file,
            templateMasks,
            file.name.replace(/\.[^/.]+$/, '_batch'),
            {
              type: 'Batch Processing',
              originalImageSize: { width: bitmap.width, height: bitmap.height },
              masksCount: templateMasks.length,
              scaleFactors: { x: 1, y: 1 }, // 这里的templateMasks已经是转换后的绝对坐标
            }
          )
        } catch (error) {
          console.warn('批量处理mask可视化失败:', error)
        }

        // Process with session
        const resultUrl = await inpaintWithSession(
          file,
          maskCanvas.toDataURL(),
          session
        )
        if (!resultUrl) throw new Error('Inpaint processing failed')

        return resultUrl
      } finally {
        // CRITICAL: Aggressive cleanup in specific order
        inputTensor = null
        output = null

        if (bitmap?.close) bitmap.close()
        if (fileUrl) URL.revokeObjectURL(fileUrl)

        // Canvas cleanup
        const ctx = canvas.getContext('2d')
        ctx?.clearRect(0, 0, canvas.width, canvas.height)
        canvas.width = 0
        canvas.height = 0

        // Yield to GC using requestIdleCallback if available
        await new Promise(resolve => {
          if ('requestIdleCallback' in window) {
            ;(window as any).requestIdleCallback(resolve, { timeout: 50 })
          } else {
            setTimeout(resolve, 10)
          }
        })
      }
    },
    [createMaskCanvas]
  )

  // Serial batch processing function
  const processRemainingFiles = useCallback(
    async (
      filesToProcess: File[],
      relativeMasks: Line[], // 改为相对坐标
      referenceSize: { width: number; height: number }, // 新增参考尺寸
      onProgress: (current: number, total: number) => void
    ) => {
      console.log('=== 批量处理Session测试 ===')
      console.log('创建新session而不是使用全局session (测试session一致性)')
      // 临时测试：创建新session而不是使用全局session
      const session = await createInpaintSession()

      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i]
        onProgress(i + 1, filesToProcess.length)

        try {
          console.log(
            `Processing ${i + 1}/${filesToProcess.length}: ${file.name}`
          )

          // 为当前文件创建适合其尺寸的绝对坐标masks
          const bitmap = await createImageBitmap(file)
          const absoluteMasks = convertMasksToAbsolute(
            relativeMasks,
            bitmap.width,
            bitmap.height
          )

          // 详细记录坐标转换过程
          console.log(`=== 批量处理坐标转换 ${file.name} ===`, {
            referenceSize: referenceSize,
            currentSize: { width: bitmap.width, height: bitmap.height },
            scaleFactors: {
              x: bitmap.width / referenceSize.width,
              y: bitmap.height / referenceSize.height,
            },
            relativeMasksDetails: relativeMasks.map((mask, index) => ({
              index,
              ptsCount: mask.pts.length,
              size: mask.size,
              firstRelativePt: mask.pts[0],
              lastRelativePt: mask.pts[mask.pts.length - 1],
            })),
            absoluteMasksDetails: absoluteMasks.map((mask, index) => ({
              index,
              ptsCount: mask.pts.length,
              size: mask.size,
              firstAbsolutePt: mask.pts[0],
              lastAbsolutePt: mask.pts[mask.pts.length - 1],
            })),
          })

          // 使用转换后的绝对坐标处理图片
          const processedUrl = await processSingleImageWithSession(
            file,
            absoluteMasks,
            session
          )

          // Validate that we got a processed result
          if (!processedUrl || processedUrl.length < 100) {
            throw new Error('处理结果无效或为空')
          }

          // Download immediately
          const fileName = file.name.replace(/\.[^/.]+$/, '_processed')
          downloadImage(processedUrl, fileName)

          console.log(`Successfully processed and downloaded: ${fileName}`)

          // Yield to main thread to prevent blocking UI
          await new Promise(r => setTimeout(r, 10))
        } catch (error) {
          console.error(`Failed to process ${file.name}:`, error)
          addNotification(`处理 ${file.name} 失败: ${error}`, 'error')
        }
      }
    },
    [processSingleImageWithSession, addNotification, convertMasksToAbsolute]
  )

  // Handle batch processing request from Editor
  const handleProcessRemaining = useCallback(
    async (
      templateMasks: Line[],
      displayCanvasSize?: { width: number; height: number }
    ) => {
      const remainingFiles = files.slice(currentFileIndex + 1)
      if (remainingFiles.length === 0) {
        addNotification('没有剩余文件需要处理', 'info')
        return
      }

      // 验证是否有有效的模板mask
      const validMasks = templateMasks.filter(mask => mask.pts.length > 0)
      if (validMasks.length === 0) {
        addNotification(
          '没有有效的标记区域，请先在图片上绘制需要处理的区域',
          'warning'
        )
        return
      }

      // 获取当前图片尺寸作为参考
      const currentFile = files[currentFileIndex]
      const currentImage = await createImageBitmap(currentFile)
      const { width: refWidth, height: refHeight } = currentImage

      console.log('=== 坐标转换修复 ===', {
        displayCanvasSize: displayCanvasSize,
        originalImageSize: { width: refWidth, height: refHeight },
        maskCoordinatesBefore: validMasks.map(mask => ({
          firstPt: mask.pts[0],
          lastPt: mask.pts[mask.pts.length - 1],
        })),
      })

      // 第一步：将显示canvas坐标转换为原始图片坐标
      let scaledMasks = validMasks
      if (displayCanvasSize) {
        const scaleX = refWidth / displayCanvasSize.width
        const scaleY = refHeight / displayCanvasSize.height

        console.log('Scaling factors:', { scaleX, scaleY })

        scaledMasks = validMasks.map(mask => ({
          ...mask,
          pts: mask.pts.map(pt => ({
            x: pt.x * scaleX,
            y: pt.y * scaleY,
          })),
        }))

        console.log(
          '坐标缩放后:',
          scaledMasks.map(mask => ({
            firstPt: mask.pts[0],
            lastPt: mask.pts[mask.pts.length - 1],
          }))
        )
      }

      // 第二步：将缩放后的masks转换为相对坐标
      const relativeMasks = convertMasksToRelative(
        scaledMasks,
        refWidth,
        refHeight
      )

      console.log('Converted masks to relative coordinates:', {
        originalMasks: validMasks.length,
        relativeMasks: relativeMasks.length,
        referenceSize: { width: refWidth, height: refHeight },
      })

      // 生成对比可视化 (使用当前文件进行对比)
      if (displayCanvasSize && remainingFiles.length > 0) {
        try {
          console.log('生成坐标转换对比可视化...')
          await createComparisonVisualization(
            currentFile,
            validMasks, // 原始显示canvas坐标
            scaledMasks, // 缩放后的图片坐标
            currentFile.name.replace(/\.[^/.]+$/, '_coordinate_comparison'),
            {
              displayCanvasSize: displayCanvasSize,
              scaleFactors: {
                x: refWidth / displayCanvasSize.width,
                y: refHeight / displayCanvasSize.height,
              },
            }
          )
        } catch (error) {
          console.warn('坐标转换对比可视化失败:', error)
        }
      }

      console.log(`Starting batch processing of ${remainingFiles.length} files`)
      setBatchProgress({ current: 0, total: remainingFiles.length })

      try {
        await processRemainingFiles(
          remainingFiles,
          relativeMasks, // 传入相对坐标
          { width: refWidth, height: refHeight }, // 传入参考尺寸
          (current, total) => {
            setBatchProgress({ current, total })
          }
        )

        setBatchProgress(null)
        // 更新当前文件索引到最后一个文件，表示所有文件都已处理
        setCurrentFileIndex(files.length - 1)
        addNotification(
          `批量处理完成！已处理 ${remainingFiles.length} 张图片`,
          'success'
        )
      } catch (error) {
        setBatchProgress(null)
        console.error('Batch processing failed:', error)
        addNotification(`批量处理失败: ${error}`, 'error')
      }
    },
    [
      files,
      currentFileIndex,
      processRemainingFiles,
      addNotification,
      convertMasksToRelative,
    ]
  )

  async function startWithDemoImage(img: string) {
    const imgBlob = await fetch(`/examples/${img}.jpeg`).then(r => r.blob())
    setFiles([new File([imgBlob], `${img}.jpeg`, { type: 'image/jpeg' })])
    setCurrentFileIndex(0)
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="z-10 shadow flex flex-row items-center md:justify-between h-14">
        <Button
          className={[
            files.length > 0 ? '' : 'opacity-50 pointer-events-none',
            'pl-1 pr-1 mx-1 sm:mx-5',
          ].join(' ')}
          icon={<ArrowLeftIcon className="w-6 h-6" />}
          onClick={() => {
            setFiles([])
            setCurrentFileIndex(0)
          }}
        >
          <div className="md:w-[290px]">
            <span className="hidden sm:inline select-none">
              {m.start_new()}
            </span>
          </div>
        </Button>
        <div className="text-4xl font-bold text-blue-600 hover:text-blue-700 transition duration-300 ease-in-out">
          Inpaint-web
        </div>
        <div className="hidden md:flex justify-end w-[300px] mx-1 sm:mx-5">
          <Button
            className="mr-5 flex"
            onClick={() => {
              if (languageTag() === 'zh') {
                setLanguageTag('en')
              } else {
                setLanguageTag('zh')
              }
            }}
          >
            <p>{languageTag() === 'en' ? '切换到中文' : 'en'}</p>
          </Button>
          <Button
            className="w-38 flex sm:visible"
            icon={<InformationCircleIcon className="w-6 h-6" />}
            onClick={() => {
              setShowAbout(true)
            }}
          >
            <p>{m.feedback()}</p>
          </Button>
        </div>
      </header>

      <main
        style={{
          height: 'calc(100vh - 56px)',
        }}
        className=" relative"
      >
        {files.length > 0 ? (
          <>
            <Editor
              file={files[currentFileIndex]}
              remainingFiles={files.slice(currentFileIndex + 1)}
              onProcessRemaining={handleProcessRemaining}
              onVisualizeMask={createMaskVisualization}
            />

            {/* Batch processing overlay */}
            {batchProgress && (
              <ProcessingOverlay
                currentIndex={batchProgress.current - 1}
                totalFiles={batchProgress.total}
                currentFileName={
                  batchProgress.current > 0
                    ? files[currentFileIndex + batchProgress.current]?.name ||
                      'Processing...'
                    : 'Starting...'
                }
                onCancel={() => {
                  setBatchProgress(null)
                  console.log('Batch processing cancelled by user')
                }}
              />
            )}
          </>
        ) : (
          <>
            <div className="flex h-full flex-1 flex-col items-center justify-center overflow-hidden">
              <div className="h-72 sm:w-1/2 max-w-5xl">
                <FileSelect
                  onSelection={async selectedFiles => {
                    const resizedFiles = []
                    for (const f of selectedFiles) {
                      const { file: resizedFile } = await resizeImageFile(
                        f,
                        1024 * 4
                      )
                      resizedFiles.push(resizedFile)
                    }
                    setFiles(resizedFiles)
                    setCurrentFileIndex(0)
                  }}
                />
              </div>
              <div className="flex flex-col sm:flex-row pt-10 items-center justify-center cursor-pointer">
                <span className="text-gray-500">{m.try_it_images()}</span>
                <div className="flex space-x-2 sm:space-x-4 px-4">
                  {['bag', 'dog', 'car', 'bird', 'jacket', 'shoe', 'paris'].map(
                    image => (
                      <div
                        key={image}
                        onClick={() => startWithDemoImage(image)}
                        role="button"
                        onKeyDown={() => startWithDemoImage(image)}
                        tabIndex={-1}
                      >
                        <img
                          className="rounded-md hover:opacity-75 w-auto h-25"
                          src={`examples/${image}.jpeg`}
                          alt={image}
                          style={{ height: '100px' }}
                        />
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {showAbout && (
        <Modal>
          <div ref={modalRef} className="text-xl space-y-5">
            <p>
              {' '}
              任何问题到:{' '}
              <a
                href="https://github.com/lxfater/inpaint-web"
                style={{ color: 'blue' }}
                rel="noreferrer"
                target="_blank"
              >
                Inpaint-web
              </a>{' '}
              反馈
            </p>
            <p>
              {' '}
              For any questions, please go to:{' '}
              <a
                href="https://github.com/lxfater/inpaint-web"
                style={{ color: 'blue' }}
                rel="noreferrer"
                target="_blank"
              >
                Inpaint-web
              </a>{' '}
              to provide feedback.
            </p>
          </div>
        </Modal>
      )}
      {!(downloadProgress === 100) && (
        <Modal>
          <div className="text-xl space-y-5">
            <p>{m.inpaint_model_download_message()}</p>
            <Progress percent={downloadProgress} />
          </div>
        </Modal>
      )}
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </ErrorBoundary>
  )
}

export default App
