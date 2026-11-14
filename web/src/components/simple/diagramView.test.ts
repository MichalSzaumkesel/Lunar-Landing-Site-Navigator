// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readDiagramView, writeDiagramView } from './diagramView'

describe('diagramView', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('defaults to sky and remembers the choice', () => {
    expect(readDiagramView()).toBe('sky')
    writeDiagramView('3d')
    expect(readDiagramView()).toBe('3d')
  })

  it('ignores unknown values and blocked storage', () => {
    localStorage.setItem('simple.diagramView', 'cube')
    expect(readDiagramView()).toBe('sky')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readDiagramView()).toBe('sky')
  })
})
