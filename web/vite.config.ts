import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

function getContentSecurityPolicy(): string {
  let connectSrc = "'self'"
  const apiUrl = process.env.VITE_API_URL
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

function cspPlugin(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: getContentSecurityPolicy(),
          },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// VITE_BASE lets the same build run at "/" (Vercel, local) and at "/<repo>/" (GitHub Pages).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), cspPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
