/**
 * 统一日志系统
 * 环境感知、结构化、可配置
 */

import { IS_DEBUG } from '../constants'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LoggerConfig {
  /** 是否启用日志 */
  enabled: boolean
  /** 最小日志级别 */
  minLevel: LogLevel
  /** 是否在生产环境启用错误日志 */
  enableProductionErrors: boolean
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

class Logger {
  private config: LoggerConfig = {
    enabled: IS_DEBUG,
    minLevel: 'debug',
    enableProductionErrors: true,
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled && level !== 'error') {
      return false
    }

    if (level === 'error' && this.config.enableProductionErrors) {
      return true
    }

    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.minLevel]
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog('debug')) {
      if (data !== undefined) {
        console.log(`[DEBUG] ${message}`, data)
      } else {
        console.log(`[DEBUG] ${message}`)
      }
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog('info')) {
      if (data !== undefined) {
        console.log(`[INFO] ${message}`, data)
      } else {
        console.log(`[INFO] ${message}`)
      }
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog('warn')) {
      if (data !== undefined) {
        console.warn(`[WARN] ${message}`, data)
      } else {
        console.warn(`[WARN] ${message}`)
      }
    }
  }

  error(message: string, error?: any): void {
    if (this.shouldLog('error')) {
      if (error !== undefined) {
        console.error(`[ERROR] ${message}`, error)
      } else {
        console.error(`[ERROR] ${message}`)
      }
    }
  }

  /** 配置logger */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

// 导出单例实例
export const logger = new Logger()

// 便捷方法导出
export const log = {
  debug: (message: string, data?: any) => logger.debug(message, data),
  info: (message: string, data?: any) => logger.info(message, data),
  warn: (message: string, data?: any) => logger.warn(message, data),
  error: (message: string, error?: any) => logger.error(message, error),
}
