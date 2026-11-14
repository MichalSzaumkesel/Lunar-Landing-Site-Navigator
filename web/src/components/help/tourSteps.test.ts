import { describe, expect, it } from 'vitest'
import {
  advancedSteps,
  nextAvailableStep,
  shouldAutoStart,
  simpleSteps,
  type TourStep,
} from './tourSteps'

describe('tourSteps definitions', () => {
  it('contains exactly 6 steps for simple mode', () => {
    expect(simpleSteps).toHaveLength(6)
    expect(simpleSteps.map((s) => s.id)).toEqual([
      'mode-switch',
      'simple-places',
      'sky-plot',
      'simple-summary',
      'transport-play',
      'help-button',
    ])
  })

  it('contains exactly 15 steps for advanced mode', () => {
    expect(advancedSteps).toHaveLength(15)
    expect(advancedSteps.map((s) => s.id)).toEqual([
      'mode-switch',
      'presets',
      'observer-height',
      'tools',
      'card-header',
      'view-tabs',
      'sky-plot',
      'loupe',
      'timeline',
      'chips',
      'countdowns-metrics',
      'scenario-controls',
      'transport-play',
      'panels',
      'help-button',
    ])
  })

  it('asserts every Advanced step target string has the form [data-tour="..."]', () => {
    for (const step of advancedSteps) {
      expect(step.target).toMatch(/^\[data-tour="[^"]+"\]$/)
    }
  })
})

describe('nextAvailableStep', () => {
  const dummySteps: TourStep[] = [
    { id: 's0', target: '#target-0', title: 'T0', text: 'Text 0' },
    { id: 's1', target: '#target-1', title: 'T1', text: 'Text 1' },
    { id: 's2', target: '#target-2', title: 'T2', text: 'Text 2' },
    { id: 's3', target: '#target-3', title: 'T3', text: 'Text 3' },
  ]

  it('steps forward to next immediate step if present', () => {
    const exists = (t: string) => t === '#target-1' || t === '#target-2'
    expect(nextAvailableStep(dummySteps, 0, 1, exists)).toBe(1)
  })

  it('skips missing steps forward', () => {
    // Only #target-3 exists after 0
    const exists = (t: string) => t === '#target-0' || t === '#target-3'
    expect(nextAvailableStep(dummySteps, 0, 1, exists)).toBe(3)
  })

  it('returns -1 when no forward steps exist', () => {
    const exists = (t: string) => t === '#target-0'
    expect(nextAvailableStep(dummySteps, 0, 1, exists)).toBe(-1)
    expect(nextAvailableStep(dummySteps, 3, 1, exists)).toBe(-1)
  })

  it('steps backward to previous step if present', () => {
    const exists = (t: string) => t === '#target-2' || t === '#target-1'
    expect(nextAvailableStep(dummySteps, 3, -1, exists)).toBe(2)
  })

  it('skips missing steps backward', () => {
    const exists = (t: string) => t === '#target-0' || t === '#target-3'
    expect(nextAvailableStep(dummySteps, 3, -1, exists)).toBe(0)
  })

  it('returns -1 when no backward steps exist', () => {
    const exists = (t: string) => t === '#target-3'
    expect(nextAvailableStep(dummySteps, 3, -1, exists)).toBe(-1)
    expect(nextAvailableStep(dummySteps, 0, -1, exists)).toBe(-1)
  })

  it('can search for the first available step from -1', () => {
    const exists = (t: string) => t === '#target-2' || t === '#target-3'
    expect(nextAvailableStep(dummySteps, -1, 1, exists)).toBe(2)
  })
})

describe('shouldAutoStart', () => {
  it('returns false when suppressed is true', () => {
    expect(shouldAutoStart(null, true)).toBe(false)
    expect(shouldAutoStart('done', true)).toBe(false)
    expect(shouldAutoStart('any', true)).toBe(false)
  })

  it('returns false when storageValue is done', () => {
    expect(shouldAutoStart('done', false)).toBe(false)
  })

  it('returns true when storageValue is null or anything other than done', () => {
    expect(shouldAutoStart(null, false)).toBe(true)
    expect(shouldAutoStart('', false)).toBe(true)
    expect(shouldAutoStart('in_progress', false)).toBe(true)
  })
})
