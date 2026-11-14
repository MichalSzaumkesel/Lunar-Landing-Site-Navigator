import { useId, useState } from 'react'
import { usePresence } from '../../lib/usePresence'

/** Legend text for the sky plot; the centre part is computed from the actual plot zoom. */
function skyHelpText(centreText: string): string {
  return `Sky seen from the ground. Gold circle: the Sun. Blue circle: the Earth. Grey: hills that block the sky. Centre: ${centreText}. Edge: the horizon.`
}

export interface SkyHelpProps {
  centreText: string
}

/** Small (?) marker for the top right corner of the sky plot card; its tooltip replaces a permanent legend. */
export function SkyHelp({ centreText }: SkyHelpProps) {
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
          {skyHelpText(centreText)}
        </div>
      )}
    </div>
  )
}
