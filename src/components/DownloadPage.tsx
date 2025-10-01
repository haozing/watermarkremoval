import { useEffect, useState } from 'react'
import JSZip from 'jszip'
import { imageDB, ProcessedImage } from '../utils/imageDatabase'
import { downloadImage } from '../utils'
import Button from './Button'
import { ArrowDownTrayIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { log } from '../utils/logger'

const DownloadPage: React.FC = () => {
  const [images, setImages] = useState<ProcessedImage[]>([])
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

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

  const downloadSingle = (image: ProcessedImage, index: number) => {
    downloadImage(thumbnails[index], image.fileName)
    log.info('下载单张图片', { fileName: image.fileName })
  }

  const downloadAll = async () => {
    try {
      setDownloading(true)
      log.info('开始打包下载', { count: images.length })

      const zip = new JSZip()

      // 将所有图片添加到zip
      images.forEach(image => {
        zip.file(image.fileName, image.blob)
      })

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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">批量处理完成</h1>
            <p className="text-gray-600 mt-2">
              已处理 {images.length} 张图片，可以单独下载或打包下载
            </p>
          </div>
          <div className="flex gap-3">
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
                {thumbnails[index] ? (
                  <img
                    src={thumbnails[index]}
                    alt={image.fileName}
                    className="w-full h-full object-cover"
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
    </div>
  )
}

export default DownloadPage
