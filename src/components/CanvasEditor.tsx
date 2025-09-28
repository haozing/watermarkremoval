import React, { useRef, useCallback, useMemo } from 'react'
import { Squares2X2Icon } from '@heroicons/react/24/outline'
import { useCanvasOptimization, useCanvasSize } from '../hooks/useCanvasOptimization'
import { Line, drawLines } from '../types/canvas'

interface CanvasEditorProps {
  context: CanvasRenderingContext2D | undefined
  original: HTMLImageElement
  isOriginalLoaded: boolean
  renders: HTMLImageElement[]
  lines: Line[]
  brushSize: number
  showBrush: boolean
  showOriginal: boolean
  separatorLeft: number
  isInpaintingLoading: boolean
  generateProgress: number
  onDraw: () => void
  onStartDrawing: () => void
  onStopDrawing: () => Promise<void>
  onMouseMove: (ev: MouseEvent) => void
  onBrushMove: (ev: MouseEvent) => void
  setSeparatorLeft: (left: number) => void
  setUseSeparator: (use: boolean) => void
  setContext: (ctx: CanvasRenderingContext2D) => void
}

const CanvasEditor: React.FC<CanvasEditorProps> = ({
  context,
  original,
  isOriginalLoaded,
  renders,
  lines,
  brushSize,
  showBrush,
  showOriginal,
  separatorLeft,
  isInpaintingLoading,
  generateProgress,
  onDraw,
  onStartDrawing,
  onStopDrawing,
  onMouseMove,
  onBrushMove,
  setSeparatorLeft,
  setUseSeparator,
  setContext,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasDiv = useRef<HTMLDivElement>(null)
  const separatorRef = useRef<HTMLDivElement>(null)
  const originalImgRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Canvas optimization hooks
  const canvasOptimization = useCanvasOptimization(canvasRef, {
    throttleMs: 16, // 60fps
    enableBatching: true,
    enableOffscreenCanvas: true
  })

  const { dimensions } = useCanvasSize(canvasRef, canvasDiv)

  // Optimized draw function
  const optimizedDraw = useCallback(
    (index = -1) => {
      if (!context) {
        return
      }

      canvasOptimization.draw(() => {
        context.clearRect(0, 0, context.canvas.width, context.canvas.height)

        const currRender = renders[index === -1 ? renders.length - 1 : index] ?? original
        const { canvas } = context

        const divWidth = canvasDiv.current!.offsetWidth
        const divHeight = canvasDiv.current!.offsetHeight

        // Calculate aspect ratio
        const imgAspectRatio = currRender.width / currRender.height
        const divAspectRatio = divWidth / divHeight

        let canvasWidth: number
        let canvasHeight: number

        // Scale based on aspect ratio
        if (divAspectRatio > imgAspectRatio) {
          canvasHeight = divHeight
          canvasWidth = currRender.width * (divHeight / currRender.height)
        } else {
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
      }, 2) // Priority 2 for draw operations
    },
    [context, lines, original, renders, canvasOptimization]
  )

  // Memoize scale factor for performance
  const scaleFactor = useMemo(() => {
    if (!context?.canvas || !canvasDiv.current) return 1

    const divWidth = canvasDiv.current.offsetWidth
    const divHeight = canvasDiv.current.offsetHeight
    const canvasWidth = context.canvas.width
    const canvasHeight = context.canvas.height

    return Math.min(divWidth / canvasWidth, divHeight / canvasHeight)
  }, [context?.canvas.width, context?.canvas.height, dimensions])

  const scaledBrushSize = useMemo(() => brushSize * scaleFactor, [brushSize, scaleFactor])

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
              canvasRef.current = r
              if (!context) {
                const ctx = r.getContext('2d')
                if (ctx) {
                  setContext(ctx)
                }
              }
            }
          }}
        />

        {/* Original image overlay */}
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
          ref={originalImgRef}
        >
          {/* Separator */}
          <div
            className={[
              'absolute top-0 right-0 pointer-events-none z-10',
              'bg-primary w-1',
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
              className="absolute py-2 px-1 rounded-md pointer-events-auto bg-primary"
              style={{ cursor: 'ew-resize' }}
              ref={separatorRef}
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

export default React.memo(CanvasEditor)