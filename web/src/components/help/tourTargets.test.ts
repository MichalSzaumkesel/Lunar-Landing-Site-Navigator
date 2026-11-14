import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { advancedSteps, simpleSteps } from './tourSteps'

function collectTsxFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectTsxFiles(fullPath))
    } else if (entry.isFile() && fullPath.endsWith('.tsx')) {
      files.push(fullPath)
    }
  }
  return files
}

describe('tourTargets in DOM sources', () => {
  it('checks every data-tour id in advancedSteps and simpleSteps exists in at least one TSX component source', () => {
    const componentsDir = path.resolve(__dirname, '..')
    const appDir = path.resolve(__dirname, '../../app')

    const tsxFiles = [...collectTsxFiles(componentsDir), ...collectTsxFiles(appDir)]
    // Exclude test files so that test mock markup does not count
    const sourceFiles = tsxFiles.filter((f) => !f.includes('.test.') && !f.includes('.spec.'))

    const sources = sourceFiles.map((file) => fs.readFileSync(file, 'utf8'))

    const allSteps = [...simpleSteps, ...advancedSteps]
    const testedTourIds = new Set<string>()

    for (const step of allSteps) {
      const match = step.target.match(/^\[data-tour="([^"]+)"\]$/)
      expect(match).not.toBeNull()
      const tourId = match![1]
      testedTourIds.add(tourId)
    }

    for (const tourId of testedTourIds) {
      const pattern = `data-tour="${tourId}"`
      const found = sources.some((src) => src.includes(pattern))
      expect(found, `Expected to find ${pattern} in at least one TSX source file in src/components or src/app`).toBe(true)
    }
  })
})
