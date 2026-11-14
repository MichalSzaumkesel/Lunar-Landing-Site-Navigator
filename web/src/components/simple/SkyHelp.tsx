import { useId, useState } from 'react'
import { usePresence } from '../../lib/usePresence'
import '../common/FullscreenButton.css'

/** Legend text for the sky plot; the centre part is computed from the actual plot zoom. */
function skyHelpText(centreText: string): string {
  return `Sky seen from the ground. Gold circle: the Sun. Blue circle: the Earth. Grey: hills that block the sky. Centre: ${centreText}. Edge: the horizon.`
}

export type DiagramView = 'sky' | 'horizon' | '3d'

const HELP_TEXT: Record<Exclude<DiagramView, 'sky'>, string> = {
  horizon: 'The horizon as you would see it standing on the surface, looking around. Gold: the Sun. Blue: the Earth.',
  '3d': 'A 3D view of the landing area. Drag to look around, click the terrain or use the arrow keys to move the lander. The terrain is a local approximation. Credits are under the i button.',
}

export interface SkyHelpProps {
  centreText: string
  view?: DiagramView
}

/** Small (?) marker for the top right corner of the sky plot card; its tooltip replaces a permanent legend. */
export function SkyHelp({ centreText, view = 'sky' }: SkyHelpProps) {
  const id = useId()
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  // Tap on touch screens (Safari does not focus buttons on tap).
  const [pinned, setPinned] = useState(false)
  const open = hover || focus || pinned
  const { mounted, state } = usePresence(open)

  return (
    <div className="sky-help" onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setPinned(false) }}>
      <button
        type="button"
        className="sky-help__marker"
        aria-label="What does this diagram show?"
        aria-describedby={mounted ? id : undefined}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); setPinned(false) }}
        onClick={() => setPinned((p) => !p)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setHover(false)
            setFocus(false)
            setPinned(false)
          }
        }}
      >
        ?
      </button>
      {mounted && (
        <div id={id} role="tooltip" className="sky-help__tip" data-state={state}>
          {view === 'sky' ? skyHelpText(centreText) : HELP_TEXT[view]}
        </div>
      )}
    </div>
  )
}
