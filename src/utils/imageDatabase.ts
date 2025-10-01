/**
 * IndexedDB工具 - 用于存储批量处理的图片
 * 批量处理时将图片保存到数据库，处理完成后跳转到下载页面统一下载
 */

import { log } from './logger'

export interface ProcessedImage {
  id: string
  fileName: string
  blob: Blob
  timestamp: number
}

class ImageDatabase {
  private dbName = 'inpaint-web-db'
  private storeName = 'processed-images'
  private db: IDBDatabase | null = null
  private version = 1

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => {
        log.error('IndexedDB初始化失败', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        log.info('IndexedDB初始化成功')
        resolve()
      }

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, {
            keyPath: 'id',
          })
          objectStore.createIndex('timestamp', 'timestamp', { unique: false })
          log.info('IndexedDB对象存储创建成功')
        }
      }
    })
  }

  /**
   * 保存图片到数据库
   */
  async saveImage(image: ProcessedImage): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.put(image)

      request.onsuccess = () => {
        log.debug('图片保存成功', { fileName: image.fileName })
        resolve()
      }

      request.onerror = () => {
        log.error('图片保存失败', request.error)
        reject(request.error)
      }
    })
  }

  /**
   * 获取所有图片
   */
  async getAllImages(): Promise<ProcessedImage[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()

      request.onsuccess = () => {
        const images = request.result
        log.info('获取所有图片', { count: images.length })
        resolve(images)
      }

      request.onerror = () => {
        log.error('获取图片失败', request.error)
        reject(request.error)
      }
    })
  }

  /**
   * 获取图片数量
   */
  async getCount(): Promise<number> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.count()

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  /**
   * 清空所有图片
   */
  async clearAll(): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.clear()

      request.onsuccess = () => {
        log.info('数据库已清空')
        resolve()
      }

      request.onerror = () => {
        log.error('清空数据库失败', request.error)
        reject(request.error)
      }
    })
  }

  /**
   * 删除单个图片
   */
  async deleteImage(id: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.delete(id)

      request.onsuccess = () => {
        log.debug('图片删除成功', { id })
        resolve()
      }

      request.onerror = () => {
        log.error('图片删除失败', request.error)
        reject(request.error)
      }
    })
  }
}

// 导出单例
export const imageDB = new ImageDatabase()
