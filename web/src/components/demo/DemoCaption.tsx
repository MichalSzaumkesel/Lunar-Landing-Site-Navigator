import { useDemo } from './useDemo'
import './demo.css'

export function DemoCaption() {
  const { isActive, caption, stopDemo } = useDemo()

  if (!isActive) return null

  return (
    <aside
      className="demo-caption"
      role="region"
      aria-label="Demo narration"
      aria-live="polite"
    >
      <div className="demo-caption__content">
        <span className="demo-caption__badge">Demo</span>
        <p className="demo-caption__text">{caption}</p>
      </div>
      <div className="demo-caption__controls">
        <span className="demo-caption__hint">Esc to stop</span>
        <button
          type="button"
          className="demo-caption__stop"
          onClick={stopDemo}
          aria-label="Stop demo"
        >
          Stop demo
        </button>
      </div>
    </aside>
  )
}
