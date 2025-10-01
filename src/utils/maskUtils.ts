/**
 * Mask工具函数集
 * 统一mask创建、绘制、转换逻辑
 */

import { Line, drawLines } from '../types/canvas'
import { CANVAS_COLOR_BLACK, CANVAS_COLOR_WHITE } from '../constants'

export interface MaskCanvasOptions {
  width: number
  height: number
  backgroundColor?: string
  maskColor?: string
}

/**
 * 创建mask canvas
 * 统一替代App和Editor中的重复实现
 *
 * @param masks - Line数组（绝对坐标）
 * @param options - Canvas选项
 * @returns 创建的mask canvas
 */
export function createMaskCanvas(
  masks: Line[],
  options: MaskCanvasOptions
): HTMLCanvasElement {
  const {
    width,
    height,
    backgroundColor = CANVAS_COLOR_BLACK,
    maskColor = CANVAS_COLOR_WHITE,
  } = options

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // 设置背景
  ctx.fillStyle = backgroundColor
  ctx.fillRect(0, 0, width, height)

  // 绘制masks（使用统一的drawLines）
  const validMasks = masks.filter(mask => mask.pts.length > 0)
  drawLines(ctx, validMasks, maskColor)

  return canvas
}

/**
 * 从File或HTMLImageElement创建mask canvas
 * 自动获取图像尺寸
 *
 * @param masks - Line数组（绝对坐标）
 * @param imageSource - File或HTMLImageElement
 * @returns 创建的mask canvas
 */
export async function createMaskCanvasFromImage(
  masks: Line[],
  imageSource: File | HTMLImageElement
): Promise<HTMLCanvasElement> {
  let width: number
  let height: number

  if (imageSource instanceof File) {
    const bitmap = await createImageBitmap(imageSource)
    width = bitmap.width
    height = bitmap.height
    bitmap.close?.()
  } else {
    width = imageSource.naturalWidth
    height = imageSource.naturalHeight
  }

  return createMaskCanvas(masks, { width, height })
}
