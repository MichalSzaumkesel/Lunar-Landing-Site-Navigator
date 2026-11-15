import { useEffect, useState } from 'react'
import { DemoCaption } from '../components/demo/DemoCaption'
import { Tour } from '../components/help/Tour'
import { TourAutoStart } from '../components/help/TourAutoStart'
import { ScenarioBoard } from '../components/scenario/ScenarioBoard'
import { SimpleView } from '../components/simple/SimpleView'
import { useEventSounds } from '../components/sound/useEventSounds'
import { prefetchDemoSites } from '../lib/prefetch'
import { useAppStore } from '../state/store'
import { usePlaybackLoop } from '../state/usePlaybackLoop'
import { useUrlSync } from '../state/useUrlSync'
import { Panels } from './Panels'
import { Tools } from './Tools'
import { TopBar } from './TopBar'
import { Transport } from './Transport'
import { useShortcuts } from './useShortcuts'
import './landscape.css'
import './panels.css'

export default function App() {
  usePlaybackLoop()
  useShortcuts()
  useUrlSync()
  useEventSounds()
  const mode = useAppStore((s) => s.mode)
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    prefetchDemoSites()
  }, [])

  return (
    <div className="app">
      <TopBar />
      <TourAutoStart />
      <main className="shell">
        <div className="board__toolbar">
          <div className="board__scenarios" ref={setToolbarSlot} />
          <Tools />
        </div>
        {mode === 'simple' ? (
          <SimpleView />
        ) : (
          <>
            <ScenarioBoard toolbarSlot={toolbarSlot} />
            <Panels />
          </>
        )}
      </main>
      <div className="app__footer">
        <DemoCaption />
        <Transport />
      </div>
      <Tour />
    </div>
  )
}
