import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 本地 API 目标:默认真实服务 3477;验收脚本可指向 fixture 服务,避免真实模型计费
const apiTarget = process.env.CCWEB_API_TARGET ?? 'http://127.0.0.1:3477'
const wsTarget = apiTarget.replace(/^http/, 'ws')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.CCWEB_WEB_PORT ?? 5173),
    strictPort: true,
    // 编辑器/工具原子写入产生的临时目录不要进入监听,避免 Windows EBUSY 直接崩掉 dev server
    watch: { ignored: ['**/*.tmpdir/**', '**/*.tmp'] },
    proxy: {
      '/ws': {
        target: wsTarget,
        ws: true,
      },
      '/native': { target: wsTarget, ws: true },
      '/api': apiTarget,
      '/healthz': apiTarget,
    },
  },
})
