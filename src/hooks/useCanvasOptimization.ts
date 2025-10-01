import { useCallback, useRef, useState, useEffect } from 'react'
import { log } from '../utils/logger'

interface CanvasOptimizationOptions {
  throttleMs?: number
  enableBatching?: boolean
  enableOffscreenCanvas?: boolean
}

interface CanvasOperation {
  id: string
  operation: () => void
  priority: number
}

export const useCanvasOptimization = (
  canvasRef: React.RefObject<HTMLCanvasElement>,
  options: CanvasOptimizationOptions = {}
) => {
  const {
    throttleMs = 16, // ~60fps
    enableBatching = true,
    enableOffscreenCanvas = false,
  } = options

  const [isDrawing, setIsDrawing] = useState(false)
  const operationQueue = useRef<CanvasOperation[]>([])
  const frameId = useRef<number | null>(null)
  const lastDrawTime = useRef(0)
  const offscreenCanvas = useRef<OffscreenCanvas | null>(null)
  const offscreenContext = useRef<OffscreenCanvasRenderingContext2D | null>(
    null
  )

  // Performance monitoring
  const performanceStats = useRef({
    drawCalls: 0,
    averageDrawTime: 0,
    totalDrawTime: 0,
    skippedFrames: 0,
  })

  // Initialize offscreen canvas if supported and enabled
  useEffect(() => {
    if (
      enableOffscreenCanvas &&
      typeof OffscreenCanvas !== 'undefined' &&
      canvasRef.current
    ) {
      const canvas = canvasRef.current
      offscreenCanvas.current = new OffscreenCanvas(canvas.width, canvas.height)
      offscreenContext.current = offscreenCanvas.current.getContext('2d')
    }
  }, [enableOffscreenCanvas, canvasRef])

  // Sync offscreen canvas size with main canvas
  const syncCanvasSize = useCallback(() => {
    if (offscreenCanvas.current && canvasRef.current) {
      const canvas = canvasRef.current
      if (
        offscreenCanvas.current.width !== canvas.width ||
        offscreenCanvas.current.height !== canvas.height
      ) {
        offscreenCanvas.current.width = canvas.width
        offscreenCanvas.current.height = canvas.height
      }
    }
  }, [canvasRef])

  // Throttled draw function
  const throttledDraw = useCallback(
    (operation: () => void, priority: number = 1) => {
      const now = performance.now()

      if (!enableBatching) {
        // Execute immediately if batching is disabled
        const startTime = performance.now()
        operation()
        const endTime = performance.now()

        // Update performance stats
        performanceStats.current.drawCalls++
        const drawTime = endTime - startTime
        performanceStats.current.totalDrawTime += drawTime
        performanceStats.current.averageDrawTime =
          performanceStats.current.totalDrawTime /
          performanceStats.current.drawCalls

        lastDrawTime.current = now
        return
      }

      // Add to operation queue
      const operationId = Math.random().toString(36).substring(2, 9)
      operationQueue.current.push({
        id: operationId,
        operation,
        priority,
      })

      // Sort by priority (higher priority first)
      operationQueue.current.sort((a, b) => b.priority - a.priority)

      // Schedule frame if not already scheduled
      if (!frameId.current) {
        frameId.current = requestAnimationFrame(() => {
          processOperationQueue()
        })
      }
    },
    [enableBatching]
  )

  // Process the operation queue
  const processOperationQueue = useCallback(() => {
    const now = performance.now()

    // Check if enough time has passed since last draw
    if (now - lastDrawTime.current < throttleMs) {
      performanceStats.current.skippedFrames++
      frameId.current = requestAnimationFrame(processOperationQueue)
      return
    }

    if (operationQueue.current.length === 0) {
      frameId.current = null
      setIsDrawing(false)
      return
    }

    setIsDrawing(true)
    const startTime = performance.now()

    // Execute all operations in the queue
    const operations = [...operationQueue.current]
    operationQueue.current = []

    try {
      // Use offscreen canvas if available
      const context =
        offscreenContext.current || canvasRef.current?.getContext('2d')
      if (!context) return

      // Execute operations
      operations.forEach(({ operation }) => {
        operation()
      })

      // Transfer from offscreen to main canvas if using offscreen rendering
      if (offscreenCanvas.current && canvasRef.current) {
        const mainContext = canvasRef.current.getContext('2d')
        if (mainContext) {
          syncCanvasSize()
          mainContext.clearRect(
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height
          )
          mainContext.drawImage(offscreenCanvas.current, 0, 0)
        }
      }
    } catch (error) {
      log.error('Canvas operation failed', error)
    }

    const endTime = performance.now()
    const drawTime = endTime - startTime

    // Update performance stats
    performanceStats.current.drawCalls++
    performanceStats.current.totalDrawTime += drawTime
    performanceStats.current.averageDrawTime =
      performanceStats.current.totalDrawTime /
      performanceStats.current.drawCalls

    lastDrawTime.current = now

    // Schedule next frame if there are more operations
    if (operationQueue.current.length > 0) {
      frameId.current = requestAnimationFrame(processOperationQueue)
    } else {
      frameId.current = null
      setIsDrawing(false)
    }
  }, [throttleMs, canvasRef, syncCanvasSize])

  // Clear operation queue
  const clearQueue = useCallback(() => {
    operationQueue.current = []
    if (frameId.current) {
      cancelAnimationFrame(frameId.current)
      frameId.current = null
    }
    setIsDrawing(false)
  }, [])

  // Batch multiple operations
  const batchOperations = useCallback(
    (operations: (() => void)[], priority: number = 1) => {
      const batchOperation = () => {
        operations.forEach(op => op())
      }
      throttledDraw(batchOperation, priority)
    },
    [throttledDraw]
  )

  // Get performance statistics
  const getPerformanceStats = useCallback(() => {
    return { ...performanceStats.current }
  }, [])

  // Reset performance statistics
  const resetPerformanceStats = useCallback(() => {
    performanceStats.current = {
      drawCalls: 0,
      averageDrawTime: 0,
      totalDrawTime: 0,
      skippedFrames: 0,
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (frameId.current) {
        cancelAnimationFrame(frameId.current)
      }
    }
  }, [])

  return {
    // Core functions
    draw: throttledDraw,
    batchOperations,
    clearQueue,

    // State
    isDrawing,

    // Performance monitoring
    getPerformanceStats,
    resetPerformanceStats,

    // Canvas references
    offscreenCanvas: offscreenCanvas.current,
    offscreenContext: offscreenContext.current,
  }
}

// Hook for canvas size optimization
export const useCanvasSize = (
  canvasRef: React.RefObject<HTMLCanvasElement>,
  containerRef?: React.RefObject<HTMLElement>
) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const resizeTimeoutRef = useRef<number>()

  const updateCanvasSize = useCallback(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const container = containerRef?.current || canvas.parentElement

    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const devicePixelRatio = window.devicePixelRatio || 1

    // Calculate optimal canvas size
    const displayWidth = containerRect.width
    const displayHeight = containerRect.height

    const canvasWidth = displayWidth * devicePixelRatio
    const canvasHeight = displayHeight * devicePixelRatio

    // Only update if size actually changed
    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth
      canvas.height = canvasHeight
      canvas.style.width = `${displayWidth}px`
      canvas.style.height = `${displayHeight}px`

      // Scale context to match device pixel ratio
      const context = canvas.getContext('2d')
      if (context) {
        context.scale(devicePixelRatio, devicePixelRatio)
      }

      setDimensions({ width: canvasWidth, height: canvasHeight })
    }
  }, [canvasRef, containerRef])

  // Debounced resize handler
  const handleResize = useCallback(() => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current)
    }

    resizeTimeoutRef.current = window.setTimeout(() => {
      updateCanvasSize()
    }, 100)
  }, [updateCanvasSize])

  useEffect(() => {
    updateCanvasSize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
    }
  }, [updateCanvasSize, handleResize])

  return {
    dimensions,
    updateCanvasSize,
  }
}
