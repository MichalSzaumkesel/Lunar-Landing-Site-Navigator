// Stage 3: original soundtrack, synthesised from scratch (no samples, no third-party music).
// A calm sine pad with three chords, soft noise whooshes on the cuts, small ticks on the clicks,
// a two-note chime when "Sun visible" flips, and a bell on the title and the end card.
// Deterministic: the same timeline gives the same WAV. Output: work/audio.wav (48 kHz stereo, 16 bit).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { WORK } from './lib.mjs'
import { SHOTS, TOTAL_FRAMES, FPS, shotStarts } from './timeline.mjs'

const SR = 48000
const DUR = TOTAL_FRAMES / FPS
const N = Math.ceil(DUR * SR)
const L = new Float64Array(N), R = new Float64Array(N)
const TAU = Math.PI * 2
const meta = JSON.parse(readFileSync(path.join(WORK, 'meta.json'), 'utf8'))
const starts = shotStarts()
const sec = (shot, f) => (starts[shot] + f) / FPS

// seeded noise so the file is reproducible
let seed = 20261115
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x) }

function add(i, l, r) { if (i >= 0 && i < N) { L[i] += l; R[i] += r } }

// --- pad ---------------------------------------------------------------------------------------
const A2 = 110
const st = (n) => A2 * Math.pow(2, n / 12)
const CHORDS = [
  { from: 0, to: sec('compare', 0), notes: [st(0), st(7), st(12), st(14)], gain: 0.8 }, // A sus2, open and dark
  { from: sec('compare', 0), to: sec('surface', 0), notes: [st(0), st(7), st(12), st(16), st(19), st(26)], gain: 1 }, // A add9
  { from: sec('surface', 0), to: sec('end', 0), notes: [st(-7), st(5), st(12), st(16), st(21), st(26)], gain: 1 }, // D maj9
  { from: sec('end', 0), to: DUR + 1, notes: [st(0), st(7), st(12), st(16), st(19), st(26), st(31)], gain: 1.1 }, // A add9, resolved
]
const XF = 0.9
CHORDS.forEach((c, ci) => {
  c.notes.forEach((f, k) => {
    const pan = ((k % 2 ? 1 : -1) * (0.25 + 0.12 * k)) / 1.2
    const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4)
    const lfoF = 0.07 + 0.031 * k + 0.013 * ci, lfoP = k * 1.7 + ci
    const amp = (0.05 * c.gain) / Math.pow(f / 110, 0.55)
    const i0 = Math.max(0, Math.floor((c.from - XF) * SR)), i1 = Math.min(N, Math.ceil((c.to + XF) * SR))
    for (let i = i0; i < i1; i++) {
      const t = i / SR
      const e = smooth((t - (c.from - XF)) / (2 * XF)) * (1 - smooth((t - (c.to - XF)) / (2 * XF)))
      const trem = 0.72 + 0.28 * Math.sin(TAU * lfoF * t + lfoP)
      const v = (Math.sin(TAU * f * 0.9985 * t) + Math.sin(TAU * f * 1.0015 * t + 1.3) + 0.22 * Math.sin(TAU * f * 2 * t + 0.4) + 0.07 * Math.sin(TAU * f * 3 * t)) * amp * e * trem
      L[i] += v * gl; R[i] += v * gr
    }
  })
})

// --- low swell under the hook -------------------------------------------------------------------
for (let i = 0; i < Math.min(N, 7 * SR); i++) {
  const t = i / SR
  const e = smooth(t / 2.6) * (1 - smooth((t - 5.2) / 1.6))
  const v = Math.sin(TAU * 55 * t) * 0.16 * e
  L[i] += v; R[i] += v
}

// --- helpers for one-shot sounds ---------------------------------------------------------------
function whoosh(t0, len = 0.7, gain = 0.1) {
  let lp = 0, bp = 0
  const i0 = Math.floor((t0 - len * 0.55) * SR), n = Math.floor(len * SR)
  for (let k = 0; k < n; k++) {
    const x = k / n
    const e = Math.pow(Math.sin(Math.PI * Math.pow(x, 0.8)), 2)
    const fc = 500 + 3800 * Math.sin(Math.PI * x)
    const fq = 2 * Math.sin((Math.PI * fc) / SR)
    const hp = rnd() - lp - 0.9 * bp
    bp += fq * hp; lp += fq * bp
    const v = bp * gain * e
    const pan = -0.6 + 1.2 * x
    add(i0 + k, v * (1 - pan) * 0.5, v * (1 + pan) * 0.5)
  }
}
function bell(t0, f, gain = 0.1, decay = 1.6, pan = 0) {
  const parts = [[1, 1], [2.0, 0.42], [2.76, 0.2], [4.07, 0.1], [5.4, 0.05]]
  const n = Math.floor(decay * 3.2 * SR), i0 = Math.floor(t0 * SR)
  for (let k = 0; k < n; k++) {
    const t = k / SR
    let v = 0
    for (const [m, a] of parts) v += a * Math.sin(TAU * f * m * t) * Math.exp((-t * m) / decay)
    v *= gain * Math.min(1, t / 0.004)
    add(i0 + k, v * (1 - pan) * 0.5 * 1.4, v * (1 + pan) * 0.5 * 1.4)
  }
}
function tick(t0, gain = 0.07) {
  const n = Math.floor(0.06 * SR), i0 = Math.floor(t0 * SR)
  for (let k = 0; k < n; k++) {
    const t = k / SR
    const v = (Math.sin(TAU * 1900 * t) + 0.5 * Math.sin(TAU * 3100 * t)) * Math.exp(-t * 90) * gain
    add(i0 + k, v, v)
  }
}

// --- events from the timeline and the capture metadata ------------------------------------------
for (const s of SHOTS) if (starts[s.id] > 0) whoosh(starts[s.id] / FPS, s.id === 'end' ? 1.1 : 0.7, s.id === 'end' ? 0.13 : 0.09)
whoosh(sec('hook', 104), 0.9, 0.08)
for (const [id, m] of Object.entries(meta.shots)) for (const c of m.clicks || []) tick(sec(id, c))
for (const id of ['hook', 'surface']) {
  const fr = meta.shots[id]?.frames || []
  for (let k = 1; k < fr.length; k++) {
    if (fr[k].s !== undefined && fr[k].s !== fr[k - 1].s) {
      bell(sec(id, k), st(43), 0.06, 0.7, -0.2) // E5
      bell(sec(id, k) + 0.16, st(40), 0.06, 0.9, 0.2) // C#5
    }
  }
}
bell(sec('hook', 162), st(36), 0.1, 1.5) // A4 on the title
bell(sec('hook', 162) + 0.02, st(43), 0.05, 1.3, 0.3)
bell(sec('end', 4), st(36), 0.12, 2.0)
bell(sec('end', 4) + 0.03, st(40), 0.07, 1.8, -0.3)
bell(sec('end', 4) + 0.06, st(43), 0.06, 1.8, 0.3)

// --- a little space: two cross-fed delays --------------------------------------------------------
const d1 = Math.floor(0.173 * SR), d2 = Math.floor(0.257 * SR)
for (let i = d2; i < N; i++) {
  L[i] += 0.22 * R[i - d1] + 0.12 * L[i - d2]
  R[i] += 0.22 * L[i - d1] + 0.12 * R[i - d2]
}

// --- master: fades, soft limit, 16-bit ----------------------------------------------------------
let peak = 0
for (let i = 0; i < N; i++) {
  const t = i / SR
  const g = smooth(t / 0.35) * (1 - smooth((t - (DUR - 1.3)) / 1.25))
  L[i] *= g; R[i] *= g
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
}
const norm = 0.7 / peak
const buf = Buffer.alloc(44 + N * 4)
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8)
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24)
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(Math.tanh(L[i] * norm * 1.1) * 32000), 44 + i * 4)
  buf.writeInt16LE(Math.round(Math.tanh(R[i] * norm * 1.1) * 32000), 46 + i * 4)
}
mkdirSync(WORK, { recursive: true })
writeFileSync(path.join(WORK, 'audio.wav'), buf)
console.log(`audio: ${DUR.toFixed(3)} s, ${N} samples`)
