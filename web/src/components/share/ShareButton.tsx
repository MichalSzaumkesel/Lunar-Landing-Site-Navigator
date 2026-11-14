import { useEffect, useRef, useState, type ReactElement } from 'react'
import { shareUrl } from '../../state/useUrlSync'
import './share.css'

export interface ShareButtonProps {
  className?: string
  disabled?: boolean
}

/** Secondary-style button that copies the shareable URL to clipboard with fallback. */
export function ShareButton({
  className = '',
  disabled = false,
}: ShareButtonProps): ReactElement {
  const [copied, setCopied] = useState(false)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (fallbackUrl && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [fallbackUrl])

  const handleCopy = async (): Promise<void> => {
    const url = shareUrl()
    setError(null)
    setFallbackUrl(null)

    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        if (timerRef.current) {
          clearTimeout(timerRef.current)
        }
        timerRef.current = setTimeout(() => {
          setCopied(false)
        }, 2000)
        return
      } catch {
        // Fall back to text box below
      }
    }

    setFallbackUrl(url)
    setError('Could not copy. Copy the address from the box.')
  }

  return (
    <div className="share-wrap">
      <div className="share-action-row">
        <button
          type="button"
          className={className}
          disabled={disabled}
          onClick={handleCopy}
          title="Copy scenario link to clipboard"
        >
          Copy link
        </button>
        <span aria-live="polite" className="share-status">
          {copied ? 'Link copied' : ''}
        </span>
      </div>

      {fallbackUrl && (
        <div className="share-fallback">
          {error && (
            <p role="alert" className="share-error">
              {error}
            </p>
          )}
          <input
            ref={inputRef}
            type="text"
            readOnly
            value={fallbackUrl}
            className="share-fallback-input"
            aria-label="Share URL fallback"
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
    </div>
  )
}
