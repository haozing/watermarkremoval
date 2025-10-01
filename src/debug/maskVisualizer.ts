/**
 * Mask调试可视化工具
 * 仅在开发环境使用
 */

import { Line } from '../types/canvas'
import { downloadImage } from '../utils'

const IS_DEBUG = process.env.NODE_ENV === 'development'

export interface VisualizationOptions {
  type?: string
  originalImageSize?: { width: number; height: number }
  imageSize?: { width: number; height: number }
  canvasSize?: { width: number; height: number }
  scaleFactors?: { x: number; y: number }
  masksCount?: number
}

/**
 * 创建mask可视化（仅开发环境）
 *
 * @param imageFile - 要可视化的图像文件
 * @param masks - mask数组
 * @param filename - 保存的文件名（不含扩展名）
 * @param debugInfo - 调试信息
 */
export async function createMaskVisualization(
  imageFile: File,
  masks: Line[],
  filename: string,
  debugInfo?: VisualizationOptions
): Promise<void> {
  if (!IS_DEBUG) {
    // 生产环境直接返回，不执行任何操作
    return
  }

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
    masks.forEach((mask, index) => {
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
        drawCoordinateLabels(ctx, mask, index)
      }
    })
    ctx.restore()

    // Add debug info overlay
    if (debugInfo) {
      drawDebugInfo(ctx, imageFile.name, bitmap, masks, debugInfo)
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
}

/**
 * 绘制坐标标签
 */
function drawCoordinateLabels(
  ctx: CanvasRenderingContext2D,
  mask: Line,
  index: number
) {
  ctx.fillStyle = 'yellow'
  ctx.font = '14px Arial'
  ctx.strokeStyle = 'black'
  ctx.lineWidth = 1

  const startPt = mask.pts[0]
  const endPt = mask.pts[mask.pts.length - 1]

  // Start point
  const startText = `M${index}-S(${startPt.x.toFixed(1)},${startPt.y.toFixed(
    1
  )})`
  ctx.strokeText(startText, startPt.x + 5, startPt.y - 5)
  ctx.fillText(startText, startPt.x + 5, startPt.y - 5)

  // End point
  const endText = `M${index}-E(${endPt.x.toFixed(1)},${endPt.y.toFixed(1)})`
  ctx.strokeText(endText, endPt.x + 5, endPt.y + 15)
  ctx.fillText(endText, endPt.x + 5, endPt.y + 15)
}

/**
 * 绘制调试信息
 */
function drawDebugInfo(
  ctx: CanvasRenderingContext2D,
  fileName: string,
  bitmap: ImageBitmap,
  masks: Line[],
  debugInfo: VisualizationOptions
) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.fillRect(10, 10, 400, 120)

  ctx.fillStyle = 'white'
  ctx.font = '12px monospace'
  let yPos = 30

  ctx.fillText(`File: ${fileName}`, 20, yPos)
  yPos += 15
  ctx.fillText(`Image Size: ${bitmap.width} x ${bitmap.height}`, 20, yPos)
  yPos += 15
  ctx.fillText(`Masks Count: ${masks.length}`, 20, yPos)
  yPos += 15
  ctx.fillText(
    `Total Points: ${masks.reduce((sum, m) => sum + m.pts.length, 0)}`,
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
