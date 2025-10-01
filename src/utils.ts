import { useCallback, useEffect, useState } from 'react'
import { FILENAME_SUFFIX_PROCESSED } from './constants'
import { log } from './utils/logger'

export function dataURItoBlob(dataURI: string) {
  const mime = dataURI.split(',')[0].split(':')[1].split(';')[0]
  const binary = atob(dataURI.split(',')[1])
  const array = []
  for (let i = 0; i < binary.length; i += 1) {
    array.push(binary.charCodeAt(i))
  }
  return new Blob([new Uint8Array(array)], { type: mime })
}

/**
 * 生成处理后的文件名
 *
 * @param originalName - 原始文件名
 * @param suffix - 文件名后缀（默认为'_processed'）
 * @returns 处理后的文件名（保留扩展名，清理特殊字符，限制长度）
 *
 * @example
 * getProcessedFileName('jimeng-2025-09-27.jpg')
 * // => 'jimeng-2025-09-27_processed.jpg'
 *
 * getProcessedFileName('image, with, commas.png')
 * // => 'image_ with_ commas_processed.png'
 *
 * getProcessedFileName('very-long-name...'.repeat(20) + '.jpg')
 * // => 'very-long-name..._processed.jpg' (截断到100字符)
 */
export function getProcessedFileName(
  originalName: string,
  suffix: string = FILENAME_SUFFIX_PROCESSED
): string {
  // 1. 提取扩展名
  const lastDotIndex = originalName.lastIndexOf('.')
  const baseName =
    lastDotIndex > 0 ? originalName.slice(0, lastDotIndex) : originalName
  const extension = lastDotIndex > 0 ? originalName.slice(lastDotIndex) : '.png'

  // 2. 清理特殊字符
  // 替换可能导致文件系统问题的字符：逗号、分号、冒号等
  const cleanBaseName = baseName
    .replace(/[,;:]/g, '_') // 替换标点符号
    .replace(/\s+/g, ' ') // 合并多个空格为一个
    .trim() // 去除首尾空格

  // 3. 限制长度（避免文件名过长）
  const maxBaseNameLength = 100
  const truncatedBaseName =
    cleanBaseName.length > maxBaseNameLength
      ? cleanBaseName.slice(0, maxBaseNameLength).trim() + '...'
      : cleanBaseName

  // 4. 组合最终文件名
  return `${truncatedBaseName}${suffix}${extension}`
}

export function downloadImage(uri: string, name: string) {
  const link = document.createElement('a')
  link.href = uri
  link.download = name

  // this is necessary as link.click() does not work on the latest firefox
  link.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    })
  )

  setTimeout(() => {
    // For Firefox it is necessary to delay revoking the ObjectURL
    // window.URL.revokeObjectURL(base64)
    link.remove()
  }, 100)
}

export function loadImage(image: HTMLImageElement, src: string) {
  return new Promise((resolve, reject) => {
    const initSRC = image.src
    const img = image
    img.onload = resolve
    img.onerror = err => {
      img.src = initSRC
      reject(err)
    }
    img.src = src
  })
}

export function useImage(
  file: Blob | MediaSource
): [HTMLImageElement, boolean, (width: number, height: number) => void] {
  const [image, setImage] = useState(new Image())
  const [isLoaded, setIsLoaded] = useState(false)

  // 调整图像分辨率的函数
  const adjustResolution = useCallback(
    (width, height) => {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!
      canvas.width = width
      canvas.height = height
      context.drawImage(image, 0, 0, width, height)
      const resizedImage = new Image()
      resizedImage.src = canvas.toDataURL()
      setImage(resizedImage)
    },
    [image]
  )

  useEffect(() => {
    const newImage = new Image()
    newImage.onload = () => {
      setImage(newImage) // 只有在onload时才设置image，确保width/height已加载
      setIsLoaded(true)
    }
    newImage.onerror = error => {
      log.error('useImage: Image load failed', error)
    }
    newImage.src = URL.createObjectURL(file)

    return () => {
      newImage.onload = null
      newImage.onerror = null
    }
  }, [file])

  return [image, isLoaded, adjustResolution]
}

// https://stackoverflow.com/questions/23945494/use-html5-to-resize-an-image-before-upload
interface ResizeImageFileResult {
  file: File
  resized: boolean
  originalWidth?: number
  originalHeight?: number
}
export function resizeImageFile(
  file: File,
  maxSize: number
): Promise<ResizeImageFileResult> {
  const reader = new FileReader()
  const image = new Image()
  const canvas = document.createElement('canvas')

  const resize = (): ResizeImageFileResult => {
    let { width, height } = image

    if (width > height) {
      if (width > maxSize) {
        height *= maxSize / width
        width = maxSize
      }
    } else if (height > maxSize) {
      width *= maxSize / height
      height = maxSize
    }

    if (width === image.width && height === image.height) {
      return { file, resized: false }
    }

    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('could not get context')
    }
    canvas.getContext('2d')?.drawImage(image, 0, 0, width, height)
    const dataUrl = canvas.toDataURL('image/jpeg')
    const blob = dataURItoBlob(dataUrl)
    const f = new File([blob], file.name, {
      type: file.type,
    })
    return {
      file: f,
      resized: true,
      originalWidth: image.width,
      originalHeight: image.height,
    }
  }

  return new Promise((resolve, reject) => {
    if (!file.type.match(/image.*/)) {
      reject(new Error('Not an image'))
      return
    }
    reader.onload = (readerEvent: any) => {
      image.onload = () => resolve(resize())
      image.src = readerEvent.target.result
    }
    reader.readAsDataURL(file)
  })
}
