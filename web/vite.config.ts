import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

function getContentSecurityPolicy(apiUrl?: string): string {
  let connectSrc = "'self'"
  if (apiUrl) {
    try {
      const origin = new URL(apiUrl).origin
      if (origin && origin !== 'null') {
        connectSrc = `'self' ${origin}`
      }
    } catch {
      // ignore invalid URL
    }
  }

  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src ${connectSrc}`,
    "font-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ')
}

function cspPlugin(apiUrl?: string): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: getContentSecurityPolicy(apiUrl),
          },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// VITE_BASE lets the same build run at "/" (Vercel, local) and at "/<repo>/" (GitHub Pages).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || process.env.VITE_API_URL
  const base = env.VITE_BASE || process.env.VITE_BASE || '/'

  return {
    base,
    plugins: [react(), cspPlugin(apiUrl)],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  }
})
