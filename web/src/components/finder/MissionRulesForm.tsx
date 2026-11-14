import { useState } from 'react'
import { usePresenceValue } from '../../lib/usePresence'
import type { ChangeEvent } from 'react'
import type { MissionRules } from '../../lib/types'
import { useAppStore } from '../../state/store'
import './finder.css'

/** Inline field error that fades in and out instead of popping. */
function FieldError({ id, message }: { id: string; message: string | undefined }) {
  const p = usePresenceValue(message)
  if (!p.mounted) return null
  return (
    <p id={id} className="finder-form__error presence-rise" data-state={p.state} role="alert">
      {p.value}
    </p>
  )
}

export interface MissionRulesFormProps {
  className?: string
}

interface FormErrors {
  missionDurationH?: string
  minPctSunlit?: string
  maxLongestDarkH?: string
  minPctEarth?: string
  minSunElAtLandingDeg?: string
}

interface DraftInputs {
  duration?: string
  sunlit?: string
  dark?: string
  earth?: string
  sunEl?: string
}

const DEFAULT_EXAMPLE_RULES: Omit<MissionRules, 'observerHeightM'> = {
  missionDurationH: 240,
  minPctSunlit: 70,
  maxLongestDarkH: 48,
  earthAtLandingRequired: true,
  minPctEarth: 50,
  minSunElAtLandingDeg: undefined,
}

const PRESET_SHORT_STAY: Omit<MissionRules, 'observerHeightM'> = {
  missionDurationH: 72,
  minPctSunlit: 80,
  maxLongestDarkH: 12,
  earthAtLandingRequired: true,
  minPctEarth: 60,
  minSunElAtLandingDeg: undefined,
}

const PRESET_ONE_WEEK: Omit<MissionRules, 'observerHeightM'> = {
  missionDurationH: 168,
  minPctSunlit: 70,
  maxLongestDarkH: 36,
  earthAtLandingRequired: true,
  minPctEarth: 50,
  minSunElAtLandingDeg: undefined,
}

const PRESET_LUNAR_DAY: Omit<MissionRules, 'observerHeightM'> = {
  missionDurationH: 336,
  minPctSunlit: 50,
  maxLongestDarkH: 120,
  earthAtLandingRequired: false,
  minPctEarth: 30,
  minSunElAtLandingDeg: undefined,
}

export function MissionRulesForm({ className = '' }: MissionRulesFormProps) {
  const missionRules = useAppStore((s) => s.missionRules)
  const setMissionRules = useAppStore((s) => s.setMissionRules)
  const observerHeightM = useAppStore((s) => s.observerHeightM)

  // Local draft overrides when inputs contain invalid text
  const [drafts, setDrafts] = useState<DraftInputs>({})
  const [errors, setErrors] = useState<FormErrors>({})

  const durationStr = drafts.duration ?? String(missionRules.missionDurationH)
  const sunlitStr = drafts.sunlit ?? String(missionRules.minPctSunlit)
  const darkStr = drafts.dark ?? String(missionRules.maxLongestDarkH)
  const earthStr = drafts.earth ?? String(missionRules.minPctEarth)
  const sunElStr =
    drafts.sunEl ??
    (missionRules.minSunElAtLandingDeg !== undefined
      ? String(missionRules.minSunElAtLandingDeg)
      : '')

  function handleDurationChange(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    const n = Number(val)
    if (val.trim() === '' || !Number.isFinite(n) || n < 1 || n > 1440) {
      setDrafts((prev) => ({ ...prev, duration: val }))
      setErrors((prev) => ({ ...prev, missionDurationH: 'Must be between 1 and 1440 hours.' }))
    } else {
      setDrafts((prev) => ({ ...prev, duration: undefined }))
      setErrors((prev) => ({ ...prev, missionDurationH: undefined }))
      setMissionRules({ missionDurationH: n })
    }
  }

  function handleSunlitChange(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    const n = Number(val)
    if (val.trim() === '' || !Number.isFinite(n) || n < 0 || n > 100) {
      setDrafts((prev) => ({ ...prev, sunlit: val }))
      setErrors((prev) => ({ ...prev, minPctSunlit: 'Must be between 0 and 100 percent.' }))
    } else {
      setDrafts((prev) => ({ ...prev, sunlit: undefined }))
      setErrors((prev) => ({ ...prev, minPctSunlit: undefined }))
      setMissionRules({ minPctSunlit: n })
    }
  }

  function handleDarkChange(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    const n = Number(val)
    if (val.trim() === '' || !Number.isFinite(n) || n < 0 || n > 1440) {
      setDrafts((prev) => ({ ...prev, dark: val }))
      setErrors((prev) => ({ ...prev, maxLongestDarkH: 'Must be between 0 and 1440 hours.' }))
    } else {
      setDrafts((prev) => ({ ...prev, dark: undefined }))
      setErrors((prev) => ({ ...prev, maxLongestDarkH: undefined }))
      setMissionRules({ maxLongestDarkH: n })
    }
  }

  function handleEarthChange(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    const n = Number(val)
    if (val.trim() === '' || !Number.isFinite(n) || n < 0 || n > 100) {
      setDrafts((prev) => ({ ...prev, earth: val }))
      setErrors((prev) => ({ ...prev, minPctEarth: 'Must be between 0 and 100 percent.' }))
    } else {
      setDrafts((prev) => ({ ...prev, earth: undefined }))
      setErrors((prev) => ({ ...prev, minPctEarth: undefined }))
      setMissionRules({ minPctEarth: n })
    }
  }

  function handleSunElChange(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    if (val.trim() === '') {
      setDrafts((prev) => ({ ...prev, sunEl: undefined }))
      setErrors((prev) => ({ ...prev, minSunElAtLandingDeg: undefined }))
      setMissionRules({ minSunElAtLandingDeg: undefined })
      return
    }
    const n = Number(val)
    if (!Number.isFinite(n) || n < -90 || n > 90) {
      setDrafts((prev) => ({ ...prev, sunEl: val }))
      setErrors((prev) => ({
        ...prev,
        minSunElAtLandingDeg: 'Must be between -90 and 90 degrees or empty.',
      }))
    } else {
      setDrafts((prev) => ({ ...prev, sunEl: undefined }))
      setErrors((prev) => ({ ...prev, minSunElAtLandingDeg: undefined }))
      setMissionRules({ minSunElAtLandingDeg: n })
    }
  }

  function applyPreset(preset: Omit<MissionRules, 'observerHeightM'>) {
    setDrafts({})
    setErrors({})
    setMissionRules(preset)
  }

  const daysDisplay = (missionRules.missionDurationH / 24).toFixed(1).replace(/\.0$/, '')

  return (
    <form
      className={`finder-form ${className}`.trim()}
      onSubmit={(e) => e.preventDefault()}
      aria-label="Mission rules form"
    >
      <div className="finder-form__header">
        <h3 className="finder-form__title">Mission rules</h3>
        <div className="finder-form__presets" role="group" aria-label="Mission rule presets">
          <button
            type="button"
            className="finder-form__preset-btn"
            onClick={() => applyPreset(PRESET_SHORT_STAY)}
            title="Set rules for 72 h stay, 80% Sun, 12 h dark, Earth at landing, 60% Earth"
          >
            Short stay, 3 days
          </button>
          <button
            type="button"
            className="finder-form__preset-btn"
            onClick={() => applyPreset(PRESET_ONE_WEEK)}
            title="Set rules for 168 h stay, 70% Sun, 36 h dark, Earth at landing, 50% Earth"
          >
            One week
          </button>
          <button
            type="button"
            className="finder-form__preset-btn"
            onClick={() => applyPreset(PRESET_LUNAR_DAY)}
            title="Set rules for 336 h stay, 50% Sun, 120 h dark, no Earth at landing, 30% Earth"
          >
            Lunar day, 14 days
          </button>
        </div>
      </div>

      <div className="finder-form__fields">
        {/* Mission length */}
        <div className="finder-form__field">
          <label
            htmlFor="rule-missionDurationH"
            className="finder-form__label"
            title="Total mission duration on the lunar surface (contract §3: missionDurationH, 1 to 1440 hours)"
          >
            <span>Mission length</span>
            <span className="finder-form__unit">hours ({daysDisplay} days)</span>
          </label>
          <input
            id="rule-missionDurationH"
            type="number"
            min={1}
            max={1440}
            step={1}
            value={durationStr}
            onChange={handleDurationChange}
            className="finder-form__input"
            aria-invalid={Boolean(errors.missionDurationH)}
            aria-describedby={errors.missionDurationH ? 'error-missionDurationH' : undefined}
            title="Total mission duration on the lunar surface (contract §3: missionDurationH, 1 to 1440 hours)"
          />
          <FieldError id="error-missionDurationH" message={errors.missionDurationH} />
        </div>

        {/* Min share Sun visible */}
        <div className="finder-form__field">
          <label
            htmlFor="rule-minPctSunlit"
            className="finder-form__label"
            title="Required minimum percentage of mission duration with the Sun visible above horizon (contract §3: minPctSunlit, 0 to 100%)"
          >
            <span>Minimum share of time with Sun visible</span>
            <span className="finder-form__unit">%</span>
          </label>
          <input
            id="rule-minPctSunlit"
            type="number"
            min={0}
            max={100}
            step={1}
            value={sunlitStr}
            onChange={handleSunlitChange}
            className="finder-form__input"
            aria-invalid={Boolean(errors.minPctSunlit)}
            aria-describedby={errors.minPctSunlit ? 'error-minPctSunlit' : undefined}
            title="Required minimum percentage of mission duration with the Sun visible above horizon (contract §3: minPctSunlit, 0 to 100%)"
          />
          <FieldError id="error-minPctSunlit" message={errors.minPctSunlit} />
        </div>

        {/* Longest dark stretch */}
        <div className="finder-form__field">
          <label
            htmlFor="rule-maxLongestDarkH"
            className="finder-form__label"
            title="Maximum allowable continuous duration where the Sun is below horizon (contract §3: maxLongestDarkH, 0 to 1440 hours)"
          >
            <span>Longest dark stretch allowed</span>
            <span className="finder-form__unit">hours</span>
          </label>
          <input
            id="rule-maxLongestDarkH"
            type="number"
            min={0}
            max={1440}
            step={1}
            value={darkStr}
            onChange={handleDarkChange}
            className="finder-form__input"
            aria-invalid={Boolean(errors.maxLongestDarkH)}
            aria-describedby={errors.maxLongestDarkH ? 'error-maxLongestDarkH' : undefined}
            title="Maximum allowable continuous duration where the Sun is below horizon (contract §3: maxLongestDarkH, 0 to 1440 hours)"
          />
          <FieldError id="error-maxLongestDarkH" message={errors.maxLongestDarkH} />
        </div>

        {/* Earth in view at landing */}
        <div className="finder-form__field finder-form__checkbox-field">
          <input
            id="rule-earthAtLandingRequired"
            type="checkbox"
            checked={missionRules.earthAtLandingRequired}
            onChange={(e) => setMissionRules({ earthAtLandingRequired: e.target.checked })}
            className="finder-form__checkbox"
            title="Requires Earth to be above the local horizon at the moment of landing (contract §3: earthAtLandingRequired)"
          />
          <label
            htmlFor="rule-earthAtLandingRequired"
            className="finder-form__label"
            title="Requires Earth to be above the local horizon at the moment of landing (contract §3: earthAtLandingRequired)"
          >
            Earth in view at landing
          </label>
        </div>

        {/* Min share Earth in view */}
        <div className="finder-form__field">
          <label
            htmlFor="rule-minPctEarth"
            className="finder-form__label"
            title="Required minimum percentage of mission duration with Earth in view above horizon (contract §3: minPctEarth, 0 to 100%)"
          >
            <span>Minimum share of time with Earth in view</span>
            <span className="finder-form__unit">%</span>
          </label>
          <input
            id="rule-minPctEarth"
            type="number"
            min={0}
            max={100}
            step={1}
            value={earthStr}
            onChange={handleEarthChange}
            className="finder-form__input"
            aria-invalid={Boolean(errors.minPctEarth)}
            aria-describedby={errors.minPctEarth ? 'error-minPctEarth' : undefined}
            title="Required minimum percentage of mission duration with Earth in view above horizon (contract §3: minPctEarth, 0 to 100%)"
          />
          <FieldError id="error-minPctEarth" message={errors.minPctEarth} />
        </div>

        {/* Min Sun elevation at landing */}
        <div className="finder-form__field">
          <label
            htmlFor="rule-minSunElAtLandingDeg"
            className="finder-form__label"
            title="Optional minimum elevation angle of the Sun above horizon at landing in degrees (contract §3: minSunElAtLandingDeg). Empty means no rule."
          >
            <span>Minimum Sun elevation above the horizon at landing</span>
            <span className="finder-form__unit">degrees</span>
          </label>
          <input
            id="rule-minSunElAtLandingDeg"
            type="number"
            min={-90}
            max={90}
            step={0.5}
            placeholder="No rule"
            value={sunElStr}
            onChange={handleSunElChange}
            className="finder-form__input"
            aria-invalid={Boolean(errors.minSunElAtLandingDeg)}
            aria-describedby={errors.minSunElAtLandingDeg ? 'error-minSunElAtLandingDeg' : undefined}
            title="Optional minimum elevation angle of the Sun above horizon at landing in degrees (contract §3: minSunElAtLandingDeg). Empty means no rule."
          />
          <FieldError id="error-minSunElAtLandingDeg" message={errors.minSunElAtLandingDeg} />
        </div>
      </div>

      <div className="finder-form__footer">
        <p className="finder-form__observer">
          Observer height {observerHeightM} m, change it in the top bar
        </p>
        <button
          type="button"
          className="finder-form__reset-btn"
          onClick={() => applyPreset(DEFAULT_EXAMPLE_RULES)}
          title="Restore example mission rules (240 h, 70% Sun, 48 h dark stretch, Earth at landing, 50% Earth)"
        >
          Reset to example mission
        </button>
      </div>
    </form>
  )
}

export default MissionRulesForm
