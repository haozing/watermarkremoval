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
import CanvasEditor from './components/CanvasEditor'
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
  const [showOriginal, setShowOriginal] = useState(false)
  const [isInpaintingLoading, setIsProcessingLoading] = useState(false)
  const [generateProgress, setGenerateProgress] = useState(0)
  const [batchMode, setBatchMode] = useState(false)
  const [pendingMasks, setPendingMasks] = useState<Line[]>([])
  const [showBatchButton, setShowBatchButton] = useState(false)
  const modalRef = useRef(null)
  const [separator, setSeparator] = useState<HTMLDivElement>()
  const [useSeparator, setUseSeparator] = useState(false)
  const [originalImg, setOriginalImg] = useState<HTMLDivElement>()
  const [separatorLeft, setSeparatorLeft] = useState(0)
  const historyListRef = useRef<HTMLDivElement>(null)
  const canvasDiv = useRef<HTMLDivElement>(null)
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

  const draw = useCallback(
    (index = -1) => {
      if (!context) {
        return
      }

      context.clearRect(0, 0, context.canvas.width, context.canvas.height)
      const currRender =
        renders[index === -1 ? renders.length - 1 : index] ?? original
      const { canvas } = context

      const divWidth = canvasDiv.current!.offsetWidth
      const divHeight = canvasDiv.current!.offsetHeight

      // 计算宽高比
      const imgAspectRatio = currRender.width / currRender.height
      const divAspectRatio = divWidth / divHeight

      let canvasWidth
      let canvasHeight

      // 比较宽高比以决定如何缩放
      if (divAspectRatio > imgAspectRatio) {
        // div 较宽，基于高度缩放
        canvasHeight = divHeight
        canvasWidth = currRender.width * (divHeight / currRender.height)
      } else {
        // div 较窄，基于宽度缩放
        canvasWidth = divWidth
        canvasHeight = currRender.height * (divWidth / currRender.width)
      }

      canvas.width = canvasWidth
      canvas.height = canvasHeight

      if (currRender?.src) {
        context.drawImage(currRender, 0, 0, canvas.width, canvas.height)
      } else {
        context.drawImage(original, 0, 0, canvas.width, canvas.height)
      }
      const currentLine = lines[lines.length - 1]
      drawLines(context, [currentLine])

      // 批量模式下额外绘制所有待处理的mask（用不同颜色区分）
      if (batchMode && pendingMasks.length > 0) {
        const tempContext = context
        tempContext.save()
        tempContext.globalAlpha = 0.6 // 半透明
        pendingMasks.forEach(mask => {
          drawLines(tempContext, [mask], 'rgba(255, 255, 0, 0.8)') // 黄色半透明
        })
        tempContext.restore()
      }
    },
    [context, lines, original, renders, batchMode, pendingMasks]
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

    // 更新历史列表滚动
    if (historyListRef.current) {
      const { scrollWidth, clientWidth } = historyListRef.current
      if (scrollWidth > clientWidth) {
        historyListRef.current.scrollTo(scrollWidth, 0)
      }
    }

    loading.close()
    draw()
  }, [pendingMasks, createCombinedMask, renders, file, onloading, showError, historyListRef, draw])

  // Draw once the original image is loaded
  useEffect(() => {
    if (!context?.canvas) {
      return
    }
    if (isOriginalLoaded) {
      draw()
    }
  }, [context?.canvas, draw, original, isOriginalLoaded, windowSize])

  // Handle mouse interactions
  useEffect(() => {
    const canvas = context?.canvas
    if (!canvas) {
      return
    }
    const onMouseMove = (ev: MouseEvent) => {
      if (brushRef.current) {
        const x = ev.pageX - scaledBrushSize / 2
        const y = ev.pageY - scaledBrushSize / 2

        brushRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
      }
    }
    const onPaint = (px: number, py: number) => {
      const currLine = lines[lines.length - 1]
      currLine.pts.push({ x: px, y: py })
      draw()
    }
    const onMouseDrag = (ev: MouseEvent) => {
      const px = ev.offsetX - canvas.offsetLeft
      const py = ev.offsetY - canvas.offsetTop
      onPaint(px, py)
    }

    const onPointerUp = async () => {
      if (!original.src || showOriginal) {
        return
      }
      if (lines.slice(-1)[0]?.pts.length === 0) {
        return
      }

      canvas.removeEventListener('mousemove', onMouseDrag)
      canvas.removeEventListener('mouseup', onPointerUp)

      if (batchMode) {
        // 批量模式：只累积mask，不立即处理
        const currentLine = lines[lines.length - 1]
        const newPendingMasks = [...pendingMasks, currentLine]
        setPendingMasks(newPendingMasks)
        setLines([...lines, { pts: [], src: '' } as Line]) // 准备下一条线
        setShowBatchButton(true)
        draw()
        return
      }

      // 原有的立即处理逻辑
      const loading = onloading()
      refreshCanvasMask()
      try {
        const start = Date.now()
        console.log('inpaint_start')
        // each time based on the last result, the first is the original
        const newFile = renders.slice(-1)[0] ?? file
        if (!maskCanvasRef.current) {
          throw new Error('mask canvas not initialized')
        }
        const res = await inpaint(newFile, maskCanvasRef.current.toDataURL())
        if (!res) {
          throw new Error('empty response')
        }
        // TODO: fix the render if it failed loading
        const newRender = new Image()
        newRender.dataset.id = Date.now().toString()
        await loadImage(newRender, res)
        renders.push(newRender)
        lines.push({ pts: [], src: '' } as Line)
        setRenders([...renders])
        setLines([...lines])
        console.log('inpaint_processed', {
          duration: Date.now() - start,
        })
      } catch (e: any) {
        console.log('inpaint_failed', {
          error: e,
        })
        showError('Processing Failed', e.message ? e.message : e.toString())
      }
      if (historyListRef.current) {
        const { scrollWidth, clientWidth } = historyListRef.current
        if (scrollWidth > clientWidth) {
          historyListRef.current.scrollTo(scrollWidth, 0)
        }
      }
      loading.close()
      draw()
    }
    canvas.addEventListener('mousemove', onMouseMove)

    const onTouchMove = (ev: TouchEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      const currLine = lines[lines.length - 1]
      const coords = canvas.getBoundingClientRect()
      currLine.pts.push({
        x: ev.touches[0].clientX - coords.x,
        y: ev.touches[0].clientY - coords.y,
      })
      draw()
    }
    const onPointerStart = () => {
      if (!original.src || showOriginal) {
        return
      }
      const currLine = lines[lines.length - 1]
      currLine.size = brushSize
      canvas.addEventListener('mousemove', onMouseDrag)
      canvas.addEventListener('mouseup', onPointerUp)
      // onPaint(e)
    }

    canvas.addEventListener('touchstart', onPointerStart)
    canvas.addEventListener('touchmove', onTouchMove)
    canvas.addEventListener('touchend', onPointerUp)
    canvas.onmouseenter = () => {
      window.clearTimeout(hideBrushTimeout)
      setShowBrush(true && !showOriginal)
    }
    canvas.onmouseleave = () => setShowBrush(false)
    canvas.onmousedown = onPointerStart

    return () => {
      canvas.removeEventListener('mousemove', onMouseDrag)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseup', onPointerUp)
      canvas.removeEventListener('touchstart', onPointerStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onPointerUp)
      canvas.onmouseenter = null
      canvas.onmouseleave = null
      canvas.onmousedown = null
    }
  }, [
    brushSize,
    context,
    file,
    draw,
    lines,
    refreshCanvasMask,
    original.src,
    renders,
    showOriginal,
    hideBrushTimeout,
  ])

  useEffect(() => {
    if (!separator || !originalImg) return

    const separatorMove = (ev: MouseEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      if (context?.canvas) {
        const { width } = context?.canvas
        const canvasRect = context?.canvas.getBoundingClientRect()
        const separatorOffsetLeft = ev.pageX - canvasRect.left
        if (separatorOffsetLeft <= width && separatorOffsetLeft >= 0) {
          setSeparatorLeft(separatorOffsetLeft)
        } else if (separatorOffsetLeft < 0) {
          setSeparatorLeft(0)
        } else if (separatorOffsetLeft > width) {
          setSeparatorLeft(width)
        }
      }
    }

    const separatorDown = () => {
      window.addEventListener('mousemove', separatorMove)
      setUseSeparator(true)
    }

    const separatorUp = () => {
      window.removeEventListener('mousemove', separatorMove)
      setUseSeparator(false)
    }

    separator.addEventListener('mousedown', separatorDown)
    window.addEventListener('mouseup', separatorUp)

    return () => {
      separator.removeEventListener('mousedown', separatorDown)
      window.removeEventListener('mouseup', separatorUp)
    }
  }, [separator, context])

  function download() {
    const currRender = renders.slice(-1)[0] ?? original
    downloadImage(currRender.currentSrc, 'IMG')
  }

  const undo = useCallback(async () => {
    if (batchMode && pendingMasks.length > 0) {
      // 批量模式下撤销最后一个mask
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

    // 原有撤销逻辑
    const l = lines
    l.pop()
    l.pop()
    setLines([...l, { pts: [], src: '' }])
    const r = renders
    r.pop()
    setRenders([...r])
  }, [lines, renders, batchMode, pendingMasks, draw])

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
        'flex flex-col items-center h-full justify-between',
        isInpaintingLoading ? 'animate-pulse-fast pointer-events-none' : '',
      ].join(' ')}
    >
      {/* History List */}
      <HistoryList
        renders={renders}
        onBackTo={backTo}
        onPreview={draw}
        onPreviewEnd={draw}
      />
      {/* 画图 */}
      <div
        className={[
          'flex-grow',
          'flex justify-center',
          'my-2',
          'relative',
        ].join(' ')}
        style={{
          width: '70vw',
        }}
        ref={canvasDiv}
      >
        <div className="relative">
          <canvas
            className="rounded-sm"
            style={showBrush ? { cursor: 'none' } : {}}
            ref={r => {
              if (r && !context) {
                const ctx = r.getContext('2d')
                if (ctx) {
                  setContext(ctx)
                }
              }
            }}
          />
          <div
            className={[
              'absolute top-0 right-0 pointer-events-none',
              showOriginal ? '' : 'overflow-hidden',
            ].join(' ')}
            style={{
              width: showOriginal ? `${context?.canvas.width}px` : '0px',
              height: context?.canvas.height,
              transitionProperty: 'width, height',
              transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
              transitionDuration: '300ms',
            }}
            ref={r => {
              if (r && !originalImg) {
                setOriginalImg(r)
              }
            }}
          >
            <div
              className={[
                'absolute top-0 right-0 pointer-events-none z-10',
                useSeparator ? 'bg-black text-white' : 'bg-primary ',
                'w-1',
                'flex items-center justify-center',
                'separator',
              ].join(' ')}
              style={{
                left: `${separatorLeft}px`,
                height: context?.canvas.height,
                transitionProperty: 'width, height',
                transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                transitionDuration: '300ms',
              }}
            >
              <span className="absolute left-1 bottom-0 p-1 bg-opacity-25 bg-black rounded text-white select-none">
                original
              </span>
              <div
                className={[
                  'absolute py-2 px-1 rounded-md pointer-events-auto',
                  useSeparator ? 'bg-black' : 'bg-primary ',
                ].join(' ')}
                style={{ cursor: 'ew-resize' }}
                ref={r => {
                  if (r && !separator) {
                    setSeparator(r)
                  }
                }}
              >
                <Squares2X2Icon
                  className="w-5 h-5"
                  style={{ cursor: 'ew-resize' }}
                />
              </div>
            </div>
            <img
              className="absolute right-0"
              src={original.src}
              alt="original"
              width={`${context?.canvas.width}px`}
              height={`${context?.canvas.height}px`}
              style={{
                width: `${context?.canvas.width}px`,
                height: `${context?.canvas.height}px`,
                maxWidth: 'none',
                clipPath: `inset(0 0 0 ${separatorLeft}px)`,
              }}
            />
          </div>
          {isInpaintingLoading && (
            <div className="z-10 bg-white absolute bg-opacity-80 top-0 left-0 right-0 bottom-0  h-full w-full flex justify-center items-center">
              <div ref={modalRef} className="text-xl space-y-5 w-4/5 sm:w-1/2">
                <p>正在处理中，请耐心等待。。。</p>
                <p>It is being processed, please be patient...</p>
                <Progress percent={generateProgress} />
              </div>
            </div>
          )}
        </div>
      </div>

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
      <div
        className={[
          'flex-shrink-0',
          'bg-white rounded-md border border-gray-300 hover:border-gray-400 shadow-md hover:shadow-lg p-4 transition duration-200 ease-in-out',
          'flex items-center w-full max-w-4xl py-6 mb-4, justify-between',
          'flex-col space-y-2 sm:space-y-0 sm:flex-row sm:space-x-5',
        ].join(' ')}
      >
        {renders.length > 0 && (
          <Button
            primary
            onClick={undo}
            icon={
              <svg
                className="w-6 h-6"
                width="19"
                height="9"
                viewBox="0 0 19 9"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 1C2 0.447715 1.55228 0 1 0C0.447715 0 0 0.447715 0 1H2ZM1 8H0V9H1V8ZM8 9C8.55228 9 9 8.55229 9 8C9 7.44771 8.55228 7 8 7V9ZM16.5963 7.42809C16.8327 7.92721 17.429 8.14016 17.9281 7.90374C18.4272 7.66731 18.6402 7.07103 18.4037 6.57191L16.5963 7.42809ZM16.9468 5.83205L17.8505 5.40396L16.9468 5.83205ZM0 1V8H2V1H0ZM1 9H8V7H1V9ZM1.66896 8.74329L6.66896 4.24329L5.33104 2.75671L0.331035 7.25671L1.66896 8.74329ZM16.043 6.26014L16.5963 7.42809L18.4037 6.57191L17.8505 5.40396L16.043 6.26014ZM6.65079 4.25926C9.67554 1.66661 14.3376 2.65979 16.043 6.26014L17.8505 5.40396C15.5805 0.61182 9.37523 -0.710131 5.34921 2.74074L6.65079 4.25926Z"
                  fill="currentColor"
                />
              </svg>
            }
          >
            {m.undo()}
          </Button>
        )}

        <Button
          primary={batchMode}
          onClick={() => setBatchMode(!batchMode)}
          icon={
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14-7H3m16 14H7m0 0l3-3m-3 3l3 3"
              />
            </svg>
          }
        >
          {batchMode ? m.exit_batch() : m.batch_mode()}
        </Button>

        <Slider
          label={m.bruch_size()}
          min={10}
          max={200}
          value={brushSize}
          onChange={handleSliderChange}
          onStart={handleSliderStart}
        />
        <Button
          primary={showOriginal}
          icon={<EyeIcon className="w-6 h-6" />}
          onUp={() => {
            setShowOriginal(!showOriginal)
            setTimeout(() => setSeparatorLeft(0), 300)
          }}
        >
          {m.original()}
        </Button>

        {showBatchButton && (
          <Button
            primary
            onClick={processBatch}
            className="bg-green-500 hover:bg-green-600 text-white"
            icon={
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            }
          >
            {m.process_all()} ({pendingMasks.length})
          </Button>
        )}

        {pendingMasks.length > 0 && (
          <Button
            onClick={() => {
              setPendingMasks([])
              setShowBatchButton(false)
              setLines([{ pts: [], src: '' }])
              draw()
            }}
            icon={
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            }
          >
            {m.clear_marks()}
          </Button>
        )}

        <Button
          primary
          icon={<ArrowDownTrayIcon className="w-6 h-6" />}
          onClick={download}
        >
          {m.download()}
        </Button>
      </div>
    </div>
  )
}
