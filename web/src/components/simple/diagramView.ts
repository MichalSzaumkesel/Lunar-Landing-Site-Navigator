import type { DiagramView } from './SkyHelp'

const KEY = 'simple.diagramView'
const VIEWS: DiagramView[] = ['sky', 'horizon', '3d']

export const VIEW_OPTIONS: { key: DiagramView; label: string }[] = [
  { key: 'sky', label: 'Polar' },
  { key: 'horizon', label: 'Panorama' },
  { key: '3d', label: '3D' },
]

export function readDiagramView(): DiagramView {
  try {
    const v = localStorage.getItem(KEY)
    return VIEWS.find((x) => x === v) ?? 'sky'
  } catch {
    return 'sky'
  }
}

export function writeDiagramView(view: DiagramView): void {
  try {
    localStorage.setItem(KEY, view)
  } catch {
    // Storage can be blocked; the choice then lasts for this visit only.
  }
}
