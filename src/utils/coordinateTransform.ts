/**
 * Canvas坐标转换工具
 * 处理display canvas坐标 ↔ 相对坐标(0-1) ↔ 图片绝对坐标的转换
 *
 * 坐标系统说明：
 * 1. Canvas物理坐标：canvas.width/height (物理像素 = 逻辑尺寸 × devicePixelRatio)
 * 2. Canvas逻辑坐标：canvas.clientWidth/clientHeight (CSS像素，鼠标事件使用此坐标系)
 * 3. 相对坐标：0-1范围，分辨率无关，业界标准（YOLO、Google Vision API等）
 * 4. 图片绝对坐标：实际图片像素坐标
 */

import { log } from './logger'

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

/**
 * 验证并修正相对坐标到0-1范围
 */
export const clampRelativeCoordinate = (coord: Point): Point => {
  const clamped = {
    x: Math.max(0, Math.min(1, coord.x)),
    y: Math.max(0, Math.min(1, coord.y)),
  }

  if (coord.x !== clamped.x || coord.y !== clamped.y) {
    log.warn('坐标超出0-1范围，已修正', {
      original: coord,
      clamped,
    })
  }

  return clamped
}

/**
 * Canvas逻辑坐标 → 相对坐标 (0-1)
 *
 * @param canvasX - Canvas逻辑X坐标（来自offsetX）
 * @param canvasY - Canvas逻辑Y坐标（来自offsetY）
 * @param canvasElement - Canvas DOM元素
 * @returns 相对坐标 {x: 0-1, y: 0-1}
 *
 * ⚠️ 注意：使用clientWidth/clientHeight（逻辑像素），而非width/height（物理像素）
 * 因为鼠标事件（offsetX/offsetY）返回的是逻辑坐标
 */
export const canvasToRelative = (
  canvasX: number,
  canvasY: number,
  canvasElement: HTMLCanvasElement
): Point => {
  if (!canvasElement.clientWidth || !canvasElement.clientHeight) {
    log.error('Canvas逻辑尺寸无效', {
      clientWidth: canvasElement.clientWidth,
      clientHeight: canvasElement.clientHeight,
    })
    throw new Error('Canvas逻辑尺寸无效')
  }

  const relative = {
    x: canvasX / canvasElement.clientWidth,
    y: canvasY / canvasElement.clientHeight,
  }

  return clampRelativeCoordinate(relative)
}

/**
 * Canvas笔刷尺寸 → 相对尺寸
 *
 * @param brushSize - Canvas上的笔刷尺寸（逻辑像素）
 * @param canvasElement - Canvas DOM元素
 * @returns 相对尺寸（基于宽度归一化）
 */
export const canvasBrushSizeToRelative = (
  brushSize: number,
  canvasElement: HTMLCanvasElement
): number => {
  if (!canvasElement.clientWidth) {
    throw new Error('Canvas逻辑宽度无效')
  }
  return brushSize / canvasElement.clientWidth
}

/**
 * 相对坐标 (0-1) → 图片绝对坐标
 *
 * @param relativeX - 相对X坐标 (0-1)
 * @param relativeY - 相对Y坐标 (0-1)
 * @param imageSize - 目标图片尺寸
 * @returns 图片绝对坐标
 */
export const relativeToImage = (
  relativeX: number,
  relativeY: number,
  imageSize: Size
): Point => ({
  x: relativeX * imageSize.width,
  y: relativeY * imageSize.height,
})

/**
 * 相对尺寸 → 图片绝对尺寸
 *
 * @param relativeSize - 相对尺寸 (0-1)
 * @param imageWidth - 目标图片宽度
 * @returns 图片绝对尺寸
 */
export const relativeSizeToImage = (
  relativeSize: number,
  imageWidth: number
): number => relativeSize * imageWidth

/**
 * 转换完整的Line对象：Canvas坐标 → 相对坐标
 *
 * @param line - 包含pts和size的Line对象
 * @param canvasElement - Canvas DOM元素
 * @returns 转换为相对坐标的Line对象
 */
export const convertLineToRelative = <
  T extends { pts: Point[]; size?: number }
>(
  line: T,
  canvasElement: HTMLCanvasElement
): T => {
  return {
    ...line,
    size: line.size
      ? canvasBrushSizeToRelative(line.size, canvasElement)
      : line.size,
    pts: line.pts.map(pt => canvasToRelative(pt.x, pt.y, canvasElement)),
  }
}

/**
 * 转换完整的Line对象：相对坐标 → 图片绝对坐标
 *
 * @param line - 包含pts和size的Line对象（相对坐标）
 * @param imageSize - 目标图片尺寸
 * @returns 转换为图片绝对坐标的Line对象
 */
export const convertLineToAbsolute = <
  T extends { pts: Point[]; size?: number }
>(
  line: T,
  imageSize: Size
): T => {
  return {
    ...line,
    size: line.size
      ? relativeSizeToImage(line.size, imageSize.width)
      : line.size,
    pts: line.pts.map(pt => relativeToImage(pt.x, pt.y, imageSize)),
  }
}

/**
 * 批量转换：相对坐标 → 图片绝对坐标
 *
 * @param lines - Line对象数组（相对坐标）
 * @param imageSize - 目标图片尺寸
 * @returns 转换为图片绝对坐标的Line对象数组
 */
export const convertLinesToAbsolute = <
  T extends { pts: Point[]; size?: number }
>(
  lines: T[],
  imageSize: Size
): T[] => lines.map(line => convertLineToAbsolute(line, imageSize))

/**
 * 调试日志：打印坐标转换详情
 *
 * @param context - 日志上下文（调用位置）
 * @param data - 转换相关数据
 */
export const logCoordinateConversion = (
  context: string,
  data: {
    canvasPhysicalSize?: Size
    canvasLogicalSize?: Size
    imageSize?: Size
    originalLine?: { firstPt?: Point; size?: number }
    convertedLine?: { firstPt?: Point; size?: number }
  }
) => {
  log.debug(`${context} - 坐标转换`, {
    ...data,
    devicePixelRatio: window.devicePixelRatio,
    timestamp: new Date().toISOString(),
  })
}
