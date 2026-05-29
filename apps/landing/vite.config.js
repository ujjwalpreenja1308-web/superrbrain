import { defineConfig, loadEnv } from 'vite'
import fs from 'fs'
import path from 'path'

// Vite plugin: inlines ascii-snippet.html at build time so it renders immediately
function inlineAsciiPlugin() {
  return {
    name: 'inline-ascii',
    transformIndexHtml(html) {
      const snippetPath = path.resolve(__dirname, 'public/ascii-snippet.html')
      const snippet = fs.existsSync(snippetPath) ? fs.readFileSync(snippetPath, 'utf-8') : ''
      return html.replace('<!-- INLINE_ASCII -->', snippet)
    }
  }
}

function getBlogInputs() {
  const blogsDir = path.resolve(__dirname, 'blogs')
  if (!fs.existsSync(blogsDir)) return {}

  return Object.fromEntries(
    fs.readdirSync(blogsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => fs.existsSync(path.join(blogsDir, entry.name, 'index.html')))
      .map((entry) => [`blog-${entry.name}`, path.join(blogsDir, entry.name, 'index.html')])
  )
}

export default defineConfig(({ mode }) => {
  // Load env from root and from frontend app (for Supabase keys)
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '../..'), '')
  const frontendEnv = loadEnv(mode, path.resolve(__dirname, '../frontend'), '')
  const env = { ...rootEnv, ...frontendEnv }

  const supabaseUrl = env.VITE_SUPABASE_URL || ''
  const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || ''

  return {
    root: '.',
    define: {
      __SUPABASE_URL__: JSON.stringify(supabaseUrl),
      __SUPABASE_KEY__: JSON.stringify(supabaseKey),
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          blogs: path.resolve(__dirname, 'blogs/index.html'),
          ...getBlogInputs(),
          auth: path.resolve(__dirname, 'auth.html'),
          privacy: path.resolve(__dirname, 'privacy.html'),
          terms: path.resolve(__dirname, 'terms.html'),
          ascii: path.resolve(__dirname, 'ascii.html'),
        },
      },
    },
    plugins: [inlineAsciiPlugin()],
  }
})
