import { describe, expect, it } from 'vitest'
import type { Site } from '../../lib/types'
import { groupByCategory } from './cardLogic'

const site = (id: string, category: Site['category']) => ({ id, name: id, category }) as Site

describe('groupByCategory', () => {
  it('groups by category in order of first appearance', () => {
    const g = groupByCategory([site('a', 'apollo'), site('b', 'clps'), site('c', 'apollo')])
    expect(g.map((x) => x.label)).toEqual(['Apollo landing site', 'CLPS site'])
    expect(g[0].sites.map((s) => s.id)).toEqual(['a', 'c'])
  })
})
