import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * 目录归一:Claude 原生配置目录 + ccweb 自有应用目录。
 * 单独成文件,避免 settings.ts ↔ connections.ts 的循环依赖。
 */
export const CC_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
export const APP_DIR = process.env.CCWEB_HOME ?? join(homedir(), '.ccweb')
