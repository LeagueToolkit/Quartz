import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    clearScreen: false,
    server: {
        port: 1420,
        strictPort: true,
    },
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
        target: ['es2021', 'chrome100', 'safari13'],
        minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
        sourcemap: !!process.env.TAURI_DEBUG,

        // Code splitting for better caching and faster initial load
        rollupOptions: {
            output: {
                manualChunks: {
                    // React vendor chunk
                    'react-vendor': ['react', 'react-dom'],

                    // Monaco Editor - lazy loaded
                    'monaco': ['@monaco-editor/react'],

                    // Three.js 3D rendering - lazy loaded
                    'three': ['three', '@react-three/fiber', '@react-three/drei'],

                    // Tauri APIs
                    'tauri-apis': ['@tauri-apps/api', '@tauri-apps/plugin-dialog'],
                },
            },
        },

        // Increase chunk size warning limit after optimization
        chunkSizeWarningLimit: 600,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },

    // Optimize dependency pre-bundling
    optimizeDeps: {
        include: ['react', 'react-dom'],
    },
});
