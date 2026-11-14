import { type ButtonHTMLAttributes, type MouseEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { PrintBrief, type PrintBriefProps } from './PrintBrief'
import './print.css'

export interface PrintButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string
  disabled?: boolean
  'aria-label'?: string
  label?: string
  /**
   * Whether to also render the PrintBrief container next to the button.
   * Defaults to true so the brief is automatically placed in DOM for print.
   */
  renderBrief?: boolean
  /** Optional custom props forwarded to the rendered PrintBrief. */
  briefProps?: PrintBriefProps
}

export function PrintButton({
  className = '',
  disabled = false,
  label = 'Print brief',
  'aria-label': ariaLabel,
  renderBrief = true,
  briefProps,
  onClick,
  children,
  ...rest
}: PrintButtonProps): ReactElement {
  const effectiveAriaLabel = ariaLabel ?? label
  const tooltip = `${label}: opens browser print dialog for a clean light-theme summary`

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    onClick?.(e)
    if (!e.defaultPrevented && typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print()
    }
  }

  return (
    <>
      <button
        type="button"
        className={`print-button ${className}`.trim()}
        onClick={handleClick}
        disabled={disabled}
        aria-label={effectiveAriaLabel}
        title={tooltip}
        {...rest}
      >
        <svg
          className="print-button__icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        <span>{children ?? label}</span>
      </button>

      {renderBrief && createPortal(<PrintBrief {...briefProps} />, document.body)}
    </>
  )
}
