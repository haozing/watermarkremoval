import type { Notification } from '../components/ErrorNotification'

type ErrorHandler = (notification: Omit<Notification, 'id'>) => void

let globalErrorHandler: ErrorHandler | null = null

export const setGlobalErrorHandler = (handler: ErrorHandler) => {
  globalErrorHandler = handler
}

export const showGlobalError = (title: string, message?: string, action?: Notification['action']) => {
  if (globalErrorHandler) {
    globalErrorHandler({
      type: 'error',
      title,
      message,
      action,
      duration: 8000,
    })
  } else {
    // Fallback to console.error if no handler is set
    console.error(`Error: ${title}`, message)
  }
}

export const showGlobalSuccess = (title: string, message?: string) => {
  if (globalErrorHandler) {
    globalErrorHandler({
      type: 'success',
      title,
      message,
      duration: 4000,
    })
  } else {
    console.log(`Success: ${title}`, message)
  }
}

export const showGlobalWarning = (title: string, message?: string) => {
  if (globalErrorHandler) {
    globalErrorHandler({
      type: 'warning',
      title,
      message,
      duration: 6000,
    })
  } else {
    console.warn(`Warning: ${title}`, message)
  }
}

export const showGlobalInfo = (title: string, message?: string) => {
  if (globalErrorHandler) {
    globalErrorHandler({
      type: 'info',
      title,
      message,
      duration: 5000,
    })
  } else {
    console.info(`Info: ${title}`, message)
  }
}