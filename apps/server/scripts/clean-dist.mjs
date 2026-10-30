import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rmSync } from 'node:fs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'dist')
if (!target.startsWith(root + '/') && !target.startsWith(root + '\\')) throw new Error('Invalid build target')
rmSync(target, {recursive:true,force:true})
