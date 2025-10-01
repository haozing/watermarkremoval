/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import {
  ArrowDownTrayIcon,
  EyeIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useState, useRef, useMemo } from 'react'
import { useWindowSize } from 'react-use'
import inpaint from './adapters/inpainting'
import Button from './components/Button'
import {
  downloadImage,
  loadImage,
  useImage,
  getProcessedFileName,
} from './utils'
import { useErrorNotification } from './components/ErrorNotification'
import { Line, drawLines } from './types/canvas'
import {
  convertLineToRelative,
  convertLinesToAbsolute,
  logCoordinateConversion,
} from './utils/coordinateTransform'
import { createMaskCanvasFromImage } from './utils/maskUtils'
import { createMaskVisualization } from './debug/maskVisualizer'
import ImageGallery from './components/ImageGallery'
import CanvasEditor, { CanvasEditorRef } from './components/CanvasEditor'
import EditorToolbar from './components/EditorToolbar'
import * as m from './paraglide/messages'
import {
  DEFAULT_BRUSH_SIZE,
  BRUSH_HIDE_TIMEOUT,
  FILENAME_SUFFIX_SINGLE,
} from './constants'
import { log } from './utils/logger'

interface EditorProps {
  file: File
  files: File[] // 新增：所有文件
  currentFileIndex: number // 新增：当前文件索引
  imageMasks: Map<number, Line[]> // 新增：每张图片的masks
  setImageMasks: React.Dispatch<React.SetStateAction<Map<number, Line[]>>> // 新增：设置masks
  onSelectImage: (index: number) => void // 新增：切换图片
  remainingFiles?: File[]
  totalFilesCount?: number // 总文件数
  onProcessRemaining?: (
    templateMasks: Line[],
    includeCurrentFile?: boolean, // 是否包含当前文件
    saveToDb?: boolean // 是否保存到数据库（批量下载）
  ) => void
}

export default function Editor(props: EditorProps) {
  const {
    file,
    files,
    currentFileIndex,
    imageMasks,
    setImageMasks,
    onSelectImage,
    remainingFiles = [],
    totalFilesCount = 1,
    onProcessRemaining,
  } = props
  const { showError } = useErrorNotification()
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE)
  const [original, isOriginalLoaded] = useImage(file)
  const [renders, setRenders] = useState<HTMLImageElement[]>([])
  const [context, setContext] = useState<CanvasRenderingContext2D>()
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [lines, setLines] = useState<Line[]>([{ pts: [], src: '' }])
  const brushRef = useRef<HTMLDivElement>(null)
  const [showBrush, setShowBrush] = useState(false)
  const [hideBrushTimeout, setHideBrushTimeout] = useState(0)
  const [isInpaintingLoading, setIsProcessingLoading] = useState(false)
  const [generateProgress, setGenerateProgress] = useState(0)
  // 删除 pendingMasks state，改用从imageMasks中获取
  const pendingMasks = imageMasks.get(currentFileIndex) || []
  const [showBatchButton, setShowBatchButton] = useState(false)
  const [currentImageProcessed, setCurrentImageProcessed] = useState(false) // 当前图片是否已被单独处理
  const modalRef = useRef(null)
  const [useSeparator, setUseSeparator] = useState(false)
  const [separatorLeft, setSeparatorLeft] = useState(0)
  const canvasEditorRef = useRef<CanvasEditorRef>(null)
  const isBrushSizeChange = useRef<boolean>(false)
  const scaledBrushSize = useMemo(() => brushSize, [brushSize])
  const windowSize = useWindowSize()

  // 初始化maskCanvas
  useEffect(() => {
    if (!maskCanvasRef.current) {
      maskCanvasRef.current = document.createElement('canvas')
    }
    return () => {
      // React 18 清理函数会被调用
      if (maskCanvasRef.current) {
        maskCanvasRef.current = null
      }
    }
  }, [])

  // Draw函数 - 调用CanvasEditor的draw方法
  const draw = useCallback(
    (index = -1) => {
      canvasEditorRef.current?.draw(index)
    },
    [canvasEditorRef]
  )

  const refreshCanvasMask = useCallback(() => {
    if (
      !context?.canvas.width ||
      !context?.canvas.height ||
      !maskCanvasRef.current
    ) {
      throw new Error('canvas has invalid size or mask canvas not initialized')
    }
    maskCanvasRef.current.width = context?.canvas.width
    maskCanvasRef.current.height = context?.canvas.height
    const ctx = maskCanvasRef.current.getContext('2d')
    if (!ctx) {
      throw new Error('could not retrieve mask canvas')
    }
    // Just need the finishing touch
    const line = lines.slice(-1)[0]
    if (line) drawLines(ctx, [line], 'white')
  }, [context?.canvas.height, context?.canvas.width, lines])

  // 创建合并mask的辅助函数
  const createCombinedMask = useCallback(
    (masks: Line[]): HTMLCanvasElement => {
      if (!context?.canvas.width || !context?.canvas.height) {
        throw new Error('canvas has invalid size')
      }

      const canvas = document.createElement('canvas')
      canvas.width = context.canvas.width
      canvas.height = context.canvas.height
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        throw new Error('could not create combined mask canvas context')
      }

      // 设置背景为黑色
      ctx.fillStyle = 'black'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 绘制所有mask到同一个canvas（白色）
      masks.forEach(mask => {
        if (mask.pts.length > 0) {
          drawLines(ctx, [mask], 'white')
        }
      })

      return canvas
    },
    [context?.canvas.width, context?.canvas.height]
  )

  // 定义onloading函数（需要在processBatch之前定义）
  const onloading = useCallback(() => {
    setIsProcessingLoading(true)
    setGenerateProgress(0)
    const progressTimer = window.setInterval(() => {
      setGenerateProgress(p => {
        if (p < 90) return p + 10 * Math.random()
        if (p >= 90 && p < 99) return p + 1 * Math.random()
        // Do not hide the progress bar after 99%,cause sometimes long time progress
        // window.setTimeout(() => setIsInpaintingLoading(false), 500)
        return p
      })
    }, 1000)
    return {
      close: () => {
        clearInterval(progressTimer)
        setGenerateProgress(100)
        setIsProcessingLoading(false)
      },
    }
  }, [])

  // 将相对坐标转换为实际图像的绝对坐标
  const convertRelativeMasksToAbsolute = useCallback(
    async (
      relativeMasks: Line[],
      targetFile: File | HTMLImageElement
    ): Promise<Line[]> => {
      // 获取目标图像尺寸
      let imageWidth: number, imageHeight: number
      if (targetFile instanceof File) {
        const bitmap = await createImageBitmap(targetFile)
        imageWidth = bitmap.width
        imageHeight = bitmap.height
        bitmap.close?.()
      } else {
        imageWidth = targetFile.naturalWidth
        imageHeight = targetFile.naturalHeight
      }

      // ✅ 使用工具函数转换
      const absoluteMasks = convertLinesToAbsolute(relativeMasks, {
        width: imageWidth,
        height: imageHeight,
      })

      // ✅ 使用统一的日志函数
      logCoordinateConversion('Editor.convertRelativeMasksToAbsolute', {
        imageSize: { width: imageWidth, height: imageHeight },
        originalLine: {
          firstPt: relativeMasks[0]?.pts[0],
          size: relativeMasks[0]?.size,
        },
        convertedLine: {
          firstPt: absoluteMasks[0]?.pts[0],
          size: absoluteMasks[0]?.size,
        },
      })

      return absoluteMasks
    },
    [] // 不再依赖context
  )

  // 记录mask处理开始的调试信息
  const logMaskProcessingStart = useCallback(
    (pendingMasks: Line[], currentImage: File | HTMLImageElement) => {
      log.debug('单张处理开始', { maskCount: pendingMasks.length })

      log.debug(
        '单张处理 - pendingMasks详情',
        pendingMasks.map((mask, index) => ({
          index,
          ptsCount: mask.pts.length,
          size: mask.size,
          firstPt: mask.pts[0],
          lastPt: mask.pts[mask.pts.length - 1],
        }))
      )

      log.debug('单张处理 - 图像信息', {
        imageType:
          currentImage instanceof HTMLImageElement
            ? 'HTMLImageElement'
            : 'File',
        imageName:
          currentImage instanceof File ? currentImage.name : 'rendered image',
        imageSize:
          currentImage instanceof HTMLImageElement
            ? {
                width: currentImage.naturalWidth,
                height: currentImage.naturalHeight,
              }
            : 'File object',
      })
    },
    []
  )

  // 转换坐标并创建mask
  const convertAndCreateMask = useCallback(
    async (
      pendingMasks: Line[],
      currentImage: File | HTMLImageElement,
      convertFn: (
        masks: Line[],
        image: File | HTMLImageElement
      ) => Promise<Line[]>
    ) => {
      const absoluteMasks = await convertFn(pendingMasks, currentImage)

      log.debug('单张处理 - 使用相对坐标转换', {
        pendingMasksRelative: pendingMasks.map((mask, idx) => ({
          index: idx,
          firstPt: mask.pts[0],
          size: mask.size,
        })),
        absoluteMasksConverted: absoluteMasks.map((mask, idx) => ({
          index: idx,
          firstPt: mask.pts[0],
          size: mask.size,
        })),
      })

      const combinedMask = await createMaskCanvasFromImage(
        absoluteMasks,
        currentImage
      )

      log.debug('单张处理mask创建', {
        combinedMaskSize: {
          width: combinedMask.width,
          height: combinedMask.height,
        },
        combinedMaskDataUrl: combinedMask.toDataURL().substring(0, 100) + '...',
      })

      return { absoluteMasks, combinedMask }
    },
    []
  )

  // 执行inpaint并创建Image对象
  const performInpaint = useCallback(
    async (
      currentImage: File | HTMLImageElement,
      maskDataUrl: string
    ): Promise<HTMLImageElement | null> => {
      const result = await inpaint(currentImage, maskDataUrl)

      if (!result) return null

      const newRender = new Image()
      newRender.dataset.id = Date.now().toString()
      await loadImage(newRender, result)

      log.info('batch_inpaint_processed', {
        resultUrl: result.substring(0, 50) + '...',
      })

      return newRender
    },
    []
  )

  // 单张处理函数（只处理当前图片）
  const processBatch = useCallback(async () => {
    if (pendingMasks.length === 0) return

    const loading = onloading()
    setShowBatchButton(false)
    setCurrentImageProcessed(true) // ✅ 标记当前图片已处理

    try {
      const currentImage = renders.slice(-1)[0] ?? file

      logMaskProcessingStart(pendingMasks, currentImage)

      const { absoluteMasks, combinedMask } = await convertAndCreateMask(
        pendingMasks,
        currentImage,
        convertRelativeMasksToAbsolute
      )

      const newRender = await performInpaint(
        currentImage,
        combinedMask.toDataURL()
      )

      if (newRender) {
        setRenders(prev => [...prev, newRender])
        // 保留pendingMasks以便处理剩余图片时使用相同的mask
        // setPendingMasks([]) // 不清空待处理mask，保留给剩余图片处理
        setLines([{ pts: [], src: '' }]) // 重置绘制线条
      }
    } catch (error: any) {
      log.error('batch_inpaint_failed', {
        error: error,
        maskCount: pendingMasks.length,
      })
      showError(
        '批量处理失败',
        error.message ? error.message : error.toString()
      )
    }

    // 历史列表滚动现在由 HistoryList 组件自己处理

    loading.close()
    draw()
  }, [
    pendingMasks,
    renders,
    file,
    onloading,
    showError,
    draw,
    logMaskProcessingStart,
    convertAndCreateMask,
    convertRelativeMasksToAbsolute,
    performInpaint,
  ])

  // Draw once the original image is loaded
  useEffect(() => {
    if (!context?.canvas) {
      return
    }
    if (isOriginalLoaded) {
      draw()
    }
  }, [context?.canvas, draw, original, isOriginalLoaded, windowSize])

  // 鼠标和笔刷事件处理 - 现在由CanvasEditor处理
  const handleBrushMove = useCallback(
    (ev: MouseEvent) => {
      if (brushRef.current) {
        const x = ev.pageX - scaledBrushSize / 2
        const y = ev.pageY - scaledBrushSize / 2
        brushRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
      }
    },
    [scaledBrushSize]
  )

  const handleStartDrawing = useCallback(() => {
    if (!original.src) {
      return
    }
    const currLine = lines[lines.length - 1]
    currLine.size = brushSize
    window.clearTimeout(hideBrushTimeout)
    setShowBrush(true)
  }, [original.src, lines, brushSize, hideBrushTimeout])

  const handleStopDrawing = useCallback(async () => {
    if (!original.src) {
      return
    }
    if (lines.slice(-1)[0]?.pts.length === 0) {
      return
    }

    // 批量模式：只累积mask，不立即处理
    const currentLine = lines[lines.length - 1]

    // ✅ 使用工具函数转换为相对坐标
    try {
      if (!context?.canvas) {
        log.warn('Canvas context未初始化')
        return
      }

      const relativeLine = convertLineToRelative(currentLine, context.canvas)

      // ✅ 使用统一的日志函数
      logCoordinateConversion('Editor.handleStopDrawing', {
        canvasPhysicalSize: {
          width: context.canvas.width,
          height: context.canvas.height,
        },
        canvasLogicalSize: {
          width: context.canvas.clientWidth,
          height: context.canvas.clientHeight,
        },
        originalLine: {
          firstPt: currentLine.pts[0],
          size: currentLine.size,
        },
        convertedLine: {
          firstPt: relativeLine.pts[0],
          size: relativeLine.size,
        },
      })

      const newPendingMasks = [...pendingMasks, relativeLine]
      // 更新当前图片的masks
      setImageMasks(prev => {
        const updated = new Map(prev)
        updated.set(currentFileIndex, newPendingMasks)
        return updated
      })
      setLines([...lines, { pts: [], src: '' } as Line]) // 准备下一条线
      setShowBatchButton(true)
    } catch (error) {
      log.error('坐标转换失败', error)
      showError(
        '坐标转换失败',
        error instanceof Error ? error.message : String(error)
      )
    }
    // 历史列表滚动现在由 HistoryList 组件自己处理
  }, [
    original.src,
    lines,
    pendingMasks,
    context,
    showError,
    currentFileIndex,
    setImageMasks,
  ])

  const handleMouseEnter = useCallback(() => {
    window.clearTimeout(hideBrushTimeout)
    setShowBrush(true)
  }, [hideBrushTimeout])

  const handleMouseLeave = useCallback(() => {
    setShowBrush(false)
  }, [])

  // 分隔符事件处理现在由CanvasEditor处理

  function download() {
    // 跳转到下载页面
    window.location.hash = '#download'
  }

  // 删除单个mask
  const handleDeleteMask = useCallback(
    (maskIndex: number) => {
      const currentMasks = pendingMasks
      const newMasks = currentMasks.filter((_, idx) => idx !== maskIndex)

      setImageMasks(prev => {
        const updated = new Map(prev)
        if (newMasks.length === 0) {
          updated.delete(currentFileIndex)
        } else {
          updated.set(currentFileIndex, newMasks)
        }
        return updated
      })

      if (newMasks.length === 0) {
        setShowBatchButton(false)
      }

      draw()
    },
    [pendingMasks, currentFileIndex, setImageMasks, draw]
  )

  const handleClearMarks = useCallback(() => {
    // 清除当前图片的masks
    setImageMasks(prev => {
      const updated = new Map(prev)
      updated.delete(currentFileIndex)
      return updated
    })
    setShowBatchButton(false)
    setCurrentImageProcessed(false) // ✅ 重置当前图片处理状态
    setLines([{ pts: [], src: '' }])
  }, [currentFileIndex, setImageMasks])

  const undo = useCallback(async () => {
    if (pendingMasks.length > 0) {
      // 撤销最后一个mask
      const newPendingMasks = [...pendingMasks]
      newPendingMasks.pop()
      // 更新当前图片的masks
      setImageMasks(prev => {
        const updated = new Map(prev)
        if (newPendingMasks.length === 0) {
          updated.delete(currentFileIndex)
        } else {
          updated.set(currentFileIndex, newPendingMasks)
        }
        return updated
      })

      if (newPendingMasks.length === 0) {
        setShowBatchButton(false)
      }

      // 重绘以更新显示
      draw()
      return
    }

    // 撤销历史渲染结果
    const l = lines
    l.pop()
    l.pop()
    setLines([...l, { pts: [], src: '' }])
    const r = renders
    r.pop()
    setRenders([...r])
  }, [lines, renders, pendingMasks, draw, currentFileIndex, setImageMasks])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!renders.length) {
        return
      }
      const isCmdZ = (event.metaKey || event.ctrlKey) && event.key === 'z'
      if (isCmdZ) {
        event.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [renders, undo])

  const handleSliderStart = () => {
    setShowBrush(true)
  }
  const handleSliderChange = (sliderValue: number) => {
    if (!isBrushSizeChange.current) {
      isBrushSizeChange.current = true
    }
    if (brushRef.current) {
      const x = document.documentElement.clientWidth / 2 - scaledBrushSize / 2
      const y = document.documentElement.clientHeight / 2 - scaledBrushSize / 2

      brushRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }
    setBrushSize(sliderValue)
    window.clearTimeout(hideBrushTimeout)
    setHideBrushTimeout(
      window.setTimeout(() => {
        setShowBrush(false)
      }, BRUSH_HIDE_TIMEOUT)
    )
  }

  return (
    <div
      className={[
        'flex flex-col h-full',
        isInpaintingLoading ? 'animate-pulse-fast pointer-events-none' : '',
      ].join(' ')}
    >
      {/* 顶部图片选择器 */}
      <ImageGallery
        files={files}
        currentIndex={currentFileIndex}
        imageMasks={imageMasks}
        onSelectImage={onSelectImage}
      />

      {/* Main content area */}
      <div className="flex flex-col flex-1 items-center justify-between">
        {/* 画图 */}
        <CanvasEditor
          ref={canvasEditorRef}
          context={context}
          original={original}
          isOriginalLoaded={isOriginalLoaded}
          renders={renders}
          lines={lines}
          brushSize={brushSize}
          showBrush={showBrush}
          separatorLeft={separatorLeft}
          isInpaintingLoading={isInpaintingLoading}
          generateProgress={generateProgress}
          pendingMasks={pendingMasks}
          useSeparator={useSeparator}
          onDraw={draw}
          onStartDrawing={handleStartDrawing}
          onStopDrawing={handleStopDrawing}
          onMouseMove={() => {}}
          onBrushMove={handleBrushMove}
          onDeleteMask={handleDeleteMask}
          setSeparatorLeft={setSeparatorLeft}
          setUseSeparator={setUseSeparator}
          setContext={setContext}
        />

        {showBrush && (
          <div
            className="fixed rounded-full bg-red-500 bg-opacity-50 pointer-events-none left-0 top-0"
            style={{
              width: `${scaledBrushSize}px`,
              height: `${scaledBrushSize}px`,
              transform: `translate3d(-100px, -100px, 0)`,
            }}
            ref={brushRef}
          />
        )}
        {/* 工具栏 */}
        <EditorToolbar
          hasRenders={renders.length > 0}
          brushSize={brushSize}
          pendingMasksCount={pendingMasks.length}
          showBatchButton={showBatchButton}
          currentImageProcessed={currentImageProcessed}
          remainingFilesCount={remainingFiles?.length || 0}
          totalFilesCount={totalFilesCount}
          onUndo={undo}
          onBrushSizeChange={handleSliderChange}
          onBrushSizeStart={handleSliderStart}
          onDownload={download}
          onProcessBatch={processBatch}
          onProcessAll={() => {
            // 批量处理：保存到IndexedDB，处理完跳转下载页面
            // 如果未处理当前图片：处理全部
            // 如果已处理当前图片：处理剩余
            onProcessRemaining?.(
              pendingMasks,
              !currentImageProcessed,
              true // 始终保存到数据库
            )
          }}
          onClearMarks={handleClearMarks}
        />
      </div>
    </div>
  )
}
