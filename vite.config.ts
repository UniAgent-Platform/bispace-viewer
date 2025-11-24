import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        proxy: {
            '/generate': {
                target: 'http://localhost:8080',
                changeOrigin: true,
            },
            '/fetch': {
                target: 'http://localhost:8080',
                changeOrigin: true,
            },
        },
    },
});
