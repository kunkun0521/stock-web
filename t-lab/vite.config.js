import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 独立子应用：不改父工程任何文件。依赖复用 stock-web/node_modules（Node 向上查找）。
// 后端 Spring Boot 默认 8080；验证时可 VITE_BACKEND=http://localhost:18080 npm run dev
const BACKEND = process.env.VITE_BACKEND || 'http://localhost:8080';
const ROOT = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: ROOT,
    plugins: [react()],
    define: {
        __BACKEND__: JSON.stringify(BACKEND),
    },
    server: {
        host: true,
        port: 5175,
        strictPort: true,
        open: false,
        proxy: {
            '/api': { target: BACKEND, changeOrigin: true, rewrite: (p) => p },
        },
    },
    preview: { host: true, port: 4175 },
    build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
