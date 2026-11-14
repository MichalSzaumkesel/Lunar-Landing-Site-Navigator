import { ExportButton } from '../components/share/ExportButton'
import { ShareButton } from '../components/share/ShareButton'
import { SoundToggle } from '../components/sound/SoundToggle'

/** Secondary tools: share link, CSV export, optional sound cues. None of them is a primary action. */
export function Tools() {
  return (
    <div className="tools" role="group" aria-label="Tools" data-tour="tools">
      <ShareButton />
      <ExportButton />
      <SoundToggle />
    </div>
  )
}
