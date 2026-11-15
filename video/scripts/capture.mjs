// Stage 1: frame-accurate capture of the running app, one browser context per shot.
// Time is driven by Playwright's fake clock (page.clock): every output frame advances the page by a
// fixed step and takes one screenshot, so the result is a smooth 30 fps regardless of render speed.
// Usage: node scripts/capture.mjs [--only=hook,compare]
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { launch, APP_URL, WORK } from './lib.mjs'
import { SHOTS } from './timeline.mjs'

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean)
const FRAME_MS = 1000 / 30
const metaPath = path.join(WORK, 'meta.json')
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : { vars: {}, shots: {} }
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await launch()

async function open({ url, vw = 1920, vh = 1080, dsf = 1 }) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('  page error:', e.message))
  await page.addInitScript(() => {
    try { localStorage.setItem('lunar.lockHintSeen', '1') } catch { /* ignore */ }
  })
  await page.clock.install()
  await page.goto(APP_URL + url)
  await page.waitForSelector('button', { timeout: 30000 })
  await sleep(2500)
  // Dev-server only: the app's own modules, so the store and 3D scene can be driven directly.
  await page.evaluate(async () => {
    const m = await import('/src/state/store.ts')
    const presets = await import('/src/config/presets.ts')
    const cc = await import('/src/components/demo/cameraControl.ts')
    window.__vid = { store: m.useAppStore, presets, cc }
  })
  return { ctx, page, vw, vh, dsf }
}

class Rec {
  constructor(env, id) {
    this.page = env.page
    this.id = id
    this.max = SHOTS.find((s) => s.id === id).frames
    this.dir = path.join(WORK, 'frames', id)
    rmSync(this.dir, { recursive: true, force: true })
    mkdirSync(this.dir, { recursive: true })
    this.i = 0
    this.acc = 0
    this.cur = { x: -100, y: -100 }
    this.down = false
    this.frames = []
    this.out = { w: env.vw, h: env.vh, dsf: env.dsf, rects: {}, cam: [], hl: [], clicks: [] }
  }
  get left() { return this.max - this.i }
  async start() {
    const now = await this.page.evaluate(() => Date.now())
    await this.page.clock.pauseAt(now + 40)
  }
  /** Capture n frames; `each(i, n)` runs before each frame, `extra()` adds per-frame metadata. */
  async tick(n = 1, { ms = FRAME_MS, each, extra } = {}) {
    for (let k = 0; k < n && this.i < this.max; k++) {
      if (each) await each(k, n)
      this.acc += ms
      const step = Math.floor(this.acc)
      this.acc -= step
      await this.page.clock.runFor(step)
      await this.page.screenshot({ path: path.join(this.dir, `f${String(this.i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 94 })
      const fm = { x: Math.round(this.cur.x), y: Math.round(this.cur.y), d: this.down ? 1 : 0 }
      if (extra) Object.assign(fm, await extra())
      this.frames.push(fm)
      this.i++
    }
  }
  async move(x, y, n) {
    const x0 = this.cur.x, y0 = this.cur.y
    await this.tick(n, {
      each: async (k) => {
        const t = ease((k + 1) / n)
        this.cur = { x: x0 + (x - x0) * t, y: y0 + (y - y0) * t }
        await this.page.mouse.move(this.cur.x, this.cur.y)
      },
    })
  }
  async moveTo(loc, n) {
    const b = await loc.boundingBox()
    await this.move(b.x + b.width / 2, b.y + b.height / 2, n)
  }
  async click(holdFrames = 2) {
    this.out.clicks.push(this.i)
    await this.page.mouse.down()
    this.down = true
    await this.tick(holdFrames)
    await this.page.mouse.up()
    this.down = false
  }
  async rect(name, loc, pad = 0) {
    const b = await loc.boundingBox()
    if (!b) throw new Error(`no box for ${name}`)
    this.out.rects[name] = [b.x - pad, b.y - pad, b.width + 2 * pad, b.height + 2 * pad]
    return this.out.rects[name]
  }
  finish() {
    if (this.i < this.max) throw new Error(`${this.id}: captured ${this.i} of ${this.max} frames`)
    this.out.frames = this.frames
    meta.shots[this.id] = this.out
    writeFileSync(metaPath, JSON.stringify(meta))
  }
}

const setCursor = (page, h) => page.evaluate((h) => window.__vid.store.getState().setCursorH(h), h)
const sunState = (page) => async () => ({
  s: await page.evaluate(() => document.querySelector('.surface__overlay--tl .surface__state')?.textContent ?? ''),
})
const tab3d = (page) => page.getByRole('tab', { name: '3D', exact: true }).first()
const sunBtn = (page) => page.locator('button[title^="Turn the camera towards the Sun"]').first()
async function waitScene(page) {
  await page.waitForFunction(() => window.__vid.cc.getActiveScene() !== null, null, { timeout: 30000 })
  await sleep(3500)
}
async function fullscreen3d(page) {
  await page.locator('.views button[aria-label="Full screen"], button[aria-label="Full screen"]').first().click()
  await sleep(1500)
}

const shots = {
  // 3D first person at the Artemis candidate region: locked on the Sun while it grazes the ridge and sets.
  async hook() {
    const env = await open({ url: '/?m=a&tour=0' })
    const { page } = env
    await page.evaluate(() => {
      const s = window.__vid.store.getState()
      s.updateScenario(s.scenarios[0].id, { siteId: 'artemis_region_1' })
    })
    await sleep(1500)
    await tab3d(page).click()
    await waitScene(page)
    // The sunset inside the window is read from the app's own event list.
    const sunsetH = await page.evaluate(async () => {
      const { dataSource } = await import('/src/lib/loader.ts')
      const { listSkyEvents } = await import('/src/lib/events.ts')
      const { scenarioWindowMs } = await import('/src/state/selectors.ts')
      const st = window.__vid.store.getState()
      const sc = st.scenarios[0]
      const { startMs, endMs } = scenarioWindowMs(sc)
      const ev = listSkyEvents(await dataSource.loadSite(sc.siteId), st.observerHeightM, startMs, endMs)
      const e = ev.find((x) => x.kind === 'sunset' && (x.ms - startMs) / 3600e3 > 40)
      return e ? (e.ms - startMs) / 3600e3 : 344
    })
    const FLIP_AT = 84 // frame at which "Sun visible" flips
    const rate = 22 / 85
    const hAt = (f) => sunsetH + (f - FLIP_AT) * rate
    await setCursor(page, hAt(0))
    await sleep(800)
    const b = await sunBtn(page).boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down(); await sleep(900); await page.mouse.up()
    await sleep(1500)
    await fullscreen3d(page)
    await page.mouse.move(960, 1079)
    const rec = new Rec(env, 'hook')
    await rec.start()
    await rec.tick(rec.max, { ms: 110, each: (k) => setCursor(page, hAt(k)), extra: sunState(page) })
    rec.out.cam = [{ f: 0, cx: 960, cy: 540, z: 1.0 }, { f: 194, cx: 960, cy: 520, z: 1.06 }]
    rec.finish()
    await env.ctx.close()
  },

  // Advanced mode: real clicks open the Add scenario menu, pick the preset and press Play.
  async compare() {
    const env = await open({ url: '/?m=a&tour=0', dsf: 2 })
    const { page } = env
    await page.evaluate(() => window.__vid.store.getState().setSpeed(72))
    await sleep(500)
    const rec = new Rec(env, 'compare')
    rec.cur = { x: 760, y: 430 }
    await page.mouse.move(760, 430)
    await rec.start()
    await rec.tick(4)
    await rec.moveTo(page.locator('[data-demo="add-menu-toggle"]'), 9)
    await rec.click(2)
    await rec.tick(5)
    const item = page.locator('[role="menu"] [data-preset="apollo11_vs_artemis"]')
    await rec.rect('preset', item, 4)
    rec.out.hl.push({ from: rec.i + 3, to: rec.i + 16, rect: 'preset' })
    await rec.moveTo(item, 7)
    await rec.tick(5)
    await rec.click(2)
    await rec.tick(6)
    await rec.moveTo(page.getByRole('button', { name: 'Play', exact: true }), 9)
    await rec.click(2)
    const playAt = rec.i
    await rec.tick(6)
    await rec.move(1500, 1000, 8)
    rec.cur = { x: -100, y: -100 }
    const cards = page.locator('.card, [class*="scenario-card"], article')
    let c2 = null
    for (let k = 0; k < (await cards.count()); k++) {
      const t = await cards.nth(k).textContent()
      if (t && /Artemis candidate region/.test(t) && !/Apollo 11 —/.test(t.slice(0, 30))) c2 = cards.nth(k)
    }
    const r = c2 ? await rec.rect('card2', c2) : [968, 125, 928, 876]
    await rec.tick(rec.left)
    const cx = r[0] + r[2] / 2, cy = Math.min(r[1] + 330, 540)
    rec.out.cam = [
      { f: 0, cx: 960, cy: 540, z: 1 }, { f: playAt + 12, cx: 960, cy: 540, z: 1 },
      { f: playAt + 40, cx: cx - 40, cy: cy + 20, z: 1.5 }, { f: 158, cx: cx - 40, cy: cy + 20, z: 1.5 },
      { f: 182, cx: 960, cy: 540, z: 1 }, { f: 194, cx: 960, cy: 540, z: 1 },
    ]
    rec.finish()
    await env.ctx.close()
  },

  // Same site, 14 days later; then the slip tolerance strip, stepping the slip with the keyboard.
  async slip() {
    const env = await open({ url: '/?m=a&tour=0', vh: 1400, dsf: 2 })
    const { page } = env
    await page.evaluate(() => {
      const { store, presets } = window.__vid
      store.getState().applyPreset(presets.PRESET_SLIP, { autoplay: false })
    })
    await sleep(3500)
    if ((await page.locator('.slipstrip__note').count()) === 0) {
      await page.locator('button.disc__button').filter({ hasText: 'Dates and slip' }).last().click()
      await sleep(2500)
    }
    // Numbers and the sentence are read from the screen, never typed.
    const read = await page.evaluate(() => {
      const leaf = [...document.querySelectorAll('*')].filter((e) => e.children.length <= 2 && /^Sun visible[\s ]+\d/.test((e.textContent || '').trim()))
      const tiles = leaf.filter((e) => !leaf.some((o) => o !== e && e.contains(o)))
      const vals = tiles.map((e) => (e.textContent.match(/Sun visible[\s ]+(\d+(?:\.\d+)?)[\s ]*%/) || [])[1])
      const box = (e) => { let t = e; while (t.parentElement && t.getBoundingClientRect().height < 40) t = t.parentElement; const r = t.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }
      // the strip of the slipped (last) card
      const cells = [...document.querySelectorAll('.slipstrip__cells')].pop()
      let root = cells?.parentElement
      while (root && !root.querySelector('.slipstrip__note')) root = root.parentElement
      const noteEls = root ? [...root.querySelectorAll('.slipstrip__note')] : []
      const notes = noteEls.map((n) => n.textContent.trim())
      const strip = cells?.getBoundingClientRect()
      const note = noteEls[0]?.getBoundingClientRect()
      const lastNote = noteEls[noteEls.length - 1]?.getBoundingClientRect()
      return { vals, boxes: tiles.map(box), notes, strip: strip && [strip.x, strip.y, strip.width, strip.height], note: note && lastNote && [note.x, note.y, Math.max(note.width, lastNote.width), lastNote.bottom - note.y] }
    })
    if (read.vals.length < 2 || read.vals.some((v) => !v) || !read.strip) throw new Error('slip shot: could not read tiles or strip: ' + JSON.stringify(read))
    meta.vars.slipA = `${read.vals[0]} %`
    meta.vars.slipB = `${read.vals[1]} %`
    meta.vars.slipNote = read.notes.join(' ')
    const rec = new Rec(env, 'slip')
    const [t1, t2] = read.boxes
    rec.out.rects.tile1 = [t1[0] - 4, t1[1] - 4, t1[2] + 8, t1[3] + 8]
    rec.out.rects.tile2 = [t2[0] - 4, t2[1] - 4, t2[2] + 8, t2[3] + 8]
    rec.out.rects.strip = [read.strip[0] - 6, read.strip[1] - 6, read.strip[2] + 12, read.note[1] + read.note[3] - read.strip[1] + 14]
    const slider = page.locator('input[type="range"][max="60"]').last()
    await rec.start()
    rec.out.hl.push({ from: 6, to: 58, rect: 'tile1' }, { from: 12, to: 58, rect: 'tile2' })
    await rec.tick(64)
    await slider.focus()
    rec.out.hl.push({ from: 84, to: 148, rect: 'strip' })
    await rec.tick(26)
    const keys = [...Array(5).fill('ArrowRight'), ...Array(7).fill('ArrowLeft')]
    for (const k of keys) {
      await page.keyboard.press(k)
      await rec.tick(4)
    }
    await rec.tick(rec.left)
    const tx = (t1[0] + t2[0] + t2[2]) / 2, ty = t1[1] + t1[3] / 2
    const s = rec.out.rects.strip
    const zs = Math.min(1.9, 1700 / s[2])
    rec.out.cam = [
      { f: 0, cx: tx, cy: ty + 150, z: 1.25 }, { f: 58, cx: tx, cy: ty + 130, z: 1.32 },
      { f: 80, cx: s[0] + s[2] / 2, cy: s[1] + s[3] / 2 - 120, z: zs }, { f: 149, cx: s[0] + s[2] / 2, cy: s[1] + s[3] / 2 - 110, z: zs * 1.03 },
    ]
    rec.finish()
    await env.ctx.close()
  },

  // 3D on the surface at the IM-2 site: hold "Face the Sun" to lock, then follow the Sun to sunset.
  async surface() {
    const env = await open({ url: '/?m=a&tour=0', dsf: 2 })
    const { page } = env
    await tab3d(page).click()
    await waitScene(page)
    const sunsetH = await page.evaluate(async () => {
      const { dataSource } = await import('/src/lib/loader.ts')
      const { listSkyEvents } = await import('/src/lib/events.ts')
      const { scenarioWindowMs } = await import('/src/state/selectors.ts')
      const st = window.__vid.store.getState()
      const sc = st.scenarios[0]
      const { startMs, endMs } = scenarioWindowMs(sc)
      const ev = listSkyEvents(await dataSource.loadSite(sc.siteId), st.observerHeightM, startMs, endMs)
      const e = ev.find((x) => x.kind === 'sunset' && (x.ms - startMs) / 3600e3 > 60)
      return e ? (e.ms - startMs) / 3600e3 : 375
    })
    const h0 = sunsetH - 75
    await setCursor(page, h0)
    await page.locator('button[title*="lander"]').filter({ hasText: 'Face the lander' }).first().click()
    await sleep(1800)
    const rec = new Rec(env, 'surface')
    await rec.rect('sunBtn', sunBtn(page), 6)
    const cv = await rec.rect('canvas', page.locator('canvas[data-engine]').first())
    rec.cur = { x: cv[0] + cv[2] * 0.7, y: cv[1] + cv[3] * 0.6 }
    await page.mouse.move(rec.cur.x, rec.cur.y)
    await rec.start()
    await rec.tick(6, { extra: sunState(page) })
    await rec.moveTo(sunBtn(page), 12)
    rec.out.hl.push({ from: rec.i - 2, to: rec.i + 34, rect: 'sunBtn' })
    rec.out.clicks.push(rec.i)
    await page.mouse.down(); rec.down = true
    await rec.tick(17, { extra: sunState(page) })
    await page.mouse.up(); rec.down = false
    await rec.tick(15, { extra: sunState(page) })
    const n = rec.left
    const FLIP = n - 14
    await rec.tick(n, { ms: 110, each: (k) => setCursor(page, h0 + (sunsetH - h0) * (k / FLIP)), extra: sunState(page) })
    const cx = 960, cy = cv[1] + cv[3] / 2 - 10
    rec.out.cam = [{ f: 0, cx, cy, z: 1.08 }, { f: 109, cx, cy, z: 1.16 }]
    rec.finish()
    await env.ctx.close()
  },

  // Sunlight map in the Overview camera, full screen, slow orbit.
  async sunmap() {
    const env = await open({ url: '/?m=a&tour=0' })
    const { page } = env
    await tab3d(page).click()
    await waitScene(page)
    await setCursor(page, 250)
    await page.getByRole('button', { name: 'Sunlight map', exact: true }).first().click()
    await page.waitForFunction(() => !/Computing sunlight map/.test(document.body.textContent || ''), null, { timeout: 60000 }).catch(() => {})
    await sleep(2500)
    await page.getByText('Overview', { exact: true }).first().click()
    await sleep(2500)
    await fullscreen3d(page)
    await page.mouse.move(960, 1079)
    const rec = new Rec(env, 'sunmap')
    await rec.start()
    await page.evaluate(() => {
      const sc = window.__vid.cc.getActiveScene()
      sc.cameraTo({ azimuthDeg: 70, elevationDeg: sc.overviewElevationDeg(), durationMs: 6000 })
    })
    await rec.tick(rec.max)
    rec.out.cam = [{ f: 0, cx: 960, cy: 540, z: 1.0 }, { f: 84, cx: 960, cy: 540, z: 1.05 }]
    rec.finish()
    await env.ctx.close()
  },

  // Simple mode with the timeline playing.
  async simple() {
    const env = await open({ url: '/?m=s&tour=0', dsf: 2 })
    const { page } = env
    await page.evaluate(() => window.__vid.store.getState().setSpeed(24))
    await setCursor(page, 20)
    await sleep(600)
    const rec = new Rec(env, 'simple')
    await rec.start()
    await page.evaluate(() => window.__vid.store.getState().setPlaying(true))
    await rec.tick(rec.max)
    rec.out.cam = [{ f: 0, cx: 960, cy: 540, z: 1.0 }, { f: 44, cx: 960, cy: 560, z: 1.07 }]
    rec.finish()
    await env.ctx.close()
  },
}

// Validation count for the end card comes from the app's own data file.
try {
  const v = await (await fetch(`${APP_URL}/data/validation.json`)).json()
  meta.vars.checksTotal = v.checks.length
  meta.vars.checksPassed = v.checks.filter((c) => c.pass === true).length
} catch (e) {
  console.log('validation.json not readable:', e.message)
}

let failed = false
for (const s of SHOTS) {
  if (!shots[s.id] || (only.length && !only.includes(s.id))) continue
  const t0 = Date.now()
  try {
    await shots[s.id]()
    console.log(`shot ${s.id}: ${s.frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  } catch (e) {
    failed = true
    console.log(`shot ${s.id} FAILED: ${e.message.split('\n')[0]}`)
  }
}
writeFileSync(metaPath, JSON.stringify(meta))
await browser.close()
if (failed) process.exit(1)
