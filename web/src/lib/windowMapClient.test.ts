import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { EphemFile, HorizonFile, MissionRules, SiteBundle } from './types'
import { cancelWindowMap, computeWindowMapAsync } from './windowMapClient'
import { computeWindowMap, type WindowMapInput, type WindowMapRow } from './windowMap'

const RULES: MissionRules = {
  observerHeightM: 2,
  missionDurationH: 240,
  minPctSunlit: 70,
  maxLongestDarkH: 48,
  earthAtLandingRequired: true,
  minPctEarth: 50,
}

const OPTS = { dayStepH: 24 }

let inputs: WindowMapInput[]
let startMs: number
let endMs: number

function loadMockBundle(siteId: string): Pick<SiteBundle, 'horizon' | 'ephem'> {
  const base = path.resolve(process.cwd(), 'public/data/mock')
  const horizon = JSON.parse(
    fs.readFileSync(path.join(base, 'horizon', `${siteId}.json`), 'utf8'),
  ) as HorizonFile
  const ephem = JSON.parse(
    fs.readFileSync(path.join(base, 'ephem', `${siteId}.json`), 'utf8'),
  ) as EphemFile
  return { horizon, ephem }
}

beforeAll(() => {
  const bundle = loadMockBundle('apollo_11')
  inputs = [{ siteId: 'apollo_11', bundle }]
  startMs = Date.parse(bundle.ephem!.start_utc)
  // Keep the computed range to 30 days so the test stays fast.
  endMs = startMs + 30 * 24 * 3_600_000
})

/** Minimal Worker double that records messages and exposes the handlers. */
class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  posted: unknown[] = []
  terminated = false

  constructor(url: URL, options?: WorkerOptions) {
    void url
    void options
    FakeWorker.instances.push(this)
  }

  postMessage(message: unknown): void {
    this.posted.push(message)
  }

  terminate(): void {
    this.terminated = true
  }
}

describe('computeWindowMapAsync without Worker support', () => {
  afterEach(() => {
    cancelWindowMap()
  })

  it('falls back to the pure computation and matches its output', async () => {
    const rows = await computeWindowMapAsync(inputs, RULES, { ...OPTS, startMs, endMs })
    const expected = computeWindowMap(inputs, RULES, { ...OPTS, startMs, endMs })

    expect(rows).toHaveLength(1)
    expect(rows[0].siteId).toBe('apollo_11')
    expect(rows[0].count).toBe(expected[0].count)
    expect(rows[0].valid).toBeInstanceOf(Uint8Array)
    expect(rows[0].pctSunlit).toBeInstanceOf(Float32Array)
    expect(Array.from(rows[0].valid)).toEqual(Array.from(expected[0].valid))
    expect(Array.from(rows[0].pctSunlit)).toEqual(Array.from(expected[0].pctSunlit))
  })
})

describe('computeWindowMapAsync with a Worker', () => {
  const doneRows = [
    {
      siteId: 'apollo_11',
      startMs,
      stepMs: 86_400_000,
      count: 1,
      pctSunlit: new Float32Array([100]),
      pctEarth: new Float32Array([100]),
      longestDarkH: new Float32Array([0]),
      valid: new Uint8Array([1]),
    } satisfies WindowMapRow,
  ]

  beforeAll(() => {
    vi.stubGlobal('Worker', FakeWorker)
  })

  afterEach(() => {
    cancelWindowMap()
    FakeWorker.instances = []
  })

  it('posts inputs and resolves with the rows the worker returns', async () => {
    const promise = computeWindowMapAsync(inputs, RULES, OPTS)
    const worker = FakeWorker.instances[0]

    expect(worker.posted).toHaveLength(1)
    expect(worker.posted[0]).toMatchObject({ rules: RULES, opts: OPTS })

    worker.onmessage?.({ data: doneRows } as MessageEvent)

    await expect(promise).resolves.toEqual(doneRows)
    expect(worker.terminated).toBe(true)
  })

  it('rejects and terminates the worker on a worker error', async () => {
    const promise = computeWindowMapAsync(inputs, RULES, OPTS)
    const worker = FakeWorker.instances[0]

    worker.onerror?.({
      message: 'boom',
      error: new Error('boom'),
      preventDefault: () => {},
    } as unknown as ErrorEvent)

    await expect(promise).rejects.toThrow('boom')
    expect(worker.terminated).toBe(true)
  })

  it('cancels an in-flight computation with a "cancelled" rejection', async () => {
    const first = computeWindowMapAsync(inputs, RULES, OPTS)
    const firstWorker = FakeWorker.instances[0]

    // A newer request replaces the running worker.
    const second = computeWindowMapAsync(inputs, RULES, OPTS)

    await expect(first).rejects.toThrow('cancelled')
    expect(firstWorker.terminated).toBe(true)

    FakeWorker.instances[1].onmessage?.({ data: doneRows } as MessageEvent)
    await expect(second).resolves.toEqual(doneRows)
  })

  it('rejects when the Worker cannot be constructed', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('no workers')
        }
      },
    )

    await expect(computeWindowMapAsync(inputs, RULES, OPTS)).rejects.toThrow('no workers')
    vi.stubGlobal('Worker', FakeWorker)
  })
})
