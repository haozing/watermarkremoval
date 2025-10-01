import { createInpaintSession } from '../adapters/inpainting'
import { log } from '../utils/logger'

// Global ort types (loaded dynamically via util.ts)
declare global {
  const ort: typeof import('onnxruntime-web')
  interface Window {
    __inpaintSessionPromise?: Promise<ort.InferenceSession>
  }
}

/**
 * Global singleton session manager
 * Ensures only one ONNX session is created for the entire app lifecycle
 * Survives React StrictMode, HMR, and component remounts
 */
export async function getGlobalInpaintSession(): Promise<ort.InferenceSession> {
  if (!window.__inpaintSessionPromise) {
    log.info('Creating global ONNX session (one-time)')
    window.__inpaintSessionPromise = createInpaintSession()
  }
  return window.__inpaintSessionPromise
}

/**
 * Clear the global session (for testing or error recovery)
 */
export function clearGlobalSession(): void {
  if (window.__inpaintSessionPromise) {
    window.__inpaintSessionPromise
      .then(session => {
        // Dispose of the session if possible
        if (session && typeof session.dispose === 'function') {
          session.dispose()
        }
      })
      .catch(error => log.error('Session disposal failed', error))

    delete window.__inpaintSessionPromise
    log.info('Global session cleared')
  }
}
