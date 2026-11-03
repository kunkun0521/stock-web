import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 后端 Spring Boot 默认端口 8080；改后端端口时同步改这里即可。
// 也可在启动时用环境变量覆盖：VITE_BACKEND=http://localhost:18080 npm run dev
const BACKEND = process.env.VITE_BACKEND || 'http://localhost:8080';

export default defineConfig({
    plugins: [react()],
    // 把后端地址注入前端，页面在无法走同源代理时（例如用别的静态服务器打开）
    // 可以直接回退到该地址调用接口。
    define: {
        __BACKEND__: JSON.stringify(BACKEND),
    },
    server: {
        host: true,          // 同时监听 127.0.0.1 与 localhost，避免 IPv6-only 导致 127.0.0.1 打不开
        port: 5173,
        strictPort: true,    // 端口被占用直接报错，避免悄悄换到 5174 造成困惑
        open: false,
        proxy: {
            '/api': {
                target: BACKEND,
                changeOrigin: true,
                // 保留 /api 前缀，与后端 @RequestMapping 保持一致
                rewrite: (path) => path,
            },
        },
    },
    preview: {
        host: true,
        port: 4173,
    },
    build: {
        outDir: 'dist',
        chunkSizeWarningLimit: 1200,
    },
});
