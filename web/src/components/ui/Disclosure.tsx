import { useId } from 'react'
import type { ReactNode } from 'react'
import { useDisclosure } from '../../lib/disclosure'
import type { SectionKey } from '../../lib/disclosure'
import { usePresence } from '../../lib/usePresence'
import './disclosure.css'

export interface DisclosureProps {
  sectionKey: SectionKey
  title: string
  /** Short hint shown while the section is collapsed and no summary exists. */
  hint?: string
  /** One-line summary of the content, shown next to the title. */
  summary?: string
  children: ReactNode
}

/** A labelled section that is collapsed by default; its state is shared and remembered per section. */
export function Disclosure({ sectionKey, title, hint, summary, children }: DisclosureProps) {
  const { open, setOpen } = useDisclosure(sectionKey)
  const presence = usePresence(open)
  const panelId = useId()
  const line = summary ?? hint

  return (
    <section className="disc" data-open={open ? 'true' : 'false'} data-section={sectionKey}>
      <h3 className="disc__heading">
        <button
          type="button"
          className="disc__button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
        >
          <svg className="disc__chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M5 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="disc__title">{title}</span>
          {line && <span className="disc__summary">{line}</span>}
        </button>
      </h3>
      <div id={panelId} role="region" aria-label={title}>
        {presence.mounted && (
          <div className="presence-collapse" data-state={presence.state}>
            <div className="presence-collapse__inner">
              <div className="disc__body">{children}</div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
