import React, { useRef, useEffect, useMemo } from 'react'
import Button from './Button'

interface HistoryListProps {
  renders: HTMLImageElement[]
  onBackTo: (index: number) => void
  onPreview: (index: number) => void
  onPreviewEnd: () => void
}

const HistoryList: React.FC<HistoryListProps> = ({
  renders,
  onBackTo,
  onPreview,
  onPreviewEnd
}) => {
  const historyListRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the end when new renders are added
  useEffect(() => {
    if (historyListRef.current) {
      const { scrollHeight, clientHeight } = historyListRef.current
      if (scrollHeight > clientHeight) {
        historyListRef.current.scrollTo(0, scrollHeight)
      }
    }
  }, [renders.length])

  // Memoize history items for performance
  const HistoryItems = useMemo(
    () =>
      renders.map((render, index) => (
        <HistoryItem
          key={render.dataset.id || `history-${index}`}
          render={render}
          index={index}
          onBackTo={onBackTo}
          onPreview={onPreview}
          onPreviewEnd={onPreviewEnd}
        />
      )),
    [renders, onBackTo, onPreview, onPreviewEnd]
  )

  if (renders.length === 0) {
    return (
      <div
        className={[
          'flex-shrink-0',
          'border p-3 rounded',
          'flex items-center justify-center w-[120px]',
          'h-full',
          'text-gray-500'
        ].join(' ')}
      >
        <p className="text-xs text-center">
          No editing history yet. Start editing to see your changes here.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={historyListRef}
      className={[
        'flex-shrink-0',
        'border p-3 rounded',
        'flex flex-col w-[120px]',
        'space-x-0 space-y-3',
        'scrollbar-thin scrollbar-thumb-black scrollbar-track-primary overflow-y-auto',
        'h-full'
      ].join(' ')}
    >
      {HistoryItems}
    </div>
  )
}

interface HistoryItemProps {
  render: HTMLImageElement
  index: number
  onBackTo: (index: number) => void
  onPreview: (index: number) => void
  onPreviewEnd: () => void
}

const HistoryItem: React.FC<HistoryItemProps> = React.memo(({
  render,
  index,
  onBackTo,
  onPreview,
  onPreviewEnd
}) => {
  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
        flexShrink: 0,
      }}
    >
      <img
        src={render.src}
        alt={`Edit ${index + 1}`}
        className="rounded-sm w-full object-cover"
        style={{ height: '60px' }}
        loading="lazy" // Optimize loading for better performance
      />
      <Button
        className="hover:opacity-100 opacity-0 cursor-pointer rounded-sm transition-opacity duration-200"
        style={{
          position: 'absolute',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={() => onBackTo(index)}
        onEnter={() => onPreview(index)}
        onLeave={onPreviewEnd}
      >
        <div
          style={{
            color: '#fff',
            fontSize: '10px',
            textAlign: 'center',
          }}
        >
          回到这
          <br />
          Back here
        </div>
      </Button>
    </div>
  )
})

HistoryItem.displayName = 'HistoryItem'

export default HistoryList