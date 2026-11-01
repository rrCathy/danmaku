import { defineConfig } from 'vite';

// GitHub Pages 项目站点地址是 https://<user>.github.io/danmaku/，
// 所以构建产物的资源前缀必须是 /danmaku/。本地 dev / preview 会自动跟随。
export default defineConfig({
  base: '/danmaku/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});
