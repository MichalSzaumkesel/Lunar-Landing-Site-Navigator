// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteBundle } from './types'
import type { SiteBundleState } from './useSiteBundle'

const loadSite = vi.hoisted(() => vi.fn())
vi.mock('./loader', () => ({ dataSource: { loadSite } }))

import { useSiteBundle } from './useSiteBundle'

// Tell React this is an act() environment.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const fakeBundle = (id: string) => ({ site: { id } }) as unknown as SiteBundle

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let root: Root | null = null
const seen: SiteBundleState[] = []
let host: HTMLElement

// The hook result of the latest commit.
const last = (): SiteBundleState | undefined => seen[seen.length - 1]

function Probe({ id }: { id: string }) {
  const state = useSiteBundle(id)
  useEffect(() => {
    seen.push(state)
  })
  return null
}

const render = (id: string) =>
  act(async () => {
    root!.render(createElement(Probe, { id }))
  })

beforeEach(() => {
  loadSite.mockReset()
  seen.length = 0
  host = document.createElement('div')
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
})

describe('useSiteBundle', () => {
  it('goes from loading to ready', async () => {
    const d = deferred<SiteBundle>()
    loadSite.mockReturnValue(d.promise)
    await render('hook_ready')
    expect(last()).toEqual({ status: 'loading', bundle: null, error: null })

    const bundle = fakeBundle('hook_ready')
    await act(async () => d.resolve(bundle))
    expect(last()?.status).toBe('ready')
    expect(last()?.bundle).toBe(bundle)
    expect(last()?.error).toBeNull()
    expect(loadSite).toHaveBeenCalledWith('hook_ready')
  })

  it('reports the error message', async () => {
    const d = deferred<SiteBundle>()
    loadSite.mockReturnValue(d.promise)
    await render('hook_error')
    await act(async () => d.reject(new Error('Unknown site: hook_error')))
    expect(last()).toEqual({ status: 'error', bundle: null, error: 'Unknown site: hook_error' })
  })

  it('drops a stale result when the id changes', async () => {
    const a = deferred<SiteBundle>()
    const b = deferred<SiteBundle>()
    loadSite.mockImplementation((id: string) => (id === 'hook_a' ? a.promise : b.promise))

    await render('hook_a')
    await render('hook_b')
    expect(last()?.status).toBe('loading')

    await act(async () => b.resolve(fakeBundle('hook_b')))
    expect(last()?.bundle?.site.id).toBe('hook_b')

    // The first request settles late and must not overwrite the current one.
    await act(async () => a.resolve(fakeBundle('hook_a')))
    expect(last()?.status).toBe('ready')
    expect(last()?.bundle?.site.id).toBe('hook_b')
  })

  it('shows loading, not the old bundle, right after the id changes', async () => {
    loadSite.mockImplementation((id: string) =>
      id === 'hook_c' ? Promise.resolve(fakeBundle('hook_c')) : new Promise(() => {}),
    )
    await render('hook_c')
    expect(last()?.bundle?.site.id).toBe('hook_c')
    await render('hook_d')
    expect(last()).toEqual({ status: 'loading', bundle: null, error: null })
  })

  it('ignores a result that arrives after unmount', async () => {
    const d = deferred<SiteBundle>()
    loadSite.mockReturnValue(d.promise)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await render('hook_unmount')
    await act(async () => root!.unmount())
    root = createRoot(host)
    await act(async () => d.resolve(fakeBundle('hook_unmount')))
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('serves an already loaded site without a loading state', async () => {
    loadSite.mockResolvedValue(fakeBundle('hook_cached'))
    await render('hook_cached')
    expect(last()?.status).toBe('ready')
    // A second consumer mounts straight into ready.
    await act(async () => root!.unmount())
    root = createRoot(host)
    seen.length = 0
    await render('hook_cached')
    expect(last()).toMatchObject({ status: 'ready' })
    expect(loadSite).toHaveBeenCalledTimes(1)
  })
})
