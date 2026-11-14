// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TopBar } from './TopBar'
import { Tools } from './Tools'
import { Transport } from './Transport'
import { useAppStore } from '../state/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

describe('Stable layout between Simple and Advanced modes', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    // Start with default store state
    act(() => {
      useAppStore.setState({ mode: 'advanced' })
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  describe('TopBar', () => {
    it('keeps all controls mounted and reserves space when switching modes', () => {
      act(() => {
        root.render(createElement(TopBar))
      })

      // In Advanced mode:
      const presetBar = container.querySelector('[data-tour="presets"]')!
      const observerHeight = container.querySelector('[data-tour="observer-height"]')!
      const modeSwitch = container.querySelector('[data-tour="mode-switch"]')!
      const tutorialBtn = container.querySelector('[data-tour="help-button"]')!
      const demoBtn = container.querySelector('button[aria-label="Start demo"]')!

      expect(presetBar).not.toBeNull()
      expect(presetBar.classList.contains('toolbar-hidden')).toBe(false)
      expect(presetBar.getAttribute('aria-hidden')).toBeNull()

      expect(observerHeight).not.toBeNull()
      expect(observerHeight.classList.contains('toolbar-hidden')).toBe(false)
      expect(observerHeight.getAttribute('aria-hidden')).toBeNull()

      expect(modeSwitch).not.toBeNull()
      expect(tutorialBtn).not.toBeNull()
      expect(demoBtn).not.toBeNull()

      // Switch to Simple mode
      act(() => {
        useAppStore.getState().setMode('simple')
      })

      // Controls must NOT be removed from DOM, but hidden with toolbar-hidden (visibility:hidden)
      const presetBarSimple = container.querySelector('[data-tour="presets"]')!
      const observerHeightSimple = container.querySelector('[data-tour="observer-height"]')!
      const modeSwitchSimple = container.querySelector('[data-tour="mode-switch"]')!
      const tutorialBtnSimple = container.querySelector('[data-tour="help-button"]')!
      const demoBtnSimple = container.querySelector('button[aria-label="Start demo"]')!

      expect(presetBarSimple).toBe(presetBar)
      expect(presetBarSimple.classList.contains('toolbar-hidden')).toBe(true)
      expect(presetBarSimple.getAttribute('aria-hidden')).toBe('true')
      // Preset buttons should be disabled and removed from tab order
      const presetBtns = presetBarSimple.querySelectorAll('button')
      presetBtns.forEach((btn) => {
        expect(btn.disabled).toBe(true)
        expect(btn.tabIndex).toBe(-1)
      })

      expect(observerHeightSimple).toBe(observerHeight)
      expect(observerHeightSimple.classList.contains('toolbar-hidden')).toBe(true)
      expect(observerHeightSimple.getAttribute('aria-hidden')).toBe('true')
      const obsBtns = observerHeightSimple.querySelectorAll('button')
      obsBtns.forEach((btn) => {
        expect(btn.disabled).toBe(true)
        expect(btn.tabIndex).toBe(-1)
      })

      // Core controls stay visible and interactive
      expect(modeSwitchSimple).toBe(modeSwitch)
      expect(modeSwitchSimple.classList.contains('toolbar-hidden')).toBe(false)
      expect(tutorialBtnSimple).toBe(tutorialBtn)
      expect(tutorialBtnSimple.classList.contains('toolbar-hidden')).toBe(false)
      expect(demoBtnSimple).toBe(demoBtn)
      expect(demoBtnSimple.classList.contains('toolbar-hidden')).toBe(false)
    })

    it('restores visibility when switching back from Simple to Advanced', () => {
      act(() => {
        useAppStore.setState({ mode: 'simple' })
        root.render(createElement(TopBar))
      })

      const presetBar = container.querySelector('[data-tour="presets"]')!
      const observerHeight = container.querySelector('[data-tour="observer-height"]')!

      expect(presetBar.classList.contains('toolbar-hidden')).toBe(true)
      expect(observerHeight.classList.contains('toolbar-hidden')).toBe(true)

      act(() => {
        useAppStore.getState().setMode('advanced')
      })

      expect(presetBar.classList.contains('toolbar-hidden')).toBe(false)
      expect(presetBar.getAttribute('aria-hidden')).toBeNull()
      expect(observerHeight.classList.contains('toolbar-hidden')).toBe(false)
      expect(observerHeight.getAttribute('aria-hidden')).toBeNull()

      const presetBtns = presetBar.querySelectorAll('button')
      presetBtns.forEach((btn) => {
        expect(btn.disabled).toBe(false)
        expect(btn.tabIndex).toBe(0)
      })
    })
  })

  describe('Tools toolbar', () => {
    it('keeps one Share and export button in place across modes; extra items disable in simple', () => {
      act(() => {
        root.render(createElement(Tools))
      })

      const trigger = container.querySelector('button[aria-haspopup="menu"]')!
      const soundBtn = container.querySelector('button[title*="Short tones"]')!
      expect(trigger).not.toBeNull()
      expect(soundBtn).not.toBeNull()
      expect(trigger.textContent).toContain('Share and export')

      act(() => {
        useAppStore.getState().setMode('simple')
      })

      expect(container.querySelector('button[aria-haspopup="menu"]')).toBe(trigger)
      expect((trigger as HTMLButtonElement).disabled).toBe(false)
      act(() => {
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      const items = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      expect(items.map((i) => i.disabled)).toEqual([false, true, true])
    })
  })

  describe('Transport toolbar', () => {
    it('renders Play, speed selector, and scrubber stably across modes', () => {
      act(() => {
        root.render(createElement(Transport))
      })

      const playBtn = container.querySelector('[data-tour="transport-play"] button.primary')!
      const speedSelect = container.querySelector('[data-tour="transport-play"] select')!
      const scrubInput = container.querySelector('.transport__scrub')!

      expect(playBtn).not.toBeNull()
      expect(speedSelect).not.toBeNull()
      expect(scrubInput).not.toBeNull()

      // Switch mode to simple
      act(() => {
        useAppStore.getState().setMode('simple')
      })

      const playBtnSimple = container.querySelector('[data-tour="transport-play"] button.primary')!
      const speedSelectSimple = container.querySelector('[data-tour="transport-play"] select')!
      const scrubInputSimple = container.querySelector('.transport__scrub')!

      expect(playBtnSimple).toBe(playBtn)
      expect(speedSelectSimple).toBe(speedSelect)
      expect(scrubInputSimple).toBe(scrubInput)
    })
  })

  describe('App shell stability', () => {
    it('maintains the fixed toolbars above and below dynamic views', async () => {
      const App = (await import('./App')).default
      act(() => {
        root.render(createElement(App))
      })

      const topbar = container.querySelector('.topbar')!
      const tools = container.querySelector('.tools')!
      const transport = container.querySelector('.transport')!

      expect(topbar).not.toBeNull()
      expect(tools).not.toBeNull()
      expect(transport).not.toBeNull()

      // Switch mode to simple
      act(() => {
        useAppStore.getState().setMode('simple')
      })

      const topbarSimple = container.querySelector('.topbar')!
      const toolsSimple = container.querySelector('.tools')!
      const transportSimple = container.querySelector('.transport')!

      // Toolbars must be the exact same DOM elements (not unmounted/re-created)
      expect(topbarSimple).toBe(topbar)
      expect(toolsSimple).toBe(tools)
      expect(transportSimple).toBe(transport)
    })

    it('preserves toolbar element order and persistence at 1280px and 390px viewports', async () => {
      const App = (await import('./App')).default

      // Test at desktop 1280x800
      window.innerWidth = 1280
      window.innerHeight = 800
      window.dispatchEvent(new Event('resize'))

      act(() => {
        useAppStore.setState({ mode: 'advanced' })
        root.render(createElement(App))
      })

      const advPlay = container.querySelector('[data-tour="transport-play"] button.primary')!
      const advShare = container.querySelector('.tools button[aria-haspopup="menu"]')!
      const advTutorial = container.querySelector('[data-tour="help-button"]')!
      const advDemo = container.querySelector('button[aria-label="Start demo"]')!
      const advMode = container.querySelector('[data-tour="mode-switch"]')!

      // Switch to simple at 1280
      act(() => {
        useAppStore.getState().setMode('simple')
      })

      expect(container.querySelector('[data-tour="transport-play"] button.primary')).toBe(advPlay)
      expect(container.querySelector('.tools button[aria-haspopup="menu"]')).toBe(advShare)
      expect(container.querySelector('[data-tour="help-button"]')).toBe(advTutorial)
      expect(container.querySelector('button[aria-label="Start demo"]')).toBe(advDemo)
      expect(container.querySelector('[data-tour="mode-switch"]')).toBe(advMode)

      // Test at mobile 390x844
      window.innerWidth = 390
      window.innerHeight = 844
      window.dispatchEvent(new Event('resize'))

      act(() => {
        useAppStore.getState().setMode('advanced')
      })

      const mAdvPlay = container.querySelector('[data-tour="transport-play"] button.primary')!
      const mAdvShare = container.querySelector('.tools button[aria-haspopup="menu"]')!
      const mAdvTutorial = container.querySelector('[data-tour="help-button"]')!
      const mAdvDemo = container.querySelector('button[aria-label="Start demo"]')!
      const mAdvMode = container.querySelector('[data-tour="mode-switch"]')!

      act(() => {
        useAppStore.getState().setMode('simple')
      })

      expect(container.querySelector('[data-tour="transport-play"] button.primary')).toBe(mAdvPlay)
      expect(container.querySelector('.tools button[aria-haspopup="menu"]')).toBe(mAdvShare)
      expect(container.querySelector('[data-tour="help-button"]')).toBe(mAdvTutorial)
      expect(container.querySelector('button[aria-label="Start demo"]')).toBe(mAdvDemo)
      expect(container.querySelector('[data-tour="mode-switch"]')).toBe(mAdvMode)
    })
  })

  describe('CSS rules for stable layout', () => {
    it('defines toolbar-hidden with visibility:hidden and pointer-events:none', async () => {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const themeCss = fs.readFileSync(path.resolve(__dirname, 'theme.css'), 'utf-8')
      const panelsCss = fs.readFileSync(path.resolve(__dirname, 'panels.css'), 'utf-8')

      expect(themeCss).toContain('.toolbar-hidden')
      expect(themeCss).toContain('visibility: hidden !important')
      expect(themeCss).toContain('pointer-events: none !important')
      expect(themeCss).toContain('[data-tour="mode-switch"] button')
      expect(panelsCss).toContain('.shell > .board__toolbar')
      expect(panelsCss).toContain('animation: none')
    })
  })
})
