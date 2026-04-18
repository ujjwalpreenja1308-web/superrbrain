import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

// Vite plugin: replaces <!-- INLINE_ASCII --> in index.html with the snippet content
function inlineAsciiPlugin() {
  return {
    name: 'inline-ascii',
    transformIndexHtml(html) {
      const snippetPath = path.resolve(__dirname, 'public/ascii-snippet.html')
      const snippet = fs.readFileSync(snippetPath, 'utf-8')
      return html.replace('<!-- INLINE_ASCII -->', snippet)
    }
  }
}

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        privacy: path.resolve(__dirname, 'privacy.html'),
        terms: path.resolve(__dirname, 'terms.html'),
        ascii: path.resolve(__dirname, 'ascii.html'),
      },
    },
  },
  plugins: [inlineAsciiPlugin()],
})
