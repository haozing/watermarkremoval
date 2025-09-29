import { useState } from 'react'
import { useErrorNotification } from './ErrorNotification'
import * as m from '../paraglide/messages'

type FileSelectProps = {
  onSelection: (files: File[]) => void
}

export default function FileSelect(props: FileSelectProps) {
  const { onSelection } = props
  const { showError } = useErrorNotification()

  const [dragHover, setDragHover] = useState(false)
  const [uploadElemId] = useState(`file-upload-${Math.random().toString()}`)

  async function checkImageAspectRatio(files: File[]): Promise<{
    compatible: File[]
    incompatibleCount: number
    referenceRatio: number
  }> {
    if (files.length === 0) {
      return { compatible: [], incompatibleCount: 0, referenceRatio: 0 }
    }

    // Load first image to get reference ratio
    const firstImage = await loadImageFromFile(files[0])
    const referenceRatio = firstImage.width / firstImage.height
    const tolerance = 0.15 // ±15% tolerance

    const compatible: File[] = []
    let incompatibleCount = 0

    for (const file of files) {
      try {
        const img = await loadImageFromFile(file)
        const ratio = img.width / img.height
        const diff = Math.abs(ratio - referenceRatio) / referenceRatio

        if (diff <= tolerance) {
          compatible.push(file)
        } else {
          incompatibleCount++
          console.warn(
            `Image ${file.name} has incompatible aspect ratio: ${ratio.toFixed(
              2
            )} vs ${referenceRatio.toFixed(2)}`
          )
        }
      } catch (error) {
        console.warn(`Error loading image ${file.name}:`, error)
        incompatibleCount++
      }
    }

    return { compatible, incompatibleCount, referenceRatio }
  }

  function loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Failed to load image ${file.name}`))
      img.src = URL.createObjectURL(file)
    })
  }

  async function handleMultipleFiles(files: File[]) {
    if (files.length === 0) return

    // Filter valid image files
    const validFiles = files.filter(file => {
      const isImage = file.type.match('image.*')
      const isValidSize = file.size <= 10 * 1024 * 1024 // 10MB limit

      if (!isImage) {
        console.warn(`Skipping non-image file: ${file.name}`)
        return false
      }
      if (!isValidSize) {
        showError('File too large', `${file.name} exceeds 10MB limit`)
        return false
      }
      return true
    })

    if (validFiles.length === 0) {
      showError('No valid images', 'Please select valid image files under 10MB')
      return
    }

    try {
      // Check aspect ratio compatibility
      const { compatible, incompatibleCount } = await checkImageAspectRatio(
        validFiles
      )

      if (incompatibleCount > 0) {
        console.warn(
          `${incompatibleCount} images have different aspect ratios and may not process well together`
        )
      }

      // Use all valid files (including incompatible ones) - let user decide
      onSelection(validFiles)
    } catch (error) {
      showError('Image Analysis Error', (error as any).message)
    }
  }

  function onFileSelected(file: File) {
    handleMultipleFiles([file])
  }

  async function getFile(entry: any): Promise<File> {
    return new Promise(resolve => {
      entry.file((file: File) => resolve(file))
    })
  }

  /* eslint-disable no-await-in-loop */

  // Drop handler function to get all files
  async function getAllFileEntries(items: DataTransferItemList) {
    const fileEntries: Array<File> = []
    // Use BFS to traverse entire directory/file structure
    const queue = []
    // Unfortunately items is not iterable i.e. no forEach
    for (let i = 0; i < items.length; i += 1) {
      queue.push(items[i].webkitGetAsEntry())
    }
    while (queue.length > 0) {
      const entry = queue.shift()
      if (entry?.isFile) {
        // Only append images
        const file = await getFile(entry)
        fileEntries.push(file)
      } else if (entry?.isDirectory) {
        queue.push(
          ...(await readAllDirectoryEntries((entry as any).createReader()))
        )
      }
    }
    return fileEntries
  }

  // Get all the entries (files or sub-directories) in a directory
  // by calling readEntries until it returns empty array
  async function readAllDirectoryEntries(directoryReader: any) {
    const entries = []
    let readEntries = await readEntriesPromise(directoryReader)
    while (readEntries.length > 0) {
      entries.push(...readEntries)
      readEntries = await readEntriesPromise(directoryReader)
    }
    return entries
  }

  /* eslint-enable no-await-in-loop */

  // Wrap readEntries in a promise to make working with readEntries easier
  // readEntries will return only some of the entries in a directory
  // e.g. Chrome returns at most 100 entries at a time
  async function readEntriesPromise(directoryReader: any): Promise<any> {
    return new Promise((resolve, reject) => {
      directoryReader.readEntries(resolve, reject)
    })
  }

  async function handleDrop(ev: React.DragEvent) {
    ev.preventDefault()
    const items = await getAllFileEntries(ev.dataTransfer.items)
    setDragHover(false)
    handleMultipleFiles(items)
  }

  return (
    <label
      htmlFor={uploadElemId}
      className="block w-full h-full group relative cursor-pointer rounded-md font-medium focus-within:outline-none"
    >
      <div
        className={[
          'w-full h-full flex items-center justify-center px-6 pt-5 pb-6 text-xl',
          'border-4 border-dashed rounded-md',
          'hover:border-black hover:bg-primary',
          'text-center',
          dragHover ? 'border-black bg-primary' : 'bg-gray-100 border-gray-300',
        ].join(' ')}
        onDrop={handleDrop}
        onDragOver={ev => {
          ev.stopPropagation()
          ev.preventDefault()
          setDragHover(true)
        }}
        onDragLeave={() => setDragHover(false)}
      >
        <input
          id={uploadElemId}
          name={uploadElemId}
          type="file"
          multiple
          className="sr-only"
          onChange={ev => {
            const files = Array.from(ev.currentTarget.files || [])
            if (files.length > 0) {
              handleMultipleFiles(files)
            }
          }}
          accept="image/png, image/jpeg, image/webp"
        />
        <p>{m.drop_zone()}</p>
      </div>
    </label>
  )
}
