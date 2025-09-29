/// <reference types="react-scripts" />

// 全局类型声明
declare global {
  interface Window {
    gc?: () => void // Chrome DevTools 垃圾回收函数
  }
}
