const { defineConfig } = require('vite');
const { resolve } = require('node:path');

module.exports = defineConfig(() => {
  return {
    base: '/',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsDir: '',
      rollupOptions: {
        input: [resolve(__dirname, 'index.html'), resolve(__dirname, 'musaumz.html')],
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: '[name][extname]',
        },
      },
    },
    server: {
      port: 5174,
      strictPort: true,
    },
    preview: {
      port: 5174,
      strictPort: true,
    },
  };
});
