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
      const { scrollWidth, clientWidth } = historyListRef.current
      if (scrollWidth > clientWidth) {
        historyListRef.current.scrollTo(scrollWidth, 0)
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
          'mt-4 border p-3 rounded',
          'flex items-center justify-center w-full max-w-4xl',
          'h-[116px]',
          'text-gray-500'
        ].join(' ')}
      >
        <p>No editing history yet. Start editing to see your changes here.</p>
      </div>
    )
  }

  return (
    <div
      ref={historyListRef}
      className={[
        'flex-shrink-0',
        'mt-4 border p-3 rounded',
        'flex items-left w-full max-w-4xl',
        'space-y-0 flex-row space-x-5',
        'scrollbar-thin scrollbar-thumb-black scrollbar-track-primary overflow-x-scroll',
      ].join(' ')}
      style={{ height: '116px' }}
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
        className="rounded-sm"
        style={{ height: '90px' }}
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
            fontSize: '12px',
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