// Stage 2: composite captured frames with camera moves, highlights, cursor, captions and the end card.
// Renders work/final/%05d.jpg (1920x1080). Usage: node scripts/compose.mjs [--from=0 --to=898] [--step=1]
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { launch, WORK, VIDEO_DIR } from './lib.mjs'
import { SHOTS, CAPTIONS, END_CARD, TOTAL_FRAMES, shotStarts } from './timeline.mjs'

const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d }
const from = arg('from', 0), to = arg('to', TOTAL_FRAMES), step = arg('step', 1)
const meta = JSON.parse(readFileSync(path.join(WORK, 'meta.json'), 'utf8'))
const fill = (s) => (s || '').replace(/\{(\w+)\}/g, (_, k) => {
  if (meta.vars[k] === undefined) throw new Error(`missing value {${k}}: run capture first`)
  return String(meta.vars[k])
})
const finalDir = path.join(WORK, 'final')
if (from === 0 && to === TOTAL_FRAMES && step === 1) rmSync(finalDir, { recursive: true, force: true })
mkdirSync(finalDir, { recursive: true })
const fileUrl = (p) => pathToFileURL(p).href
const finalPath = (g) => path.join(finalDir, `${String(g).padStart(5, '0')}.jpg`)
const starts = shotStarts()
const srcOf = (id) => {
  const m = meta.shots[id]
  if (!m) throw new Error(`shot ${id} not captured`)
  return { dir: fileUrl(path.join(WORK, 'frames', id)), w: m.w, h: m.h, n: m.frames.length, frames: m.frames, cam: m.cam, hl: m.hl, rects: m.rects, clicks: m.clicks }
}

// Per-shot look: dissolves, dimming behind big text, status chip window.
const LOOK = {
  hook: { dim: [[100, 0], [112, 0.62], [194, 0.7]], blur: [[100, 0], [114, 5]], chip: [14, 100] },
  compare: { xfade: 8 },
  slip: { xfade: 6 },
  surface: { xfade: 6, chip: [50, 108], chipY: 400, cam: [{ f: 0, cx: 960, cy: 640, z: 1.0 }, { f: 109, cx: 960, cy: 640, z: 1.05 }] },
  sunmap: { xfade: 6 },
  simple: { xfade: 6 },
  end: { xfade: 10, dim: [[0, 0.35], [20, 0.6]] },
}
const url = (process.env.VIDEO_URL || '').trim()
const team = (process.env.VIDEO_TEAM || '').trim()
const shots = SHOTS.map((s) => {
  const o = { id: s.id, start: starts[s.id], frames: s.frames, ...LOOK[s.id] }
  o.captions = CAPTIONS.filter((c) => c.shot === s.id).map((c) => ({ ...c, text: fill(c.text), sub: fill(c.sub) }))
  if (s.id === 'end') {
    o.src = srcOf('hook')
    o.still = 58
    o.cam = [{ f: 0, cx: 960, cy: 500, z: 1.1 }, { f: s.frames, cx: 960, cy: 470, z: 1.22 }]
    o.end = {
      title: END_CARD.title, line1: END_CARD.line1, line2: fill(END_CARD.line2), url,
      footer: team ? `${team} · ${END_CARD.footer}` : END_CARD.footer,
      aiNote: process.env.VIDEO_AI_NOTE === '0' ? '' : END_CARD.aiNote,
    }
  } else o.src = srcOf(s.id)
  if (o.start > 0) o.lastComposite = fileUrl(finalPath(o.start - 1))
  return o
})
// the dissolve reads the previous shot's last composited frame
shots.forEach((s, i) => { if (i > 0) s.lastComposite = fileUrl(finalPath(s.start - 1)) })

const browser = await launch()
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage()
page.on('pageerror', (e) => console.log('compose error:', e.message))
await page.goto(fileUrl(path.join(VIDEO_DIR, 'scripts', 'compose.html')))
await page.evaluate((d) => window.init(d), { shots, total: TOTAL_FRAMES })
const t0 = Date.now()
for (let g = from; g < to; g += step) {
  await page.evaluate((g) => window.renderFrame(g), g)
  await page.screenshot({ path: finalPath(g), type: 'jpeg', quality: 96 })
}
console.log(`composed frames ${from}..${to - 1} step ${step} in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
await browser.close()
