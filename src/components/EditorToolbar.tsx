import React from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import Button from './Button'
import Slider from './Slider'
import * as m from '../paraglide/messages'

interface EditorToolbarProps {
  hasRenders: boolean
  brushSize: number
  pendingMasksCount: number
  showBatchButton: boolean
  currentImageProcessed: boolean // 当前图片是否已被单独处理
  remainingFilesCount: number
  totalFilesCount: number // 总文件数（包括当前）
  onUndo: () => void
  onBrushSizeChange: (size: number) => void
  onBrushSizeStart: () => void
  onDownload: () => void
  onProcessBatch: () => void // 只处理当前图片
  onProcessAll: () => void // 处理全部或处理剩余
  onClearMarks: () => void
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({
  hasRenders,
  brushSize,
  pendingMasksCount,
  showBatchButton,
  currentImageProcessed,
  remainingFilesCount,
  totalFilesCount,
  onUndo,
  onBrushSizeChange,
  onBrushSizeStart,
  onDownload,
  onProcessBatch,
  onProcessAll,
  onClearMarks,
}) => {
  return (
    <div
      className={[
        'flex-shrink-0',
        'bg-white rounded-md border border-gray-300 hover:border-gray-400 shadow-md hover:shadow-lg p-4 transition duration-200 ease-in-out',
        'flex items-center w-full max-w-4xl py-6 mb-4, justify-between',
        'flex-col space-y-2 sm:space-y-0 sm:flex-row sm:space-x-5',
      ].join(' ')}
    >
      {/* Undo Button */}
      {hasRenders && (
        <Button
          primary
          onClick={onUndo}
          icon={
            <svg
              className="w-6 h-6"
              width="19"
              height="9"
              viewBox="0 0 19 9"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2 1C2 0.447715 1.55228 0 1 0C0.447715 0 0 0.447715 0 1H2ZM1 8H0V9H1V8ZM8 9C8.55228 9 9 8.55229 9 8C9 7.44771 8.55228 7 8 7V9ZM16.5963 7.42809C16.8327 7.92721 17.429 8.14016 17.9281 7.90374C18.4272 7.66731 18.6402 7.07103 18.4037 6.57191L16.5963 7.42809ZM16.9468 5.83205L17.8505 5.40396L16.9468 5.83205ZM0 1V8H2V1H0ZM1 9H8V7H1V9ZM1.66896 8.74329L6.66896 4.24329L5.33104 2.75671L0.331035 7.25671L1.66896 8.74329ZM16.043 6.26014L16.5963 7.42809L18.4037 6.57191L17.8505 5.40396L16.043 6.26014ZM6.65079 4.25926C9.67554 1.66661 14.3376 2.65979 16.043 6.26014L17.8505 5.40396C15.5805 0.61182 9.37523 -0.710131 5.34921 2.74074L6.65079 4.25926Z"
                fill="currentColor"
              />
            </svg>
          }
        >
          {m.undo()}
        </Button>
      )}

      {/* Brush Size Slider */}
      <div className="flex-1 flex items-center justify-center">
        <Slider
          label={m.bruch_size()}
          min={10}
          max={200}
          value={brushSize}
          onChange={onBrushSizeChange}
          onStart={onBrushSizeStart}
        />
      </div>

      {/* Process Button - 只处理当前图片 */}
      {showBatchButton && !currentImageProcessed && (
        <Button
          primary
          onClick={onProcessBatch}
          className="bg-green-500 hover:bg-green-600 text-white"
          icon={
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          }
        >
          处理 ({pendingMasksCount})
        </Button>
      )}

      {/* Process All / Process Remaining Button - 动态按钮 */}
      {pendingMasksCount > 0 && totalFilesCount > 1 && (
        <Button
          primary
          onClick={onProcessAll}
          className="bg-blue-500 hover:bg-blue-600 text-white"
          icon={
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          }
        >
          {currentImageProcessed
            ? `批量处理剩余 (${remainingFilesCount}张)`
            : `批量处理全部 (${totalFilesCount}张)`}
        </Button>
      )}

      {/* Clear Marks Button */}
      {(pendingMasksCount > 0 || remainingFilesCount > 0) && (
        <Button
          onClick={onClearMarks}
          icon={
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          }
        >
          {m.clear_marks()}
        </Button>
      )}

      {/* Download Button */}
      <Button
        primary
        icon={<ArrowDownTrayIcon className="w-6 h-6" />}
        onClick={onDownload}
      >
        {m.download()}
      </Button>
    </div>
  )
}

export default React.memo(EditorToolbar)
