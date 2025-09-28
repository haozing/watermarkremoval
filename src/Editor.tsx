/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import { ArrowDownTrayIcon, EyeIcon, Squares2X2Icon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useState, useRef, useMemo } from 'react'
import { useWindowSize } from 'react-use'
import inpaint from './adapters/inpainting'
import Button from './components/Button'
import Slider from './components/Slider'
import { downloadImage, loadImage, useImage } from './utils'
import Progress from './components/Progress'
import { useErrorNotification } from './components/ErrorNotification'
import { Line, drawLines } from './types/canvas'
import HistoryList from './components/HistoryList'
import CanvasEditor, { CanvasEditorRef } from './components/CanvasEditor'
import EditorToolbar from './components/EditorToolbar'
import * as m from './paraglide/messages'

interface EditorProps {
  file: File
}

const BRUSH_HIDE_ON_SLIDER_CHANGE_TIMEOUT = 2000
export default function Editor(props: EditorProps) {
  const { file } = props
  const { showError } = useErrorNotification()
  const [brushSize, setBrushSize] = useState(40)
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
  const [pendingMasks, setPendingMasks] = useState<Line[]>([])
  const [showBatchButton, setShowBatchButton] = useState(false)
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
    if (!context?.canvas.width || !context?.canvas.height || !maskCanvasRef.current) {
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
  const createCombinedMask = useCallback((masks: Line[]): HTMLCanvasElement => {
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
  }, [context?.canvas.width, context?.canvas.height])

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

  // 批量处理函数
  const processBatch = useCallback(async () => {
    if (pendingMasks.length === 0) return

    const loading = onloading()
    setShowBatchButton(false)

    try {
      console.log('batch_inpaint_start', { maskCount: pendingMasks.length })

      // 合并所有mask到一个canvas
      const combinedMask = createCombinedMask(pendingMasks)

      // 处理当前图像
      const currentImage = renders.slice(-1)[0] ?? file
      const result = await inpaint(currentImage, combinedMask.toDataURL())

      if (result) {
        const newRender = new Image()
        newRender.dataset.id = Date.now().toString()
        await loadImage(newRender, result)

        setRenders(prev => [...prev, newRender])
        setPendingMasks([]) // 清空待处理mask
        setLines([{ pts: [], src: '' }]) // 重置绘制线条

        console.log('batch_inpaint_processed', {
          maskCount: pendingMasks.length,
          resultUrl: result.substring(0, 50) + '...'
        })
      }
    } catch (error: any) {
      console.log('batch_inpaint_failed', {
        error: error,
        maskCount: pendingMasks.length
      })
      showError(m.batch_processing_failed(), error.message ? error.message : error.toString())
    }

    // 历史列表滚动现在由 HistoryList 组件自己处理

    loading.close()
    draw()
  }, [pendingMasks, createCombinedMask, renders, file, onloading, showError, draw])

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
  const handleBrushMove = useCallback((ev: MouseEvent) => {
    if (brushRef.current) {
      const x = ev.pageX - scaledBrushSize / 2
      const y = ev.pageY - scaledBrushSize / 2
      brushRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }
  }, [scaledBrushSize])

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
    const newPendingMasks = [...pendingMasks, currentLine]
    setPendingMasks(newPendingMasks)
    setLines([...lines, { pts: [], src: '' } as Line]) // 准备下一条线
    setShowBatchButton(true)
    // 历史列表滚动现在由 HistoryList 组件自己处理
  }, [
    original.src,
    lines,
    pendingMasks,
    onloading,
    refreshCanvasMask,
    renders,
    file,
    showError
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
    const currRender = renders.slice(-1)[0] ?? original
    downloadImage(currRender.currentSrc, 'IMG')
  }

  const handleClearMarks = useCallback(() => {
    setPendingMasks([])
    setShowBatchButton(false)
    setLines([{ pts: [], src: '' }])
  }, [])

  const undo = useCallback(async () => {
    if (pendingMasks.length > 0) {
      // 撤销最后一个mask
      const newPendingMasks = [...pendingMasks]
      newPendingMasks.pop()
      setPendingMasks(newPendingMasks)

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
  }, [lines, renders, pendingMasks, draw])

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

  const backTo = useCallback(
    (index: number) => {
      lines.splice(index + 1)
      setLines([...lines, { pts: [], src: '' }])
      renders.splice(index + 1)
      setRenders([...renders])
    },
    [renders, lines]
  )

  const History = useMemo(
    () =>
      renders.map((render, index) => {
        return (
          <div
            key={render.dataset.id}
            style={{
              position: 'relative',
              display: 'inline-block',
              flexShrink: 0,
            }}
          >
            <img
              src={render.src}
              alt="render"
              className="rounded-sm"
              style={{
                height: '90px',
              }}
            />
            <Button
              className="hover:opacity-100 opacity-0 cursor-pointer rounded-sm"
              style={{
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={() => backTo(index)}
              onEnter={() => draw(index)}
              onLeave={draw}
            >
              <div
                style={{
                  color: '#fff',
                  fontSize: '12px',
                  textAlign: 'center',
                }}
              >
                回到这
                <br />
                Back here
              </div>
            </Button>
          </div>
        )
      }),
    [renders, backTo]
  )

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
      }, BRUSH_HIDE_ON_SLIDER_CHANGE_TIMEOUT)
    )
  }


  return (
    <div
      className={[
        'flex flex-row h-full',
        isInpaintingLoading ? 'animate-pulse-fast pointer-events-none' : '',
      ].join(' ')}
    >
      {/* History List - Left sidebar */}
      <HistoryList
        renders={renders}
        onBackTo={backTo}
        onPreview={draw}
        onPreviewEnd={draw}
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
          onUndo={undo}
          onBrushSizeChange={handleSliderChange}
          onBrushSizeStart={handleSliderStart}
          onDownload={download}
          onProcessBatch={processBatch}
          onClearMarks={handleClearMarks}
        />
      </div>
    </div>
  )
}
