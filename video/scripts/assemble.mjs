// Stage 4: encode. work/final/*.jpg + work/audio.wav -> out/lunar-landing-navigator-30s.mp4,
// a 720p copy, a poster PNG and a contact sheet; checks the duration with ffprobe.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { WORK, OUT, findFfmpeg } from './lib.mjs'
import { TOTAL_FRAMES, FPS, shotStarts } from './timeline.mjs'

const bin = findFfmpeg()
const ffmpeg = bin ? path.join(bin, 'ffmpeg.exe') : 'ffmpeg'
const ffprobe = bin ? path.join(bin, 'ffprobe.exe') : 'ffprobe'
const run = (args) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] })
mkdirSync(OUT, { recursive: true })
const frames = path.join(WORK, 'final', '%05d.jpg')
const wav = path.join(WORK, 'audio.wav')
const main = path.join(OUT, 'lunar-landing-navigator-30s.mp4')
const small = path.join(OUT, 'lunar-landing-navigator-30s-720p.mp4')
const dur = (TOTAL_FRAMES / FPS).toFixed(3)

// Loudness: two-pass EBU R128 to -16 LUFS, true peak -1.5 dBTP.
const TARGET = 'I=-16:TP=-1.5:LRA=11'
const m = spawnSync(ffmpeg, ['-hide_banner', '-i', wav, '-af', `loudnorm=${TARGET}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' })
const j = JSON.parse(m.stderr.slice(m.stderr.lastIndexOf('{'), m.stderr.lastIndexOf('}') + 1))
const af = `loudnorm=${TARGET}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`

const metaArgs = [
  '-metadata', 'title=Lunar Landing Site Navigator - NASA Space Apps Challenge 2026',
  '-metadata', 'comment=Screen capture of the team web app. Video edit and soundtrack (synthesised, original) produced with AI tools.',
]
const x264 = (crf) => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']
const vf = (extra = '') => `${extra}scale=out_color_matrix=bt709:out_range=tv,format=yuv420p`

run(['-framerate', String(FPS), '-start_number', '0', '-i', frames, '-i', wav, '-frames:v', String(TOTAL_FRAMES),
  '-vf', vf(), ...x264(16), '-af', af, '-c:a', 'aac', '-b:a', '192k', '-t', dur, '-movflags', '+faststart', ...metaArgs, main])
run(['-framerate', String(FPS), '-start_number', '0', '-i', frames, '-i', wav, '-frames:v', String(TOTAL_FRAMES),
  '-vf', vf('scale=1280:720:flags=lanczos,'), ...x264(19), '-af', af, '-c:a', 'aac', '-b:a', '160k', '-t', dur, '-movflags', '+faststart', ...metaArgs, small])

// Poster: the end card once every line is in. Contact sheet: 8 frames across the film.
const S = shotStarts()
run(['-start_number', String(S.end + 70), '-i', frames, '-frames:v', '1', path.join(OUT, 'poster.png')])
const picks = [45, 130, 185, S.compare + 110, S.slip + 30, S.slip + 120, S.surface + 80, S.sunmap + 40]
const sel = picks.map((p) => `eq(n\\,${p})`).join('+')
run(['-framerate', String(FPS), '-start_number', '0', '-i', frames, '-vf', `select='${sel}',scale=960:-1,tile=2x4`, '-fps_mode', 'vfr', '-frames:v', '1', path.join(OUT, 'contact-sheet.png')])

const probe = (f) => JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height,r_frame_rate,duration', '-of', 'json', f], { encoding: 'utf8' }))
let ok = true
for (const f of [main, small]) {
  const p = probe(f)
  const d = Number(p.format.duration)
  const v = p.streams.find((s) => s.width)
  const a = p.streams.find((s) => !s.width)
  console.log(`${path.basename(f)}: ${d.toFixed(3)} s, ${v.width}x${v.height} ${v.codec_name} ${v.r_frame_rate}, audio ${a.codec_name}, ${(statSync(f).size / 1e6).toFixed(1)} MB`)
  if (d > 30.0) { ok = false; console.log('  ERROR: longer than 30.0 s') }
}
const l = spawnSync(ffmpeg, ['-hide_banner', '-i', main, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' })
const sum = l.stderr.slice(l.stderr.lastIndexOf('Summary:'))
console.log('loudness:', (sum.match(/I:\s+(-?[\d.]+ LUFS)/) || [])[1], ' true peak:', (sum.match(/Peak:\s+(-?[\d.]+ dBFS)/) || [])[1])
if (!ok) process.exit(1)
