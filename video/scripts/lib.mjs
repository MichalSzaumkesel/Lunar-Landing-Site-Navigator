// Shared helpers: Playwright launch (Chrome channel, WebGL flags), paths, ffmpeg lookup.
import { createRequire } from 'node:module'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const VIDEO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const WORK = path.join(VIDEO_DIR, 'work')
export const OUT = path.join(VIDEO_DIR, 'out')
export const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')
export const FPS = 30
export const W = 1920
export const H = 1080

export function loadPlaywright() {
  const dirs = [process.env.PW_DIR, VIDEO_DIR, 'C:/Dev/pw-tmp'].filter(Boolean)
  for (const d of dirs) {
    try {
      return createRequire(path.join(d, 'x.js'))('playwright-core')
    } catch { /* next */ }
  }
  throw new Error('playwright-core not found. Set PW_DIR to a folder with node_modules/playwright-core.')
}

/** GL=gpu (default, falls back automatically) or GL=swiftshader. */
export async function launch(gl = process.env.GL || 'gpu') {
  const { chromium } = loadPlaywright()
  const args =
    gl === 'swiftshader'
      ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
      : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu']
  args.push('--hide-scrollbars', '--force-color-profile=srgb', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required')
  return chromium.launch({ channel: 'chrome', headless: true, args })
}

export function findFfmpeg() {
  const cands = [process.env.FFMPEG_DIR]
  const wg = path.join(process.env.LOCALAPPDATA || '', 'Microsoft/WinGet/Packages')
  if (existsSync(wg)) {
    for (const p of readdirSync(wg).filter((n) => n.startsWith('Gyan.FFmpeg'))) {
      const base = path.join(wg, p)
      for (const b of readdirSync(base)) cands.push(path.join(base, b, 'bin'))
    }
  }
  for (const c of cands.filter(Boolean)) if (existsSync(path.join(c, 'ffmpeg.exe'))) return c
  return '' // rely on PATH
}
