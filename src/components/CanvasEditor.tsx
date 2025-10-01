import React, {
  useRef,
  useCallback,
  useMemo,
  useImperativeHandle,
  forwardRef,
} from 'react'
import {
  useCanvasOptimization,
  useCanvasSize,
} from '../hooks/useCanvasOptimization'
import { Line, drawLines } from '../types/canvas'
import { log } from '../utils/logger'

export interface CanvasEditorRef {
  draw: (index?: number) => void
}

interface CanvasEditorProps {
  context: CanvasRenderingContext2D | undefined
  original: HTMLImageElement
  isOriginalLoaded: boolean
  renders: HTMLImageElement[]
  lines: Line[]
  brushSize: number
  showBrush: boolean
  separatorLeft: number
  isInpaintingLoading: boolean
  generateProgress: number
  pendingMasks: Line[]
  useSeparator: boolean
  onDraw: () => void
  onStartDrawing: () => void
  onStopDrawing: () => Promise<void>
  onMouseMove: (ev: MouseEvent) => void
  onBrushMove: (ev: MouseEvent) => void
  setSeparatorLeft: (left: number) => void
  setUseSeparator: (use: boolean) => void
  setContext: (ctx: CanvasRenderingContext2D) => void
}

const CanvasEditor = forwardRef<CanvasEditorRef, CanvasEditorProps>(
  (
    {
      context,
      original,
      isOriginalLoaded,
      renders,
      lines,
      brushSize,
      showBrush,
      separatorLeft,
      isInpaintingLoading,
      generateProgress,
      pendingMasks,
      useSeparator,
      onDraw,
      onStartDrawing,
      onStopDrawing,
      onMouseMove,
      onBrushMove,
      setSeparatorLeft,
      setUseSeparator,
      setContext,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const canvasDiv = useRef<HTMLDivElement>(null)
    const modalRef = useRef<HTMLDivElement>(null)

    // Canvas optimization hooks - 修复后重新启用
    const canvasOptimization = useCanvasOptimization(canvasRef, {
      throttleMs: 16, // 60fps
      enableBatching: false, // 禁用batching避免复杂依赖
      enableOffscreenCanvas: false, // 禁用offscreen避免ref依赖问题
    })

    // Optimized draw function
    const optimizedDraw = useCallback(
      (index = -1) => {
        if (!context) {
          return
        }

        canvasOptimization.draw(() => {
          context.clearRect(0, 0, context.canvas.width, context.canvas.height)

          const currRender =
            renders[index === -1 ? renders.length - 1 : index] ?? original
          const { canvas } = context

          // 检查图像是否已完全加载（React 18时序修复）
          if (!currRender.width || !currRender.height) {
            return
          }

          // 采用old项目的简单直接方式计算Canvas尺寸
          const divWidth = canvasDiv.current!.offsetWidth
          const divHeight = canvasDiv.current!.offsetHeight

          // 计算宽高比
          const imgAspectRatio = currRender.width / currRender.height
          const divAspectRatio = divWidth / divHeight

          let canvasWidth: number
          let canvasHeight: number

          // 比较宽高比以决定如何缩放（采用old项目的逻辑）
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

          // currentLine已经是canvas坐标，直接绘制
          drawLines(context, [currentLine])

          // 额外绘制所有待处理的mask（用不同颜色区分）
          if (pendingMasks.length > 0) {
            const tempContext = context
            tempContext.save()
            tempContext.globalAlpha = 0.6 // 半透明

            // 将相对坐标转换为显示坐标
            if (!original.naturalWidth || !original.naturalHeight) {
              log.warn('原图尺寸未加载，跳过绘制待处理masks')
            } else {
              const displayPendingMasks = pendingMasks.map(mask => ({
                ...mask,
                size: mask.size ? mask.size * canvas.width : mask.size,
                pts: mask.pts.map(pt => ({
                  x: pt.x * canvas.width,
                  y: pt.y * canvas.height,
                })),
              }))

              log.debug('绘制待处理masks', {
                masksCount: pendingMasks.length,
                firstMaskRelative: {
                  pt: pendingMasks[0]?.pts[0],
                  size: pendingMasks[0]?.size,
                },
                firstMaskDisplay: {
                  pt: displayPendingMasks[0]?.pts[0],
                  size: displayPendingMasks[0]?.size,
                },
              })

              displayPendingMasks.forEach(mask => {
                drawLines(tempContext, [mask], 'rgba(255, 255, 0, 0.8)') // 黄色半透明
              })
            }

            tempContext.restore()
          }
        }, 2) // Priority 2 for draw operations
      },
      [context, lines, original, renders, canvasOptimization, pendingMasks]
    )

    // Expose draw method to parent component
    useImperativeHandle(
      ref,
      () => ({
        draw: optimizedDraw,
      }),
      [optimizedDraw]
    )

    // Memoize scale factor for performance
    const scaleFactor = useMemo(() => {
      if (!context?.canvas || !canvasDiv.current) return 1

      const divWidth = canvasDiv.current.offsetWidth
      const divHeight = canvasDiv.current.offsetHeight
      const canvasWidth = context.canvas.width
      const canvasHeight = context.canvas.height

      return Math.min(divWidth / canvasWidth, divHeight / canvasHeight)
    }, [context?.canvas.width, context?.canvas.height]) // 移除dimensions依赖

    const scaledBrushSize = useMemo(
      () => brushSize * scaleFactor,
      [brushSize, scaleFactor]
    )

    // 鼠标事件处理
    React.useEffect(() => {
      const canvas = context?.canvas
      if (!canvas) {
        return
      }

      const onMouseMove = (ev: MouseEvent) => {
        onBrushMove(ev)
      }

      const onPaint = (px: number, py: number) => {
        const currLine = lines[lines.length - 1]

        // 直接存储canvas坐标，不做任何转换
        currLine.pts.push({ x: px, y: py })
        optimizedDraw()
      }

      const onMouseDrag = (ev: MouseEvent) => {
        const px = ev.offsetX - canvas.offsetLeft
        const py = ev.offsetY - canvas.offsetTop
        onPaint(px, py)
      }

      const onPointerUp = async () => {
        if (!original.src) {
          return
        }
        if (lines.slice(-1)[0]?.pts.length === 0) {
          return
        }

        canvas.removeEventListener('mousemove', onMouseDrag)
        canvas.removeEventListener('mouseup', onPointerUp)

        await onStopDrawing()
      }

      const onTouchMove = (ev: TouchEvent) => {
        ev.preventDefault()
        ev.stopPropagation()
        const currLine = lines[lines.length - 1]
        const coords = canvas.getBoundingClientRect()

        // 直接存储canvas坐标，不做任何转换
        const touchX = ev.touches[0].clientX - coords.x
        const touchY = ev.touches[0].clientY - coords.y

        currLine.pts.push({
          x: touchX,
          y: touchY,
        })
        optimizedDraw()
      }

      const onPointerStart = () => {
        if (!original.src) {
          return
        }
        const currLine = lines[lines.length - 1]

        // 直接存储brushSize，不做任何转换
        currLine.size = brushSize

        canvas.addEventListener('mousemove', onMouseDrag)
        canvas.addEventListener('mouseup', onPointerUp)
        onStartDrawing()
      }

      canvas.addEventListener('mousemove', onMouseMove)
      canvas.addEventListener('touchstart', onPointerStart)
      canvas.addEventListener('touchmove', onTouchMove)
      canvas.addEventListener('touchend', onPointerUp)
      canvas.onmousedown = onPointerStart

      return () => {
        canvas.removeEventListener('mousemove', onMouseDrag)
        canvas.removeEventListener('mousemove', onMouseMove)
        canvas.removeEventListener('mouseup', onPointerUp)
        canvas.removeEventListener('touchstart', onPointerStart)
        canvas.removeEventListener('touchmove', onTouchMove)
        canvas.removeEventListener('touchend', onPointerUp)
        canvas.onmousedown = null
      }
    }, [
      context,
      lines,
      original.src,
      brushSize,
      onBrushMove,
      onStartDrawing,
      onStopDrawing,
      optimizedDraw,
    ])

    return (
      <div
        className="flex-grow flex justify-center my-2 relative"
        style={{ width: '70vw' }}
        ref={canvasDiv}
      >
        <div className="relative">
          <canvas
            className="rounded-sm"
            style={showBrush ? { cursor: 'none' } : {}}
            ref={r => {
              if (r) {
                ;(
                  canvasRef as React.MutableRefObject<HTMLCanvasElement | null>
                ).current = r
                if (!context) {
                  const ctx = r.getContext('2d')
                  if (ctx) {
                    setContext(ctx)
                  }
                }
              }
            }}
          />

          {/* Loading overlay */}
          {isInpaintingLoading && (
            <div className="z-10 bg-white absolute bg-opacity-80 top-0 left-0 right-0 bottom-0 h-full w-full flex justify-center items-center">
              <div ref={modalRef} className="text-xl space-y-5 w-4/5 sm:w-1/2">
                <p>正在处理中，请耐心等待。。。</p>
                <p>It is being processed, please be patient...</p>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${generateProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
)

export default React.memo(CanvasEditor)
