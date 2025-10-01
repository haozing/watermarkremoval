import { useEffect, useState } from 'react'
import JSZip from 'jszip'
import { imageDB, ProcessedImage } from '../utils/imageDatabase'
import { downloadImage } from '../utils'
import Button from './Button'
import Slider from './Slider'
import { ArrowDownTrayIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { log } from '../utils/logger'

const DownloadPage: React.FC = () => {
  const [images, setImages] = useState<ProcessedImage[]>([])
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
  const [previewImage, setPreviewImage] = useState<{
    url: string
    fileName: string
  } | null>(null)
  const [downloadFormat, setDownloadFormat] = useState<
    'original' | 'jpg' | 'png' | 'webp'
  >('original')
  const [jpegQuality, setJpegQuality] = useState(0.9)

  useEffect(() => {
    loadImages()
  }, [])

  const loadImages = async () => {
    try {
      setLoading(true)
      const allImages = await imageDB.getAllImages()
      setImages(allImages)

      // 生成缩略图
      const urls = allImages.map(img => URL.createObjectURL(img.blob))
      setThumbnails(urls)

      log.info('下载页面加载图片', { count: allImages.length })
    } catch (error) {
      log.error('加载图片失败', error)
    } finally {
      setLoading(false)
    }

    // 清理函数
    return () => {
      thumbnails.forEach(url => URL.revokeObjectURL(url))
    }
  }

  /**
   * 将图片转换为指定格式
   */
  const convertImageFormat = async (
    blob: Blob,
    format: 'original' | 'jpg' | 'png' | 'webp',
    quality: number = 0.9
  ): Promise<Blob> => {
    if (format === 'original') return blob

    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(blob)

      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          URL.revokeObjectURL(url)
          reject(new Error('无法创建canvas上下文'))
          return
        }

        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)

        const mimeType =
          format === 'jpg'
            ? 'image/jpeg'
            : format === 'png'
            ? 'image/png'
            : 'image/webp'

        canvas.toBlob(
          convertedBlob => {
            if (convertedBlob) {
              resolve(convertedBlob)
            } else {
              reject(new Error('图片转换失败'))
            }
          },
          mimeType,
          quality
        )
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('图片加载失败'))
      }

      img.src = url
    })
  }

  const downloadSingle = async (image: ProcessedImage, index: number) => {
    try {
      let blob = image.blob
      let fileName = image.fileName

      // 格式转换
      if (downloadFormat !== 'original') {
        blob = await convertImageFormat(blob, downloadFormat, jpegQuality)
        const ext = downloadFormat === 'jpg' ? 'jpg' : downloadFormat
        fileName = fileName.replace(/\.\w+$/, `.${ext}`)
      }

      const url = URL.createObjectURL(blob)
      downloadImage(url, fileName)
      URL.revokeObjectURL(url)

      log.info('下载单张图片', { fileName, format: downloadFormat })
    } catch (error) {
      log.error('下载失败', error)
      alert('下载失败: ' + error)
    }
  }

  const downloadAll = async () => {
    try {
      setDownloading(true)
      log.info('开始打包下载', { count: images.length, format: downloadFormat })

      const zip = new JSZip()

      // 将所有图片添加到zip（支持格式转换）
      for (const image of images) {
        let blob = image.blob
        let fileName = image.fileName

        if (downloadFormat !== 'original') {
          blob = await convertImageFormat(blob, downloadFormat, jpegQuality)
          const ext = downloadFormat === 'jpg' ? 'jpg' : downloadFormat
          fileName = fileName.replace(/\.\w+$/, `.${ext}`)
        }

        zip.file(fileName, blob)
      }

      // 生成zip文件
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, -5)
      const zipFileName = `inpaint-batch-${timestamp}.zip`

      downloadImage(url, zipFileName)

      log.info('ZIP下载完成', { fileName: zipFileName })

      // 清理数据库
      setTimeout(async () => {
        await imageDB.clearAll()
        log.info('数据库已清理')
      }, 1000)
    } catch (error) {
      log.error('打包下载失败', error)
      alert('打包下载失败: ' + error)
    } finally {
      setDownloading(false)
    }
  }

  const goBack = () => {
    window.history.back()
  }

  /**
   * 下载选中的图片（非zip，逐个下载）
   */
  const downloadSelected = async () => {
    try {
      setDownloading(true)
      const selectedImagesList = images.filter(img =>
        selectedImages.has(img.id)
      )

      log.info('开始批量下载选中图片', {
        count: selectedImagesList.length,
        format: downloadFormat,
      })

      for (const image of selectedImagesList) {
        let blob = image.blob
        let fileName = image.fileName

        if (downloadFormat !== 'original') {
          blob = await convertImageFormat(blob, downloadFormat, jpegQuality)
          const ext = downloadFormat === 'jpg' ? 'jpg' : downloadFormat
          fileName = fileName.replace(/\.\w+$/, `.${ext}`)
        }

        const url = URL.createObjectURL(blob)
        downloadImage(url, fileName)
        URL.revokeObjectURL(url)

        // 添加小延迟避免浏览器阻止多次下载
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      log.info('批量下载完成')
    } catch (error) {
      log.error('批量下载失败', error)
      alert('批量下载失败: ' + error)
    } finally {
      setDownloading(false)
    }
  }

  /**
   * 切换单张图片的选中状态
   */
  const toggleImageSelection = (imageId: string) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(imageId)) {
        newSet.delete(imageId)
      } else {
        newSet.add(imageId)
      }
      return newSet
    })
  }

  /**
   * 全选/取消全选
   */
  const toggleSelectAll = () => {
    if (selectedImages.size === images.length) {
      setSelectedImages(new Set())
    } else {
      setSelectedImages(new Set(images.map(img => img.id)))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl text-gray-500">加载中...</div>
      </div>
    )
  }

  if (images.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="text-2xl text-gray-500 mb-8">没有待下载的图片</div>
        <Button
          primary
          icon={<ArrowLeftIcon className="w-6 h-6" />}
          onClick={goBack}
        >
          返回
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col gap-6">
          {/* 标题和主要按钮 */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">批量处理完成</h1>
              <p className="text-gray-600 mt-2">
                已处理 {images.length} 张图片，已选中 {selectedImages.size} 张
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={toggleSelectAll}
                className="bg-gray-500 hover:bg-gray-600 text-white"
              >
                {selectedImages.size === images.length ? '取消全选' : '全选'}
              </Button>
              <Button
                primary
                onClick={downloadSelected}
                disabled={downloading || selectedImages.size === 0}
                className="bg-green-600 hover:bg-green-700 text-white"
                icon={<ArrowDownTrayIcon className="w-6 h-6" />}
              >
                {downloading
                  ? '下载中...'
                  : `下载选中 (${selectedImages.size})`}
              </Button>
              <Button
                primary
                onClick={downloadAll}
                disabled={downloading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                icon={<ArrowDownTrayIcon className="w-6 h-6" />}
              >
                {downloading ? '打包中...' : `下载全部 (ZIP)`}
              </Button>
              <Button
                onClick={goBack}
                icon={<ArrowLeftIcon className="w-6 h-6" />}
              >
                返回
              </Button>
            </div>
          </div>

          {/* 格式设置 */}
          <div className="bg-white rounded-lg shadow-md p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              下载格式设置
            </h3>
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
              {/* 格式选择 */}
              <div className="flex items-center gap-3">
                <label className="text-gray-700 font-medium">格式:</label>
                <select
                  value={downloadFormat}
                  onChange={e =>
                    setDownloadFormat(
                      e.target.value as 'original' | 'jpg' | 'png' | 'webp'
                    )
                  }
                  className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="original">原始格式</option>
                  <option value="jpg">JPG</option>
                  <option value="png">PNG</option>
                  <option value="webp">WebP</option>
                </select>
              </div>

              {/* 质量滑块 (仅jpg和webp) */}
              {(downloadFormat === 'jpg' || downloadFormat === 'webp') && (
                <div className="flex-1 min-w-[200px]">
                  <Slider
                    label={`质量: ${Math.round(jpegQuality * 100)}%`}
                    min={0.1}
                    max={1}
                    value={jpegQuality}
                    onChange={setJpegQuality}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Image Grid */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {images.map((image, index) => (
            <div
              key={image.id}
              className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-200 overflow-hidden"
            >
              {/* 图片预览 */}
              <div className="aspect-square bg-gray-200 relative">
                {/* 复选框 */}
                <div className="absolute top-2 left-2 z-10">
                  <input
                    type="checkbox"
                    checked={selectedImages.has(image.id)}
                    onChange={() => toggleImageSelection(image.id)}
                    className="w-5 h-5 cursor-pointer accent-blue-600"
                  />
                </div>

                {/* 图片 - 点击预览 */}
                {thumbnails[index] ? (
                  <img
                    src={thumbnails[index]}
                    alt={image.fileName}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() =>
                      setPreviewImage({
                        url: thumbnails[index],
                        fileName: image.fileName,
                      })
                    }
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    Loading...
                  </div>
                )}
              </div>

              {/* 文件信息 */}
              <div className="p-4">
                <p
                  className="text-sm text-gray-700 truncate mb-3"
                  title={image.fileName}
                >
                  {image.fileName}
                </p>
                <Button
                  primary
                  className="w-full"
                  onClick={() => downloadSingle(image, index)}
                  icon={<ArrowDownTrayIcon className="w-5 h-5" />}
                >
                  下载
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 预览模态框 */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-7xl max-h-full">
            {/* 关闭按钮 */}
            <button
              className="absolute -top-10 right-0 text-white text-2xl hover:text-gray-300"
              onClick={() => setPreviewImage(null)}
            >
              ✕
            </button>

            {/* 大图 */}
            <img
              src={previewImage.url}
              alt={previewImage.fileName}
              className="max-w-full max-h-[90vh] object-contain"
              onClick={e => e.stopPropagation()}
            />

            {/* 文件名 */}
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-3 text-center">
              {previewImage.fileName}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DownloadPage
