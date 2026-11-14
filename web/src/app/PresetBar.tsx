import { PRESETS, PRESET_APOLLO_VS_ARTEMIS } from '../config/presets'
import { useAppStore } from '../state/store'

export interface PresetBarProps {
  className?: string
}

/** One-click presets. The Apollo vs Artemis comparison is the demo hook, with a featured stronger label weight. */
export function PresetBar({ className = '' }: PresetBarProps) {
  const applyPreset = useAppStore((s) => s.applyPreset)
  const mode = useAppStore((s) => s.mode)

  return (
    <nav
      className={`preset-bar ${className} ${mode === 'simple' ? 'toolbar-hidden' : ''}`.trim()}
      aria-label="Presets"
      data-tour="presets"
      aria-hidden={mode === 'simple' ? 'true' : undefined}
    >
      {PRESETS.map((p) => (
        <button
          key={p.id}
          className={p.id === PRESET_APOLLO_VS_ARTEMIS.id ? 'preset-featured' : undefined}
          title={p.description}
          onClick={() => applyPreset(p)}
          tabIndex={mode === 'simple' ? -1 : undefined}
          disabled={mode === 'simple'}
        >
          {p.label}
        </button>
      ))}
    </nav>
  )
}
