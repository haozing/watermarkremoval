import cv from 'opencv-ts'

interface MatPoolItem {
  mat: any
  inUse: boolean
  lastUsed: number
}

class MemoryManager {
  private matPool: MatPoolItem[] = []
  private readonly maxPoolSize = 20
  private readonly cleanupInterval = 30000 // 30 seconds
  private cleanupTimer: number | null = null
  private memoryWarningThreshold = 50 * 1024 * 1024 // 50MB (降低阈值)

  constructor() {
    this.startCleanupTimer()
    this.setupMemoryMonitoring()
  }

  /**
   * Get a Mat from the pool or create a new one
   */
  getMat(rows?: number, cols?: number, type?: number): any {
    // Try to find an unused Mat with compatible dimensions
    const compatible = this.matPool.find(
      item =>
        !item.inUse &&
        (!rows || item.mat.rows === rows) &&
        (!cols || item.mat.cols === cols)
    )

    if (compatible) {
      compatible.inUse = true
      compatible.lastUsed = Date.now()
      return compatible.mat
    }

    // Create new Mat if pool doesn't have a compatible one
    const mat = new cv.Mat()

    // Add to pool if there's space
    if (this.matPool.length < this.maxPoolSize) {
      this.matPool.push({
        mat,
        inUse: true,
        lastUsed: Date.now(),
      })
    }

    return mat
  }

  /**
   * Return a Mat to the pool
   */
  releaseMat(mat: any): void {
    const poolItem = this.matPool.find(item => item.mat === mat)
    if (poolItem) {
      poolItem.inUse = false
      poolItem.lastUsed = Date.now()
    } else {
      // If Mat is not in pool, delete it immediately
      this.safeDeletMat(mat)
    }
  }

  /**
   * Safely delete a Mat with error handling
   */
  private safeDeletMat(mat: any): void {
    try {
      if (mat && !mat.isDeleted()) {
        mat.delete()
      }
    } catch (error) {
      console.warn('Error deleting Mat:', error)
    }
  }

  /**
   * Clean up unused Mats from the pool
   */
  private cleanup(): void {
    const now = Date.now()
    const maxAge = 60000 // 1 minute

    this.matPool = this.matPool.filter(item => {
      if (!item.inUse && now - item.lastUsed > maxAge) {
        this.safeDeletMat(item.mat)
        return false
      }
      return true
    })

    console.log(`Memory cleanup: ${this.matPool.length} Mats in pool`)
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = window.setInterval(() => {
      this.cleanup()
    }, this.cleanupInterval)
  }

  /**
   * Setup memory monitoring
   */
  private setupMemoryMonitoring(): void {
    if ('memory' in performance) {
      setInterval(() => {
        const memInfo = (performance as any).memory
        if (memInfo.usedJSHeapSize > this.memoryWarningThreshold) {
          console.warn('High memory usage detected:', {
            used: Math.round(memInfo.usedJSHeapSize / 1024 / 1024) + 'MB',
            total: Math.round(memInfo.totalJSHeapSize / 1024 / 1024) + 'MB',
            poolSize: this.matPool.length,
          })

          // Force cleanup when memory is high
          this.forceCleanup()

          // 触发垃圾回收（如果可用）
          if (window.gc) {
            console.log('Triggering garbage collection')
            window.gc()
          }
        }
      }, 5000) // Check every 5 seconds (更频繁检查)
    }
  }

  /**
   * Force cleanup of all unused Mats
   */
  private forceCleanup(): void {
    this.matPool = this.matPool.filter(item => {
      if (!item.inUse) {
        this.safeDeletMat(item.mat)
        return false
      }
      return true
    })
  }

  /**
   * Get current memory usage stats
   */
  getStats(): {
    poolSize: number
    inUse: number
    available: number
    memoryUsage?: number
  } {
    const inUse = this.matPool.filter(item => item.inUse).length
    const stats = {
      poolSize: this.matPool.length,
      inUse,
      available: this.matPool.length - inUse,
    }

    if ('memory' in performance) {
      return {
        ...stats,
        memoryUsage: Math.round(
          (performance as any).memory.usedJSHeapSize / 1024 / 1024
        ),
      }
    }

    return stats
  }

  /**
   * Destroy the memory manager and clean up all resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    // Clean up all Mats in pool
    this.matPool.forEach(item => {
      this.safeDeletMat(item.mat)
    })
    this.matPool = []
  }
}

// Singleton instance
const memoryManager = new MemoryManager()

export default memoryManager

/**
 * Higher-order function to automatically manage Mat lifecycle
 */
export function withMatCleanup<T extends any[], R>(
  fn: (...args: T) => R,
  matExtractor?: (result: R) => any[]
): (...args: T) => R {
  return (...args: T): R => {
    const matsToCleanup: any[] = []

    try {
      const result = fn(...args)

      // If matExtractor is provided, extract Mats from result
      if (matExtractor && result) {
        const extractedMats = matExtractor(result)
        extractedMats.forEach(mat => memoryManager.releaseMat(mat))
      }

      return result
    } finally {
      // Clean up any Mats that were created during execution
      matsToCleanup.forEach(mat => memoryManager.releaseMat(mat))
    }
  }
}

/**
 * Auto-cleanup decorator for functions that work with Mats
 */
export function autoCleanup(matsCreated: string[]) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value

    descriptor.value = function (...args: any[]) {
      const createdMats: any[] = []

      try {
        const result = method.apply(this, args)
        return result
      } finally {
        // Clean up created Mats
        createdMats.forEach(mat => memoryManager.releaseMat(mat))
      }
    }
  }
}
