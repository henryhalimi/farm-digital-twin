import { useState, useCallback, useRef, useEffect } from 'react'
import { MenuBar } from './components/MenuBar'
import { Toolbar, type Tool } from './components/Toolbar'
import { MapView } from './components/MapView'
import { ELEMENT_TYPES, type ElementTypeDef } from './sim/ElementRegistry'
import { type CircuitElm, type CPoint, ANCHOR_LAT, ANCHOR_LNG, METERS_PER_UNIT, setAnchor } from './sim/CircuitElm'
import { saveCircuit, loadCircuit } from './sim/CircuitSerializer'
import { useUndoRedo } from './hooks/useUndoRedo'
import { UIManager } from './sim/UIManager'
import { OptionsDialog } from './components/OptionsDialog'
import './App.css'

function App() {
  const [activeTool, setActiveTool] = useState<Tool>('select')
  const [activeElementType, setActiveElementType] = useState<ElementTypeDef>(ELEMENT_TYPES[0])
  const [elements, setElements] = useState<CircuitElm[]>([])
  const [simRunning, setSimRunning] = useState(true)
  const [simSpeed, setSimSpeed] = useState(1)
  const [fitKey, setFitKey] = useState(0)
  const [anchorKey, setAnchorKey] = useState(0)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const clipboardXmlRef = useRef<string>('')
  const [hasClipboard, setHasClipboard] = useState(false)
  const mouseCircuitRef = useRef<CPoint | null>(null)
  const { pushUndo, undo, redo, canUndo, canRedo } = useUndoRedo()

  const commitElements = useCallback((newElms: CircuitElm[]) => {
    pushUndo(elements)
    setElements(newElms)
  }, [elements, pushUndo])

  const handleNewFile = useCallback(() => { commitElements([]); setActiveTool('select') }, [commitElements])

  const handleSelectAll = useCallback(() => {
    setElements(prev => {
      for (const elm of prev) elm.selected = true
      return [...prev]
    })
  }, [])

  const handleDeleteSelected = useCallback(() => {
    pushUndo(elements)
    setElements(prev => prev.filter(elm => !elm.selected))
  }, [elements, pushUndo])

  const handleCopySelected = useCallback(() => {
    const selected = elements.filter(elm => elm.selected)
    if (selected.length > 0) { clipboardXmlRef.current = saveCircuit(selected); setHasClipboard(true) }
  }, [elements])

  const handleCutSelected = useCallback(() => {
    const selected = elements.filter(elm => elm.selected)
    if (selected.length > 0) { clipboardXmlRef.current = saveCircuit(selected); setHasClipboard(true) }
    pushUndo(elements)
    setElements(prev => prev.filter(elm => !elm.selected))
  }, [elements, pushUndo])

  const handleSave = useCallback(() => {
    const xml = saveCircuit(elements, { currentSpeed: simSpeed, anchorLat: ANCHOR_LAT, anchorLng: ANCHOR_LNG })
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'network.cir'
    a.click()
    URL.revokeObjectURL(url)
  }, [elements, simSpeed])

  const handleOpen = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const { elements: loaded, options } = loadCircuit(ev.target!.result as string)
        pushUndo(elements)
        setElements(loaded)
        if (options.currentSpeed !== undefined) setSimSpeed(options.currentSpeed)
        if (options.anchorLat !== undefined && options.anchorLng !== undefined) {
          setAnchor(options.anchorLat, options.anchorLng)
        }
        setSimRunning(true)
        setFitKey(k => k + 1)
      } catch (err) {
        alert('Failed to load circuit: ' + (err as Error).message)
      }
    }
    reader.readAsText(file)
    // reset so the same file can be re-opened
    e.target.value = ''
  }, [elements, pushUndo])

  const handleUndo = useCallback(() => {
    const result = undo(elements)
    if (result) setElements(result)
  }, [elements, undo])

  const handleRedo = useCallback(() => {
    const result = redo(elements)
    if (result) setElements(result)
  }, [elements, redo])

  const handleBeforeChange = useCallback(() => {
    pushUndo(elements)
  }, [elements, pushUndo])

  const handlePaste = useCallback((targetPos?: CPoint) => {
    if (!clipboardXmlRef.current) return
    // Clone via deserialize
    const cloned = loadCircuit(clipboardXmlRef.current).elements
    // Compute bounding box center of cloned elements
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const elm of cloned) {
      for (let i = 0; i < elm.getPostCount(); i++) {
        const p = elm.getPost(i)
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
      }
    }
    const cx = Math.round((minX + maxX) / 2)
    const cy = Math.round((minY + maxY) / 2)
    // Determine offset
    let dx: number, dy: number
    if (targetPos) {
      dx = targetPos.x - cx
      dy = targetPos.y - cy
    } else {
      // Fixed offset for menu paste
      dx = 20
      dy = 20
    }
    // Check if pasting at this offset would overlap existing elements; nudge if so
    const occupied = new Set<string>()
    for (const elm of elements) {
      for (let i = 0; i < elm.getPostCount(); i++) {
        const p = elm.getPost(i)
        occupied.add(`${p.x},${p.y}`)
      }
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      let overlaps = false
      for (const elm of cloned) {
        for (let i = 0; i < elm.getPostCount(); i++) {
          const p = elm.getPost(i)
          if (occupied.has(`${p.x + dx},${p.y + dy}`)) { overlaps = true; break }
        }
        if (overlaps) break
      }
      if (!overlaps) break
      dx += 20; dy += 20
    }
    for (const elm of cloned) elm.move(dx, dy)
    // Deselect existing, select pasted
    for (const elm of elements) elm.selected = false
    for (const elm of cloned) elm.selected = true
    commitElements([...elements, ...cloned])
  }, [elements, commitElements])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      const meta = e.metaKey || e.ctrlKey

      if (e.key === ' ') {
        e.preventDefault()
        setActiveTool('select')
      } else if (e.key === 'v' && meta) {
        e.preventDefault()
        handlePaste(mouseCircuitRef.current ?? undefined)
        return
      } else if (e.key === 'v' || e.key === 'Escape') {
        setActiveTool('select')
      } else if (e.key === 'p') {
        setActiveElementType(ELEMENT_TYPES[0]) // pipe
        setActiveTool('draw')
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!meta) {
          e.preventDefault()
          handleDeleteSelected()
        }
      } else if (e.key === 'a' && meta) {
        e.preventDefault()
        handleSelectAll()
      } else if (e.key === 'x' && meta) {
        e.preventDefault()
        handleCutSelected()
      } else if (e.key === 'c' && meta) {
        e.preventDefault()
        handleCopySelected()
      } else if (e.key === 'z' && meta && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if (e.key === 'z' && meta && e.shiftKey) {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleDeleteSelected, handleSelectAll, handleCutSelected, handleCopySelected, handlePaste, handleUndo, handleRedo])

  const handleLoadExample = useCallback((file: string) => {
    const base = import.meta.env.BASE_URL ?? '/'
    fetch(base + 'examples/' + file)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.text() })
      .then(xml => {
        const { elements: loaded, options } = loadCircuit(xml)
        pushUndo(elements)
        setElements(loaded)
        if (options.currentSpeed !== undefined) setSimSpeed(options.currentSpeed)
        if (options.anchorLat !== undefined && options.anchorLng !== undefined) {
          setAnchor(options.anchorLat, options.anchorLng)
        }
        setSimRunning(true)
        setFitKey(k => k + 1)
      })
      .catch(err => alert('Failed to load example: ' + err.message))
  }, [elements, pushUndo])

  // ── Load default example on startup ─────────────────────────────────────────
  useEffect(() => {
    const base = import.meta.env.BASE_URL ?? '/'
    fetch(base + 'examples/network.cir')
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.text() })
      .then(xml => {
        const { elements: loaded, options } = loadCircuit(xml)
        setElements(loaded)
        if (options.currentSpeed !== undefined) setSimSpeed(options.currentSpeed)
        if (options.anchorLat !== undefined && options.anchorLng !== undefined) {
          setAnchor(options.anchorLat, options.anchorLng)
        }
        setFitKey(k => k + 1)
      })
      .catch(() => {}) // silently ignore if not found
  }, [])

  return (
    <div className="app">
      <input
        ref={fileInputRef}
        type="file"
        accept=".cir,.xml"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <MenuBar
        onNewFile={handleNewFile}
        onSave={handleSave}
        onOpen={handleOpen}
        onCut={handleCutSelected}
        onCopy={handleCopySelected}
        onPaste={() => handlePaste()}
        onDelete={handleDeleteSelected}
        onSelectAll={handleSelectAll}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onOptions={() => setOptionsOpen(true)}
        onLoadExample={handleLoadExample}
      />
      <Toolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        activeElementType={activeElementType}
        onElementTypeChange={(t) => { setActiveElementType(t); setActiveTool('draw') }}
        elementCount={elements.length}
        simRunning={simRunning}
        onSimRunningChange={(running) => {
          if (running) {
            const SIZES: Record<string, string> = {
              A:'1/8"',B:'1/4"',C:'3/8"',D:'1/2"',E:'5/8"',F:'3/4"',
              G:'1"',H:'1-1/4"',I:'1-1/2"',J:'2"',K:'2-1/2"',
              L:'3"',M:'4"',N:'5"',O:'6"',P:'8"',Q:'10"'
            }
            const issues: string[] = []

            // Check 1: unresolved sizes
            elements.forEach((elm, idx) => {
              const sizes: string[] = (elm as any)._portSizeCodes ?? []
              if (sizes.length === 0 || sizes.some(s => s === 'x')) {
                issues.push(`Device ${idx + 1} (${elm.getXmlDumpType()}) has unassigned port sizes`)
              }
            })

            // Check 2: size mismatches between connected elements
            for (const elmA of elements) {
              const sizesA: string[] = (elmA as any)._portSizeCodes ?? []
              for (let pi = 0; pi < elmA.getPostCount(); pi++) {
                const sizeA = sizesA[pi] ?? 'x'
                if (sizeA === 'x') continue
                const postA = elmA.getPost(pi)
                for (const elmB of elements) {
                  if (elmB === elmA) continue
                  const sizesB: string[] = (elmB as any)._portSizeCodes ?? []
                  for (let pj = 0; pj < elmB.getPostCount(); pj++) {
                    const postB = elmB.getPost(pj)
                    if (postA.x === postB.x && postA.y === postB.y) {
                      const sizeB = sizesB[pj] ?? 'x'
                      if (sizeB !== 'x' && sizeA !== sizeB) {
                        issues.push(`Size mismatch: ${elmA.getXmlDumpType()} (${SIZES[sizeA]}) connected to ${elmB.getXmlDumpType()} (${SIZES[sizeB]})`)
                      }
                    }
                  }
                }
              }
            }

            if (issues.length > 0) {
              alert(`Cannot simulate — fix these issues first:\n\n${issues.slice(0, 5).join('\n')}${issues.length > 5 ? `\n...and ${issues.length - 5} more` : ''}`)
              return
            }
          }
          setSimRunning(running)
        }}
      />
      <div className="main-view">
        <MapView
          activeTool={activeTool}
          activeElementType={activeElementType}
          elements={elements}
          onElementsChange={setElements}
          simRunning={simRunning}
          fitKey={fitKey}
          onBeforeChange={handleBeforeChange}
          mouseCircuitRef={mouseCircuitRef}
          simSpeed={simSpeed}
          anchorKey={anchorKey}
          onToolChange={setActiveTool}
          onElementTypeChange={(t) => { setActiveElementType(t); setActiveTool('draw') }}
          onCut={handleCutSelected}
          onCopy={handleCopySelected}
          onPaste={() => handlePaste()}
          hasClipboard={hasClipboard}
          onSimRunningChange={setSimRunning}
        />
      </div>
      {optionsOpen && (
        <OptionsDialog
          speed={simSpeed}
          anchorLat={ANCHOR_LAT}
          anchorLng={ANCHOR_LNG}
          hasElements={elements.length > 0}
          onApply={(speed, lat, lng) => {
            setSimSpeed(speed)
            if (lat !== ANCHOR_LAT || lng !== ANCHOR_LNG) {
              // Reproject elements: compute offset so they stay at the same GPS positions
              const cosOld = Math.cos(ANCHOR_LAT * Math.PI / 180)
              const cosNew = Math.cos(lat * Math.PI / 180)
              if (elements.length > 0) {
                pushUndo(elements)
                const newElms = elements.map(elm => {
                  // Convert old circuit coords to GPS using old anchor
                  const gpsLat = ANCHOR_LAT - (elm.y * METERS_PER_UNIT) / 111320.0
                  const gpsLng = ANCHOR_LNG + (elm.x * METERS_PER_UNIT) / (111320.0 * cosOld)
                  const gpsLat2 = ANCHOR_LAT - (elm.y2 * METERS_PER_UNIT) / 111320.0
                  const gpsLng2 = ANCHOR_LNG + (elm.x2 * METERS_PER_UNIT) / (111320.0 * cosOld)
                  // Convert GPS back to circuit coords using new anchor
                  const nx = Math.round((gpsLng - lng) * 111320.0 * cosNew / METERS_PER_UNIT)
                  const ny = Math.round((lat - gpsLat) * 111320.0 / METERS_PER_UNIT)
                  const nx2 = Math.round((gpsLng2 - lng) * 111320.0 * cosNew / METERS_PER_UNIT)
                  const ny2 = Math.round((lat - gpsLat2) * 111320.0 / METERS_PER_UNIT)
                  const dx = nx - elm.x, dy = ny - elm.y
                  const dx2 = nx2 - elm.x2, dy2 = ny2 - elm.y2
                  // Use move for uniform shift, or movePoint for each end
                  if (dx === dx2 && dy === dy2) {
                    elm.move(dx, dy)
                  } else {
                    elm.movePoint(0, dx, dy)
                    elm.movePoint(1, dx2, dy2)
                  }
                  return elm
                })
                setElements([...newElms])
              }
              setAnchor(lat, lng)
              UIManager.clearCache()
              setAnchorKey(k => k + 1)
            }
          }}
          onClose={() => setOptionsOpen(false)}
        />
      )}
    </div>
  )
}

export default App
