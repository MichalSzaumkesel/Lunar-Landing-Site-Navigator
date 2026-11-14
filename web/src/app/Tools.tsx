import { ShareMenu } from '../components/share/ShareMenu'
import { SoundToggle } from '../components/sound/SoundToggle'
import { useAppStore } from '../state/store'

/** Secondary tools: one share and export menu, optional sound cues. None of them is a primary action. */
export function Tools() {
  const mode = useAppStore((s) => s.mode)

  return (
    <div className="tools" role="group" aria-label="Tools" data-tour="tools">
      <ShareMenu advancedDisabled={mode === 'simple'} />
      <SoundToggle />
    </div>
  )
}
