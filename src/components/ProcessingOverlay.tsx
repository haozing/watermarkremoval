import React from 'react'
import * as m from '../paraglide/messages'

interface ProcessingOverlayProps {
  currentIndex: number
  totalFiles: number
  currentFileName: string
  onCancel?: () => void
}

export default function ProcessingOverlay({
  currentIndex,
  totalFiles,
  currentFileName,
  onCancel,
}: ProcessingOverlayProps) {
  const progress = ((currentIndex + 1) / totalFiles) * 100

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          <div className="mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <svg
                className="w-8 h-8 text-blue-600 animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {m.processing_image({
                current: (currentIndex + 1).toString(),
                total: totalFiles.toString(),
              })}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              正在处理: {currentFileName}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="text-sm text-gray-500 mb-6">
            {Math.round(progress)}% 完成
          </div>

          {/* Info Text */}
          <div className="text-sm text-gray-600 mb-6">
            <p>处理过程中请勿关闭页面</p>
            <p>处理完成后将自动下载图片</p>
          </div>

          {/* Cancel Button (optional) */}
          {onCancel && (
            <button
              onClick={onCancel}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              取消处理
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Loading skeleton for when processing starts
export function ProcessingPreloader() {
  return (
    <div className="fixed inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-4">
          <svg
            className="w-6 h-6 text-blue-600 animate-spin"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </div>
        <p className="text-gray-600">准备批量处理...</p>
      </div>
    </div>
  )
}
