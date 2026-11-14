/** Spell out a playback speed (hours of mission time per real second). */
export function formatSpeed(hPerSec: number, compact = false): string {
  const days = hPerSec >= 24 && hPerSec % 24 === 0
  const n = days ? hPerSec / 24 : hPerSec
  const unit = days ? 'day' : 'hour'
  const word = n === 1 ? unit : `${unit}s`
  return `${n} ${word} ${compact ? '/ s' : 'per second'}`
}
