import React, { useEffect, useState, useRef } from 'react'
import { Line } from '../types/canvas'

interface ImageGalleryProps {
  files: File[]
  currentIndex: number
  imageMasks: Map<number, Line[]>
  onSelectImage: (index: number) => void
}

const ImageGallery: React.FC<ImageGalleryProps> = ({
  files,
  currentIndex,
  imageMasks,
  onSelectImage,
}) => {
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // 生成缩略图
  useEffect(() => {
    const urls: string[] = []
    files.forEach(file => {
      urls.push(URL.createObjectURL(file))
    })
    setThumbnails(urls)

    // 清理函数
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url))
    }
  }, [files])

  // 当前图片变化时滚动到可见区域
  useEffect(() => {
    if (scrollRef.current) {
      const activeElement = scrollRef.current.children[
        currentIndex
      ] as HTMLElement
      if (activeElement) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        })
      }
    }
  }, [currentIndex])

  if (files.length <= 1) {
    return null // 只有一张图片时不显示选择器
  }

  return (
    <div className="flex-shrink-0 bg-gray-100 border-b shadow-sm">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto space-x-3 p-3 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200"
        style={{ maxHeight: '140px' }}
      >
        {files.map((file, index) => {
          const maskCount = imageMasks.get(index)?.length || 0
          const isActive = index === currentIndex

          return (
            <div
              key={index}
              onClick={() => onSelectImage(index)}
              className={`
                relative flex-shrink-0 cursor-pointer rounded-lg transition-all duration-200
                ${
                  isActive
                    ? 'ring-4 ring-blue-500 shadow-lg scale-105'
                    : 'ring-2 ring-gray-300 hover:ring-gray-400 hover:shadow-md'
                }
              `}
            >
              {/* 缩略图 */}
              <div className="w-28 h-28 overflow-hidden rounded-lg bg-gray-200">
                {thumbnails[index] ? (
                  <img
                    src={thumbnails[index]}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    Loading...
                  </div>
                )}
              </div>

              {/* 序号标签 */}
              <div className="absolute top-1 left-1 bg-black bg-opacity-70 text-white text-xs px-2 py-0.5 rounded">
                #{index + 1}
              </div>

              {/* Mask数量徽章 */}
              {maskCount > 0 && (
                <div className="absolute top-1 right-1 bg-yellow-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-md">
                  {maskCount}
                </div>
              )}

              {/* 文件名（截断显示） */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-1 rounded-b-lg">
                <div
                  className="text-white text-xs truncate px-1"
                  title={file.name}
                >
                  {file.name}
                </div>
              </div>

              {/* 当前选中指示器 */}
              {isActive && (
                <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
                  <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-blue-500"></div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default React.memo(ImageGallery)
