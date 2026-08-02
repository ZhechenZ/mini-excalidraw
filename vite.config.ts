import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// GitHub Pages 项目站点部署在 https://<user>.github.io/mini-excalidraw/，
// 因此生产构建需要把 base 设为 '/mini-excalidraw/'；dev / preview 用 '/'。
// 用 VITE_BASE 环境变量可覆盖（例如部署到自定义域名或 Cloudflare Pages 时设为 '/'）。
export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE ?? (command === 'build' ? '/mini-excalidraw/' : '/'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}))