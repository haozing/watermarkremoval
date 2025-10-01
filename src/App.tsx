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
import { resizeImageFile, downloadImage, getProcessedFileName } from './utils'
import Progress from './components/Progress'
import { downloadModel } from './adapters/cache'
import ErrorBoundary from './components/ErrorBoundary'
import {
  NotificationProvider,
  useNotifications,
} from './components/ErrorNotification'
import { setGlobalErrorHandler } from './utils/errorManager'
import { inpaintWithSession, createInpaintSession } from './adapters/inpainting'
import { Line } from './types/canvas'
import ProcessingOverlay from './components/ProcessingOverlay'
import * as m from './paraglide/messages'
import {
  convertLinesToAbsolute,
  logCoordinateConversion,
} from './utils/coordinateTransform'
import { createMaskCanvas } from './utils/maskUtils'
import { createMaskVisualization } from './debug/maskVisualizer'
import {
  languageTag,
  onSetLanguageTag,
  setLanguageTag,
} from './paraglide/runtime'
import {
  FILENAME_SUFFIX_BATCH,
  GC_IDLE_TIMEOUT,
  GC_FALLBACK_DELAY,
} from './constants'
import { log } from './utils/logger'
import { imageDB } from './utils/imageDatabase'
import DownloadPage from './components/DownloadPage'

const AppContent: React.FC = () => {
  const [files, setFiles] = useState<File[]>([])
  const [currentFileIndex, setCurrentFileIndex] = useState(0)
  const [stateLanguageTag, setStateLanguageTag] = useState<'en' | 'zh'>('zh')
  const { addNotification } = useNotifications()

  // 每张图片独立的masks（相对坐标0-1）
  const [imageMasks, setImageMasks] = useState<Map<number, Line[]>>(new Map())

  // Batch processing progress
  const [batchProgress, setBatchProgress] = useState<{
    current: number
    total: number
  } | null>(null)

  // 简单路由：检测URL hash
  const [currentRoute, setCurrentRoute] = useState<'home' | 'download'>('home')

  onSetLanguageTag(() => setStateLanguageTag(languageTag()))

  // 检测URL变化
  useEffect(() => {
    const checkRoute = () => {
      const hash = window.location.hash
      if (hash === '#download') {
        setCurrentRoute('download')
      } else {
        setCurrentRoute('home')
      }
    }

    checkRoute()
    window.addEventListener('hashchange', checkRoute)
    return () => window.removeEventListener('hashchange', checkRoute)
  }, [])

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

  // 准备图像canvas和bitmap
  const prepareImageCanvas = useCallback(async (file: File) => {
    const canvas = document.createElement('canvas')
    canvas.width = 0
    canvas.height = 0
    canvas.width = 1
    canvas.height = 1

    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    })

    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0)

    return { canvas, bitmap, ctx }
  }, [])

  // 转换坐标并创建批量处理mask，记录日志
  const convertAndLogBatchMask = useCallback(
    (
      templateMasks: Line[],
      bitmap: ImageBitmap,
      file: File
    ): HTMLCanvasElement => {
      const absoluteMasks = convertLinesToAbsolute(templateMasks, {
        width: bitmap.width,
        height: bitmap.height,
      })

      logCoordinateConversion('App.processSingleImageWithSession - 批量处理', {
        imageSize: { width: bitmap.width, height: bitmap.height },
        originalLine: {
          firstPt: templateMasks[0]?.pts[0],
          size: templateMasks[0]?.size,
        },
        convertedLine: {
          firstPt: absoluteMasks[0]?.pts[0],
          size: absoluteMasks[0]?.size,
        },
      })

      const maskCanvas = createMaskCanvas(absoluteMasks, {
        width: bitmap.width,
        height: bitmap.height,
      })

      log.debug('批量处理mask创建', {
        fileName: file.name,
        templateMasksCount: templateMasks.length,
        maskCanvasSize: {
          width: maskCanvas.width,
          height: maskCanvas.height,
        },
        maskDataUrl: maskCanvas.toDataURL().substring(0, 100) + '...',
        imageSize: { width: bitmap.width, height: bitmap.height },
      })

      return maskCanvas
    },
    []
  )

  // Process single image with aggressive resource cleanup
  const processSingleImageWithSession = useCallback(
    async (
      file: File,
      templateMasks: Line[],
      session: ort.InferenceSession,
      saveToDb: boolean = false // 新增：是否保存到IndexedDB
    ): Promise<string> => {
      let canvas: HTMLCanvasElement | null = null
      let bitmap: ImageBitmap | null = null
      let fileUrl: string | null = null

      try {
        fileUrl = URL.createObjectURL(file)
        const prepared = await prepareImageCanvas(file)
        canvas = prepared.canvas
        bitmap = prepared.bitmap

        const maskCanvas = convertAndLogBatchMask(templateMasks, bitmap, file)

        const resultUrl = await inpaintWithSession(
          file,
          maskCanvas.toDataURL(),
          session
        )
        if (!resultUrl) throw new Error('Inpaint processing failed')

        if (saveToDb) {
          // 保存到IndexedDB而不是直接下载
          const blob = await fetch(resultUrl).then(r => r.blob())
          const fileName = getProcessedFileName(file.name)

          await imageDB.saveImage({
            id: `${Date.now()}-${Math.random()}`,
            fileName,
            blob,
            timestamp: Date.now(),
          })

          log.info(`图片保存到数据库: ${fileName}`)
        }

        return resultUrl
      } finally {
        // CRITICAL: Aggressive cleanup in specific order
        if (bitmap?.close) bitmap.close()
        if (fileUrl) URL.revokeObjectURL(fileUrl)

        if (canvas) {
          const ctx = canvas.getContext('2d')
          ctx?.clearRect(0, 0, canvas.width, canvas.height)
          canvas.width = 0
          canvas.height = 0
        }

        // Yield to GC using requestIdleCallback if available
        await new Promise(resolve => {
          if ('requestIdleCallback' in window) {
            ;(window as any).requestIdleCallback(resolve, {
              timeout: GC_IDLE_TIMEOUT,
            })
          } else {
            setTimeout(resolve, GC_FALLBACK_DELAY)
          }
        })
      }
    },
    [prepareImageCanvas, convertAndLogBatchMask]
  )

  // Serial batch processing function
  const processRemainingFiles = useCallback(
    async (
      filesToProcess: File[],
      relativeMasks: Line[], // 已经是相对坐标(0-1)
      saveToDb: boolean = false, // 新增：是否保存到数据库
      onProgress: (current: number, total: number) => void
    ) => {
      log.debug('批量处理Session测试')
      log.debug('创建新session而不是使用全局session (测试session一致性)')
      // 临时测试：创建新session而不是使用全局session
      const session = await createInpaintSession()

      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i]
        onProgress(i + 1, filesToProcess.length)

        try {
          log.info(`Processing ${i + 1}/${filesToProcess.length}: ${file.name}`)

          // ✅ 直接使用相对坐标处理图片（processSingleImageWithSession内部会转换）
          const processedUrl = await processSingleImageWithSession(
            file,
            relativeMasks,
            session,
            saveToDb // 传递saveToDb参数
          )

          // Validate that we got a processed result
          if (!processedUrl || processedUrl.length < 100) {
            throw new Error('处理结果无效或为空')
          }

          if (!saveToDb) {
            // 直接下载模式
            const fileName = getProcessedFileName(file.name)
            downloadImage(processedUrl, fileName)
            log.info(`Successfully processed and downloaded: ${fileName}`)
          }

          // Yield to main thread to prevent blocking UI
          await new Promise(r => setTimeout(r, GC_FALLBACK_DELAY))
        } catch (error) {
          log.error(`Failed to process ${file.name}`, error)
          addNotification(`处理 ${file.name} 失败: ${error}`, 'error')
        }
      }

      // 如果是保存到数据库模式，处理完成后跳转到下载页面
      if (saveToDb) {
        log.info('所有图片已保存到数据库，跳转到下载页面')
        window.location.hash = '#download'
      }
    },
    [processSingleImageWithSession, addNotification]
  )

  // Handle batch processing request from Editor
  const handleProcessRemaining = useCallback(
    async (
      templateMasks: Line[],
      includeCurrentFile: boolean = false, // ✅ 是否包含当前文件
      saveToDb: boolean = false // 新增：是否保存到数据库（用于批量下载）
    ) => {
      // ✅ 根据参数决定处理哪些文件
      const filesToProcess = includeCurrentFile
        ? files.slice(currentFileIndex) // 包含当前文件：从当前开始
        : files.slice(currentFileIndex + 1) // 不包含当前文件：从下一张开始

      if (filesToProcess.length === 0) {
        addNotification('没有需要处理的文件', 'info')
        return
      }

      const actionText = includeCurrentFile ? '处理全部' : '处理剩余'
      log.info(actionText, {
        includeCurrentFile,
        currentFileIndex,
        totalFiles: files.length,
        filesToProcessCount: filesToProcess.length,
      })

      // 验证是否有有效的模板mask
      const validMasks = templateMasks.filter(mask => mask.pts.length > 0)
      if (validMasks.length === 0) {
        addNotification(
          '没有有效的标记区域，请先在图片上绘制需要处理的区域',
          'warning'
        )
        return
      }

      // ✅ validMasks已经是相对坐标，无需任何转换！
      log.debug('批量处理 - 直接使用相对坐标', {
        masksCount: validMasks.length,
        firstMaskRelative: {
          firstPt: validMasks[0]?.pts[0],
          size: validMasks[0]?.size,
        },
      })

      // ✅ 不再需要坐标转换对比可视化，因为已经统一使用相对坐标

      log.info(`Starting batch processing of ${filesToProcess.length} files`)
      setBatchProgress({ current: 0, total: filesToProcess.length })

      try {
        await processRemainingFiles(
          filesToProcess,
          validMasks, // ✅ 直接传相对坐标，不需要转换！
          saveToDb, // 传递saveToDb参数
          (current, total) => {
            setBatchProgress({ current, total })
          }
        )

        setBatchProgress(null)

        if (!saveToDb) {
          // 只有非数据库模式才更新文件索引
          // ✅ 根据是否包含当前文件决定最终索引位置
          if (includeCurrentFile) {
            // 处理全部：移到最后一张
            setCurrentFileIndex(files.length - 1)
          } else {
            // 处理剩余：保持当前位置不变（因为当前图片已经单独处理过了）
            // 或者也可以移到最后一张
            setCurrentFileIndex(files.length - 1)
          }
          addNotification(
            `${actionText}完成！已处理 ${filesToProcess.length} 张图片`,
            'success'
          )
        }
        // 数据库模式下，会自动跳转到下载页面，不显示通知
      } catch (error) {
        setBatchProgress(null)
        log.error('Batch processing failed', error)
        addNotification(`批量处理失败: ${error}`, 'error')
      }
    },
    [files, currentFileIndex, processRemainingFiles, addNotification]
  )

  async function startWithDemoImage(img: string) {
    const imgBlob = await fetch(`/examples/${img}.jpeg`).then(r => r.blob())
    setFiles([new File([imgBlob], `${img}.jpeg`, { type: 'image/jpeg' })])
    setCurrentFileIndex(0)
    setImageMasks(new Map()) // 重置masks
  }

  // 切换图片处理函数
  const handleSelectImage = useCallback((index: number) => {
    setCurrentFileIndex(index)
  }, [])

  // 路由渲染
  if (currentRoute === 'download') {
    return <DownloadPage />
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
            setImageMasks(new Map()) // 重置所有masks
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
              files={files}
              currentFileIndex={currentFileIndex}
              imageMasks={imageMasks}
              setImageMasks={setImageMasks}
              onSelectImage={handleSelectImage}
              remainingFiles={files.slice(currentFileIndex + 1)}
              totalFilesCount={files.length}
              onProcessRemaining={handleProcessRemaining}
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
                  log.info('Batch processing cancelled by user')
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
                    setImageMasks(new Map()) // 重置所有masks
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
