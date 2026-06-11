import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/* Tauri's custom protocol sends no CORS headers, so a crossorigin stylesheet
   link gets blocked. Drop the attribute so the browser does a plain fetch. */
function tauriCSSFix(): Plugin {
    return {
        name: 'tauri-css-fix',
        enforce: 'post',
        transformIndexHtml(html) {
            return html.replace(
                /<link rel="stylesheet" crossorigin/g,
                '<link rel="stylesheet"',
            );
        },
    };
}

export default defineConfig({
    plugins: [react(), tauriCSSFix()],
    clearScreen: false,
    server: { port: 3169, strictPort: true },
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
        target: ['es2021', 'chrome100', 'safari13'],
        minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
        sourcemap: !!process.env.TAURI_DEBUG,
    },
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    optimizeDeps: {
        include: [
            'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime',
            '@tauri-apps/api/core', '@tauri-apps/api/event', '@tauri-apps/api/window',
            'zustand', 'zustand/react/shallow',
        ],
    },
});
