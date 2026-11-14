import { PRESETS, PRESET_APOLLO_VS_ARTEMIS } from '../config/presets'
import { useAppStore } from '../state/store'

/** One-click presets. The Apollo vs Artemis comparison is the demo hook, with a featured stronger label weight. */
export function PresetBar() {
  const applyPreset = useAppStore((s) => s.applyPreset)

  return (
    <nav className="preset-bar" aria-label="Presets" data-tour="presets">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          className={p.id === PRESET_APOLLO_VS_ARTEMIS.id ? 'preset-featured' : undefined}
          title={p.description}
          onClick={() => applyPreset(p)}
        >
          {p.label}
        </button>
      ))}
    </nav>
  )
}
