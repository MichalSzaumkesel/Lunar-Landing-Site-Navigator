import { PrintButton } from '../components/print/PrintButton'
import { ExportButton } from '../components/share/ExportButton'
import { ShareButton } from '../components/share/ShareButton'
import { SoundToggle } from '../components/sound/SoundToggle'
import { useAppStore } from '../state/store'

/** Secondary tools: share link, CSV export, dossier print export, optional sound cues. None of them is a primary action. */
export function Tools() {
  const mode = useAppStore((s) => s.mode)

  return (
    <div className="tools" role="group" aria-label="Tools" data-tour="tools">
      <ShareButton />
      <div
        className={mode === 'simple' ? 'toolbar-hidden' : undefined}
        aria-hidden={mode === 'simple' ? 'true' : undefined}
      >
        <ExportButton disabled={mode === 'simple'} />
      </div>
      <div
        className={mode === 'simple' ? 'toolbar-hidden' : undefined}
        aria-hidden={mode === 'simple' ? 'true' : undefined}
      >
        <PrintButton
          label="Export dossier"
          aria-label="Export dossier"
          disabled={mode === 'simple'}
        />
      </div>
      <SoundToggle />
    </div>
  )
}
