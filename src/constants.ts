/**
 * 应用常量定义
 * 集中管理所有魔法数字和字符串常量
 */

// ========== 编辑器常量 ==========
/** 默认笔刷大小（像素） */
export const DEFAULT_BRUSH_SIZE = 40

/** 滑块改变后笔刷隐藏延迟（毫秒） */
export const BRUSH_HIDE_TIMEOUT = 2000

// ========== 文件处理常量 ==========
/** 单张处理文件名后缀 */
export const FILENAME_SUFFIX_SINGLE = '_single'

/** 批量处理文件名后缀 */
export const FILENAME_SUFFIX_BATCH = '_batch'

/** 默认处理文件名后缀 */
export const FILENAME_SUFFIX_PROCESSED = '_processed'

// ========== 资源清理常量 ==========
/** requestIdleCallback超时时间（毫秒） */
export const GC_IDLE_TIMEOUT = 50

/** setTimeout GC延迟时间（毫秒） */
export const GC_FALLBACK_DELAY = 10

// ========== 调试常量 ==========
/** 是否开启调试模式（由环境变量控制） */
export const IS_DEBUG = process.env.NODE_ENV === 'development'

// ========== 画布常量 ==========
/** 黑色背景色 */
export const CANVAS_COLOR_BLACK = 'black'

/** 白色蒙版色 */
export const CANVAS_COLOR_WHITE = 'white'
