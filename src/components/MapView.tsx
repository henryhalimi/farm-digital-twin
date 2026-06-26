import { useEffect, useRef, useCallback, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Tool } from './Toolbar'
import { CircuitElm, ANCHOR_LAT, ANCHOR_LNG, METERS_PER_UNIT, type CPoint, type DrawContext } from '../sim/CircuitElm'
import { ELEMENT_TYPES, type ElementTypeDef } from '../sim/ElementRegistry'
import { UIManager } from '../sim/UIManager'
import { SimulationManager } from '../sim/SimulationManager'
import { ContextMenu } from './ContextMenu'
import { DeviceConfigDialog } from './DeviceConfigDialog'
import { BlockConfigDialog } from './BlockConfigDialog'
import { SizePromptDialog } from './SizePromptDialog'
import { ValidationToast } from './ValidationToast'
import { validatePlacement, validateNetwork, findSharedNodes } from '../sim/ConnectionValidator'
import { LumoValveElm } from '../sim/LumoValveElm'
import './MapView.css'

mapboxgl.accessToken = 'pk.eyJ1IjoiaGVucnloYWxpbWkiLCJhIjoiY21xb24zb2RnMjFpeDJ4cTZkeGZybTducSJ9.2Y0cG5Ioz0fBxf2a0eLUyQ'

const SNAP_DIST = 20        // circuit units (meters)
const HOVER_THRESHOLD = 12  // CSS pixels — max distance to highlight an element

function geoToCircuit(lng: number, lat: number): CPoint {
  return {
    x: Math.round((lng - ANCHOR_LNG) * 111320.0 * Math.cos(ANCHOR_LAT * Math.PI / 180) / METERS_PER_UNIT),
    y: Math.round((ANCHOR_LAT - lat) * 111320.0 / METERS_PER_UNIT),
  }
}

function snapToNearestPost(pt: CPoint, elements: CircuitElm[]): CPoint {
  let bestDist = SNAP_DIST * SNAP_DIST
  let best = pt
  for (const elm of elements) {
    for (let j = 0; j < elm.getPostCount(); j++) {
      const post = elm.getPost(j)
      const d = (pt.x - post.x) ** 2 + (pt.y - post.y) ** 2
      if (d < bestDist) { bestDist = d; best = post }
    }
  }
  return best
}

// Squared distance from point (px,py) to segment (ax,ay)→(bx,by)
function segDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
}

function ToolContextMenu({ x, y, activeTool, activeElementType, onSelect, onClose, onPaste, canPaste }: {
  x: number; y: number
  activeTool: Tool
  activeElementType: ElementTypeDef
  onSelect: (tool: Tool, elementType?: ElementTypeDef) => void
  onClose: () => void
  onPaste: () => void
  canPaste: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const isActive = (tool: Tool, type?: ElementTypeDef) => {
    if (tool === 'draw') return activeTool === 'draw' && activeElementType.id === type?.id
    return activeTool === tool
  }

  return (
    <div ref={ref} className="context-menu" style={{ left: x, top: y }}>
      <button
        className={`context-menu-item ${isActive('select') ? 'checked' : ''}`}
        onClick={() => onSelect('select')}
      >
        <span className="tool-menu-check">{isActive('select') ? '\u2713' : ''}</span>
        Select
      </button>
      <button
        className={`context-menu-item ${isActive('pan') ? 'checked' : ''}`}
        onClick={() => onSelect('pan')}
      >
        <span className="tool-menu-check">{isActive('pan') ? '\u2713' : ''}</span>
        Pan
      </button>
      {canPaste && (
        <>
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={() => { onPaste(); onClose() }}>
            Paste here
          </button>
        </>
      )}
      <div className="context-menu-separator" />
      {ELEMENT_TYPES.map(type => (
        <button
          key={type.id}
          className={`context-menu-item ${isActive('draw', type) ? 'checked' : ''}`}
          onClick={() => onSelect('draw', type)}
        >
          <span className="tool-menu-check">{isActive('draw', type) ? '\u2713' : ''}</span>
          Add {type.label}
        </button>
      ))}
    </div>
  )
}

interface MapViewProps {
  activeTool: Tool
  activeElementType: ElementTypeDef
  elements: CircuitElm[]
  onElementsChange: (elms: CircuitElm[]) => void
  simRunning: boolean
  fitKey?: number
  onBeforeChange?: () => void
  mouseCircuitRef?: React.MutableRefObject<CPoint | null>
  simSpeed?: number
  anchorKey?: number
  onToolChange?: (tool: Tool) => void
  onElementTypeChange?: (type: ElementTypeDef) => void
  onCut?: (elm?: CircuitElm) => void
  onCopy?: (elm?: CircuitElm) => void
  onPaste?: () => void
  hasClipboard?: boolean
  onSimRunningChange?: (running: boolean) => void
}

export function MapView({ activeTool, activeElementType, elements, onElementsChange, simRunning, fitKey, onBeforeChange, mouseCircuitRef, simSpeed = 1, anchorKey, onToolChange, onElementTypeChange, onCut, onCopy, onPaste, hasClipboard = false, onSimRunningChange }: MapViewProps) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  // Context menu & edit dialog state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elm: CircuitElm } | null>(null)
  const [toolMenu, setToolMenu] = useState<{ x: number; y: number } | null>(null)
  const [editElm, setEditElm] = useState<CircuitElm | null>(null)
  const [blockElm, setBlockElm] = useState<LumoValveElm | null>(null)
  const [sizePrompt, setSizePrompt] = useState<{
    elmA: CircuitElm; portA: number; sizeA: string; labelA: string
    elmB: CircuitElm; portB: number; sizeB: string; labelB: string
  } | null>(null)
  const [validationWarnings, setValidationWarnings] = useState<{ rule: number; message: string }[]>([])
  

  const activeToolRef = useRef<Tool>(activeTool)
  const activeElementTypeRef = useRef<ElementTypeDef>(activeElementType)
  const elementsRef = useRef<CircuitElm[]>(elements)
  const onBeforeChangeRef = useRef(onBeforeChange)
  // Live element being dragged out, like MouseManager.dragElm
  const dragElmRef = useRef<CircuitElm | null>(null)
  // Hovered element (for highlight + info box)
  const mouseElmRef = useRef<CircuitElm | null>(null)
  // Hovered post: { elm, postIndex, voltage } or null
  const mousePostRef = useRef<{ elm: CircuitElm; post: number; point: CPoint } | null>(null)

  // Simulation
  const simRef = useRef<SimulationManager>(new SimulationManager())
  const simRunningRef = useRef(simRunning)
  const analyzeFlagRef = useRef(false)   // set true when elements change
  const lastFrameTimeRef = useRef(0)
  const currentMultRef = useRef(0)

  useEffect(() => { activeToolRef.current = activeTool }, [activeTool])
  useEffect(() => { activeElementTypeRef.current = activeElementType }, [activeElementType])
  useEffect(() => { onBeforeChangeRef.current = onBeforeChange }, [onBeforeChange])
  useEffect(() => {
    elementsRef.current = elements
    analyzeFlagRef.current = true   // topology changed — re-analyze next frame
  }, [elements])
  const simSpeedRef = useRef(simSpeed)
  useEffect(() => { simSpeedRef.current = simSpeed }, [simSpeed])
  useEffect(() => { simRunningRef.current = simRunning }, [simRunning])

  // ── Redraw ──────────────────────────────────────────────────────────────────
  const redraw = useCallback(() => {
    const map = mapRef.current
    const canvas = canvasRef.current
    if (!map || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }

    // Clear in CSS-pixel space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // Compute circuit→CSS-pixel affine transform from reference points near
    // the viewport center so the linear approximation stays accurate even when
    // scrolled far from the circuit origin.
    const center = map.getCenter()
    const ref = geoToCircuit(center.lng, center.lat)
    const origin = CircuitElm.projectToPixel(ref, map)
    const unitX  = CircuitElm.projectToPixel({ x: ref.x + 1, y: ref.y }, map)
    const unitY  = CircuitElm.projectToPixel({ x: ref.x, y: ref.y + 1 }, map)
    const a = unitX.x - origin.x   // CSS-px per circuit-x
    const b = unitX.y - origin.y
    const c = unitY.x - origin.x   // CSS-px per circuit-y
    const d = unitY.y - origin.y
    const scale = Math.sqrt(a * a + b * b)

    // Set circuit→device-pixel transform (compose DPR)
    // Translate so that the reference point (ref) maps to its correct pixel position
    const tx = origin.x - (a * ref.x + c * ref.y)
    const ty = origin.y - (b * ref.x + d * ref.y)
    ctx.setTransform(a * dpr, b * dpr, c * dpr, d * dpr, tx * dpr, ty * dpr)

    // Build node connection counts: how many elements share each post
    const nodeCounts = new Map<string, number>()
    for (const elm of elementsRef.current) {
      for (let i = 0; i < elm.getPostCount(); i++) {
        const p = elm.getPost(i)
        const key = p.x + ',' + p.y
        nodeCounts.set(key, (nodeCounts.get(key) ?? 0) + 1)
      }
    }

    const dc: DrawContext = {
      ctx, scale,
      simRunning: simRunningRef.current,
      showVoltageColors: simRunningRef.current,
      currentMult: currentMultRef.current,
      nodeCounts,
    }

    // Set static mouseElm so needsHighlight() works inside each element's draw()
    CircuitElm.mouseElm = dragElmRef.current ? null : mouseElmRef.current

    // Committed elements
    for (const elm of elementsRef.current) {
      elm.draw(dc, redraw)
    }

    // In-progress drag element — drawn by its own draw() just like committed ones
    if (dragElmRef.current) {
      ctx.save()
      ctx.globalAlpha = 0.75
      dragElmRef.current.draw(dc, redraw)
      ctx.restore()
    }

    // ── Hovered post highlight (circle in circuit coords) ──────────────────
    const hoveredPost = mousePostRef.current
    if (hoveredPost && !dragElmRef.current) {
      const r = 5 / scale
      ctx.beginPath()
      ctx.arc(hoveredPost.point.x, hoveredPost.point.y, r, 0, Math.PI * 2)
      ctx.fillStyle = CircuitElm.SELECT_COLOR
      ctx.fill()
    }

    // ── Info box for hovered element (bottom-right, in CSS-pixel space) ──────
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Post pressure tooltip near the cursor
    if (hoveredPost && !dragElmRef.current && map) {
      const v = hoveredPost.elm.getPostVoltage(hoveredPost.post)
      const label = CircuitElm.getVoltageText(v)
      const sp = CircuitElm.projectToPixel(hoveredPost.point, map)
      ctx.save()
      ctx.font = '11px monospace'
      const tw = ctx.measureText(label).width
      const pad = 4
      const tx = sp.x + 10
      const ty = sp.y - 20
      ctx.fillStyle = 'rgba(0,0,0,0.8)'
      ctx.fillRect(tx - pad, ty - 12 - pad, tw + pad * 2, 12 + pad * 2)
      ctx.fillStyle = CircuitElm.SELECT_COLOR
      ctx.fillText(label, tx, ty)
      ctx.restore()
    }

    // ── Selection rectangle (rubber-band, in CSS-pixel space) ──────────────
    const selRect = selectionRectRef.current
    if (selRect) {
      const rx = Math.min(selRect.x1, selRect.x2)
      const ry = Math.min(selRect.y1, selRect.y2)
      const rw = Math.abs(selRect.x2 - selRect.x1)
      const rh = Math.abs(selRect.y2 - selRect.y1)
      ctx.save()
      ctx.strokeStyle = '#00ffff'
      ctx.lineWidth = 1
      ctx.setLineDash([6, 3])
      ctx.strokeRect(rx, ry, rw, rh)
      ctx.fillStyle = 'rgba(0, 255, 255, 0.08)'
      ctx.fillRect(rx, ry, rw, rh)
      ctx.restore()
    }

    const hovered = mouseElmRef.current
    if (hovered && !dragElmRef.current) {
      const info: string[] = new Array(10).fill(null)
      hovered.getInfo(info)
      const lines = info.filter(Boolean) as string[]
      if (lines.length > 0) {
        ctx.save()
        ctx.font = '12px monospace'
        const lineH = 16
        const pad = 8
        const boxW = Math.max(...lines.map(s => ctx.measureText(s).width)) + pad * 2
        const boxH = lines.length * lineH + pad * 2
        const bx = w - boxW - 10
        const by = h - boxH - 10
        ctx.fillStyle = 'rgba(0,0,0,0.72)'
        ctx.fillRect(bx, by, boxW, boxH)
        ctx.fillStyle = '#ffffff'
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], bx + pad, by + pad + (i + 1) * lineH - 3)
        }
        ctx.restore()
      }
    }
  }, [])

  // ── Map init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: mapDivRef.current,
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: [-119.061576, 34.201272],
      zoom: 14,
      interactive: false,
    })

    map.on('render', redraw)
    map.on('load', () => {
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
      })
      map.setTerrain({ source: 'mapbox-dem', exaggeration: 0 })
      UIManager.setMap(map)
      redraw()
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [redraw])

  useEffect(() => { redraw() }, [elements, redraw])

  // ── Fit bounds when fitKey changes (e.g. after file load) ──────────────────
  useEffect(() => {
    if (fitKey === undefined || fitKey === 0) return
    const map = mapRef.current
    const elms = elementsRef.current
    if (!map || elms.length === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const elm of elms) {
      for (let i = 0; i < elm.getPostCount(); i++) {
        const p = elm.getPost(i)
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
      }
    }
    const sw = CircuitElm.circuitToGps(minX, maxY) // maxY = south (y increases downward)
    const ne = CircuitElm.circuitToGps(maxX, minY)
    map.fitBounds([[sw[1], sw[0]], [ne[1], ne[0]]], { padding: 160, animate: false })
  }, [fitKey])

  // ── Fly to new anchor when coordinates change ─────────────────────────────
  useEffect(() => {
    if (anchorKey === undefined || anchorKey === 0) return
    const map = mapRef.current
    if (!map) return
    map.jumpTo({ center: [ANCHOR_LNG, ANCHOR_LAT] })
  }, [anchorKey])

  // ── Simulation loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    let rafId: number

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick)

      const sim = simRef.current

      // Re-analyze when elements changed
      if (analyzeFlagRef.current) {
        analyzeFlagRef.current = false
        sim.setElements(elementsRef.current)
        if (elementsRef.current.length > 0) sim.analyzeAndStamp()
      }

      if (simRunningRef.current) {
        // Update currentMult based on elapsed time (mirrors GWT's 1.7 * inc * c)
        const elapsed = lastFrameTimeRef.current > 0 ? now - lastFrameTimeRef.current : 0
        currentMultRef.current = elapsed * 0.003 * simSpeedRef.current
        lastFrameTimeRef.current = now

        sim.runFrame()
        redraw()
        // Reset so extra redraws (pan/zoom) don't re-apply the same delta
        currentMultRef.current = 0
      } else {
        lastFrameTimeRef.current = 0
        currentMultRef.current = 0
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [redraw])

  // Selection rectangle in CSS-pixel coords
  const selectionRectRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  // ── Cursor ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.style.cursor = activeTool === 'draw' ? 'crosshair' : activeTool === 'pan' ? 'grab' : 'default'
  }, [activeTool])

  // ── Input — mirrors MouseManager mouseDown / mouseDragged / mouseUp ─────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const map = () => mapRef.current

    // Drag mode for current gesture
    let dragMode: 'none' | 'pan' | 'draw' | 'rubber-band' | 'element-drag' | 'post-drag' = 'none'
    let panLastX = 0, panLastY = 0
    let clickDownElm: CircuitElm | null = null
    let clickDownX = 0, clickDownY = 0
    // For element drag: circuit-coord position at drag start
    let elemDragStartCircuit: CPoint = { x: 0, y: 0 }
    let elemDragUndoPushed = false
    // For post drag: which element and post index
    let postDragElm: CircuitElm | null = null
    let postDragIndex = -1
    let postDragGridCircuit: CPoint = { x: 0, y: 0 }

    const toCircuit = (clientX: number, clientY: number): CPoint => {
      const rect = canvas.getBoundingClientRect()
      const ll = map()!.unproject(new mapboxgl.Point(clientX - rect.left, clientY - rect.top))
      return geoToCircuit(ll.lng, ll.lat)
    }

    const toCssPixel = (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect()
      return { x: clientX - rect.left, y: clientY - rect.top }
    }

    const POST_HOVER_THRESHOLD = 8  // CSS pixels for post hit-test

    // Hit-test posts: find the closest post within threshold
    const findHoveredPost = (clientX: number, clientY: number): { elm: CircuitElm; post: number; point: CPoint } | null => {
      const m = map()
      if (!m) return null
      const rect = canvas.getBoundingClientRect()
      const px = clientX - rect.left
      const py = clientY - rect.top
      const threshold = POST_HOVER_THRESHOLD * POST_HOVER_THRESHOLD
      let best: { elm: CircuitElm; post: number; point: CPoint } | null = null
      let bestDist = threshold
      for (const elm of elementsRef.current) {
        for (let i = 0; i < elm.getPostCount(); i++) {
          const pt = elm.getPost(i)
          const sp = CircuitElm.projectToPixel(pt, m)
          const d = (px - sp.x) ** 2 + (py - sp.y) ** 2
          if (d < bestDist) { bestDist = d; best = { elm, post: i, point: pt } }
        }
      }
      return best
    }

    // Hit-test in pixel space: find element closest to (clientX, clientY)
    const findHovered = (clientX: number, clientY: number): CircuitElm | null => {
      const m = map()
      if (!m) return null
      const rect = canvas.getBoundingClientRect()
      const px = clientX - rect.left
      const py = clientY - rect.top
      const threshold = HOVER_THRESHOLD * HOVER_THRESHOLD
      let best: CircuitElm | null = null
      let bestDist = threshold
      for (const elm of elementsRef.current) {
        const p1 = CircuitElm.projectToPixel(elm.point1, m)
        const p2 = CircuitElm.projectToPixel(elm.point2, m)
        const d = segDistSq(px, py, p1.x, p1.y, p2.x, p2.y)
        if (d < bestDist) { bestDist = d; best = elm }
      }
      return best
    }

    const onMouseDown = (e: MouseEvent) => {
      if (!map()) return

      // Middle mouse button always pans
      if (e.button === 1) {
        e.preventDefault()
        dragMode = 'pan'
        panLastX = e.clientX
        panLastY = e.clientY
        canvas.style.cursor = 'grabbing'
        return
      }

      if (e.button !== 0) return
      const tool = activeToolRef.current

      if (tool === 'draw') {
        // Draw mode — create element
        const raw = toCircuit(e.clientX, e.clientY)
        const snapped = snapToNearestPost(raw, elementsRef.current)
        const elm = activeElementTypeRef.current.create(snapped.x, snapped.y)
        elm.drag(snapped.x, snapped.y)
        dragElmRef.current = elm
        dragMode = 'draw'
        redraw()
      } else if (tool === 'pan') {
        // Pan mode — drag pans map
        const hovered = findHovered(e.clientX, e.clientY)
        if (hovered?.isClickable()) {
          clickDownElm = hovered
          clickDownX = e.clientX
          clickDownY = e.clientY
        } else {
          clickDownElm = null
        }
        dragMode = 'pan'
        panLastX = e.clientX
        panLastY = e.clientY
        canvas.style.cursor = 'grabbing'
      } else {
        // Select mode
        const hoveredPost = findHoveredPost(e.clientX, e.clientY)
        const hovered = findHovered(e.clientX, e.clientY)
        clickDownX = e.clientX
        clickDownY = e.clientY

        if (hoveredPost && mouseElmRef.current) {
          // Mousedown on a post — drag the highlighted element's nearest post
          const elm = mouseElmRef.current
          // Find which post of the highlighted element is closest to click
          const cp = toCircuit(e.clientX, e.clientY)
          let bestPost = 0, bestDist = Infinity
          for (let i = 0; i < elm.getPostCount(); i++) {
            const pt = elm.getPost(i)
            const d = (cp.x - pt.x) ** 2 + (cp.y - pt.y) ** 2
            if (d < bestDist) { bestDist = d; bestPost = i }
          }
          clickDownElm = elm
          postDragElm = elm
          postDragIndex = bestPost
          postDragGridCircuit = { ...elm.getPost(bestPost) }
          // Clear hover state so post highlight + PSI tooltip disappear during drag
          mousePostRef.current = null
          mouseElmRef.current = null
          dragMode = 'post-drag'
          elemDragUndoPushed = false
          redraw()
        } else if (hovered) {
          // Mousedown on element — prepare for element drag or click-select
          clickDownElm = hovered
          if (!hovered.selected && !e.shiftKey) {
            // Clear other selections, select this one
            for (const elm of elementsRef.current) elm.selected = false
            hovered.selected = true
          } else if (!hovered.selected && e.shiftKey) {
            hovered.selected = true
          }
          // Start element drag
          dragMode = 'element-drag'
          elemDragStartCircuit = toCircuit(e.clientX, e.clientY)
          elemDragUndoPushed = false
          redraw()
        } else {
          // Mousedown on empty space — start rubber-band
          if (!e.shiftKey) {
            for (const elm of elementsRef.current) elm.selected = false
          }
          clickDownElm = null
          const px = toCssPixel(e.clientX, e.clientY)
          selectionRectRef.current = { x1: px.x, y1: px.y, x2: px.x, y2: px.y }
          dragMode = 'rubber-band'
          redraw()
        }
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      const m = map()
      if (!m) return

      if (dragMode === 'draw' && dragElmRef.current) {
        const raw = toCircuit(e.clientX, e.clientY)
        const snapped = snapToNearestPost(raw, elementsRef.current)
        dragElmRef.current.drag(snapped.x, snapped.y)
        redraw()
      } else if (dragMode === 'pan') {
        const dx = e.clientX - panLastX
        const dy = e.clientY - panLastY
        panLastX = e.clientX
        panLastY = e.clientY
        m.panBy([-dx, -dy], { animate: false })
      } else if (dragMode === 'rubber-band') {
        const px = toCssPixel(e.clientX, e.clientY)
        if (selectionRectRef.current) {
          selectionRectRef.current.x2 = px.x
          selectionRectRef.current.y2 = px.y
        }
        redraw()
      } else if (dragMode === 'element-drag') {
        const now = toCircuit(e.clientX, e.clientY)
        const dx = now.x - elemDragStartCircuit.x
        const dy = now.y - elemDragStartCircuit.y
        if (dx !== 0 || dy !== 0) {
          if (!elemDragUndoPushed) {
            onBeforeChangeRef.current?.()
            elemDragUndoPushed = true
          }
          // Collect all grid points that are moving (from selected elements)
          const movingPoints = new Set<string>()
          for (const elm of elementsRef.current) {
            if (!elm.selected) continue
            for (let i = 0; i < elm.getPostCount(); i++) {
              const p = elm.getPost(i)
              movingPoints.add(`${p.x},${p.y}`)
            }
          }
          // Move selected elements
          for (const elm of elementsRef.current) {
            if (elm.selected) elm.move(dx, dy)
          }
          // Move endpoints of unselected elements that share a grid point
          for (const elm of elementsRef.current) {
            if (elm.selected) continue
            for (let i = 0; i < elm.getPostCount(); i++) {
              const p = elm.getPost(i)
              if (movingPoints.has(`${p.x},${p.y}`)) {
                elm.movePoint(i, dx, dy)
              }
            }
          }
          elemDragStartCircuit = now
          analyzeFlagRef.current = true
          redraw()
        }
      } else if (dragMode === 'post-drag' && postDragElm) {
        const now = toCircuit(e.clientX, e.clientY)
        const dx = now.x - postDragGridCircuit.x
        const dy = now.y - postDragGridCircuit.y
        if (dx !== 0 || dy !== 0) {
          if (!elemDragUndoPushed) {
            onBeforeChangeRef.current?.()
            elemDragUndoPushed = true
          }
          if (e.shiftKey) {
            // Move all posts at this coordinate across all elements
            const gx = postDragGridCircuit.x, gy = postDragGridCircuit.y
            for (const elm of elementsRef.current) {
              if (elm.x === gx && elm.y === gy) elm.movePoint(0, dx, dy)
              else if (elm.x2 === gx && elm.y2 === gy) elm.movePoint(1, dx, dy)
            }
          } else {
            postDragElm.movePoint(postDragIndex, dx, dy)
          }
          postDragGridCircuit = { x: postDragGridCircuit.x + dx, y: postDragGridCircuit.y + dy }
          // Snap to nearby posts
          const draggedPt = postDragIndex === 0
            ? { x: postDragElm.x, y: postDragElm.y }
            : { x: postDragElm.x2, y: postDragElm.y2 }
          const snapDist = 3 * 3
          let bestDist = snapDist, snapX = draggedPt.x, snapY = draggedPt.y
          for (const elm of elementsRef.current) {
            if (elm === postDragElm) continue
            for (let j = 0; j < elm.getPostCount(); j++) {
              const pt = elm.getPost(j)
              const d = (draggedPt.x - pt.x) ** 2 + (draggedPt.y - pt.y) ** 2
              if (d < bestDist) { bestDist = d; snapX = pt.x; snapY = pt.y }
            }
          }
          const sdx = snapX - draggedPt.x, sdy = snapY - draggedPt.y
          if (sdx !== 0 || sdy !== 0) {
            postDragElm.movePoint(postDragIndex, sdx, sdy)
            postDragGridCircuit.x += sdx
            postDragGridCircuit.y += sdy
          }
          analyzeFlagRef.current = true
          redraw()
        }
      } else if (dragMode === 'none') {
        // Hover hit-test
        const prev = mouseElmRef.current
        const prevPost = mousePostRef.current
        mousePostRef.current = findHoveredPost(e.clientX, e.clientY)
        mouseElmRef.current = findHovered(e.clientX, e.clientY)
        if (mouseElmRef.current !== prev || mousePostRef.current !== prevPost) redraw()
        // Track mouse position in circuit coords for paste targeting
        if (mouseCircuitRef) mouseCircuitRef.current = toCircuit(e.clientX, e.clientY)
      }
    }

    const onMouseUp = (e: MouseEvent) => {
      if (!map()) return

      // Middle mouse button release ends pan
      if (e.button === 1 && dragMode === 'pan') {
        canvas.style.cursor = activeToolRef.current === 'pan' ? 'grab'
          : activeToolRef.current === 'draw' ? 'crosshair' : 'default'
        dragMode = 'none'
        return
      }

      if (e.button !== 0) return

      if (dragMode === 'draw' && dragElmRef.current) {
        const raw = toCircuit(e.clientX, e.clientY)
        const snapped = snapToNearestPost(raw, elementsRef.current)
        dragElmRef.current.drag(snapped.x, snapped.y)
        if (!dragElmRef.current.creationFailed()) {
          onBeforeChangeRef.current?.()
          console.log('Placing:', dragElmRef.current.getXmlDumpType(),
            'p0:', JSON.stringify(dragElmRef.current.getPost(0)),
            'p1:', JSON.stringify(dragElmRef.current.getPost(1)))
          const newElms = [...elementsRef.current, dragElmRef.current]
          // ── Connection validation ─────────────────────────────────────
          const placementWarnings = validatePlacement(dragElmRef.current, elementsRef.current)
          const networkWarnings   = validateNetwork(newElms)
          const allWarnings = [...placementWarnings, ...networkWarnings]

          // Check for size issues — show prompt instead of just warning
          const sizeWarning = allWarnings.find(w => w.rule === 3)
          const otherWarnings = allWarnings.filter(w => w.rule !== 3)

          console.log('All warnings:', allWarnings.map(w => `Rule ${w.rule}: ${w.message}`))
          console.log('Size warning:', sizeWarning?.message ?? 'none')

          if (sizeWarning) {
            const nodes = findSharedNodes(dragElmRef.current, elementsRef.current)
            console.log('Size warning fired, nodes:', nodes.length)
            nodes.forEach((n, idx) => {
              const sA = (dragElmRef.current as any)._portSizeCodes?.[n.newPostIndex] ?? 'x'
              const sB = (n.existingElm as any)._portSizeCodes?.[n.existingPostIndex] ?? 'x'
              console.log(`  Node ${idx}: new[${n.newPostIndex}]=${sA} existing[${n.existingPostIndex}]=${sB} (${n.existingElm.getXmlDumpType()})`)
            })
            
            // Find the first node with a size issue
            const problemNode = nodes.find(node => {
              const sizeA = (dragElmRef.current as any)._portSizeCodes?.[node.newPostIndex] ?? 'x'
              const sizeB = (node.existingElm as any)._portSizeCodes?.[node.existingPostIndex] ?? 'x'
              return sizeA === 'x' || sizeB === 'x' || sizeA !== sizeB
            })

            if (problemNode) {
              const typeIdA = dragElmRef.current.getXmlDumpType()
              const typeIdB = problemNode.existingElm.getXmlDumpType()
              const sizeA = (dragElmRef.current as any)._portSizeCodes?.[problemNode.newPostIndex] ?? 'x'
              const sizeB = (problemNode.existingElm as any)._portSizeCodes?.[problemNode.existingPostIndex] ?? 'x'
              console.log('Setting size prompt:', typeIdA, sizeA, typeIdB, sizeB)
              onSimRunningChange?.(false)
              const pendingElm = dragElmRef.current
              setSizePrompt({
                elmA: pendingElm, portA: problemNode.newPostIndex, sizeA, labelA: typeIdA,
                elmB: problemNode.existingElm, portB: problemNode.existingPostIndex, sizeB, labelB: typeIdB,
              })
              dragElmRef.current = null
              redraw()
              return
            }
          }

          // Deduplicate non-size warnings
          const seen = new Set<string>()
          const unique = otherWarnings.filter(w => {
            if (seen.has(w.message)) return false
            seen.add(w.message)
            return true
          })
          if (unique.length > 0) setValidationWarnings(unique)
          // ── Commit element regardless (warnings are non-blocking) ─────
          onElementsChange(newElms)
        } else {
          // Zero-length draw = click — toggle clickable element if any
          const clicked = findHovered(e.clientX, e.clientY)
          if (clicked?.isClickable()) {
            clicked.toggle()
            analyzeFlagRef.current = true
          }
        }
        dragElmRef.current = null
        redraw()
      } else if (dragMode === 'pan') {
        canvas.style.cursor = 'grab'
        // Click on a clickable element (toggle) if mouse didn't move much
        if (clickDownElm) {
          const dx = e.clientX - clickDownX
          const dy = e.clientY - clickDownY
          if (dx * dx + dy * dy < 6 * 6) {
            const upElm = findHovered(e.clientX, e.clientY)
            if (upElm === clickDownElm) {
              clickDownElm.toggle()
              analyzeFlagRef.current = true
              redraw()
            }
          }
          clickDownElm = null
        }
      } else if (dragMode === 'rubber-band') {
        // Select elements whose bounding box intersects the rubber-band rect
        const sr = selectionRectRef.current
        if (sr) {
          const m = map()!
          const rx1 = Math.min(sr.x1, sr.x2), ry1 = Math.min(sr.y1, sr.y2)
          const rx2 = Math.max(sr.x1, sr.x2), ry2 = Math.max(sr.y1, sr.y2)
          for (const elm of elementsRef.current) {
            const p1 = CircuitElm.projectToPixel(elm.point1, m)
            const p2 = CircuitElm.projectToPixel(elm.point2, m)
            const ex1 = Math.min(p1.x, p2.x), ey1 = Math.min(p1.y, p2.y)
            const ex2 = Math.max(p1.x, p2.x), ey2 = Math.max(p1.y, p2.y)
            // AABB intersection test
            if (ex1 <= rx2 && ex2 >= rx1 && ey1 <= ry2 && ey2 >= ry1) {
              elm.selected = true
            }
          }
        }
        selectionRectRef.current = null
        redraw()
      } else if (dragMode === 'element-drag' || dragMode === 'post-drag') {
        // If it was a click (no movement), toggle selection
        const dx = e.clientX - clickDownX
        const dy = e.clientY - clickDownY
        if (dx * dx + dy * dy < 6 * 6 && clickDownElm) {
          if (e.shiftKey) {
            clickDownElm.selected = !clickDownElm.selected
          }
          // Clickable toggle — deselect after so it doesn't stay highlighted
          if (clickDownElm.isClickable()) {
            clickDownElm.toggle()
            if (!e.shiftKey) clickDownElm.selected = false
            analyzeFlagRef.current = true
          }
        }
        postDragElm = null
        postDragIndex = -1
        clickDownElm = null

        // ── Run validation after any drag that may have created connections ──
        const allElms = elementsRef.current
        const dragWarnings: typeof validationWarnings = []
        for (const elm of allElms) {
          const w = validatePlacement(elm, allElms.filter(e => e !== elm))
          const sizeW = w.find(x => x.rule === 3)
          if (sizeW) {
            const nodes = findSharedNodes(elm, allElms.filter(e => e !== elm))
            const problemNode = nodes.find(n => {
              const sA = (elm as any)._portSizeCodes?.[n.newPostIndex] ?? 'x'
              const sB = (n.existingElm as any)._portSizeCodes?.[n.existingPostIndex] ?? 'x'
              return sA === 'x' || sB === 'x' || sA !== sB
            })
            if (problemNode) {
              const sA = (elm as any)._portSizeCodes?.[problemNode.newPostIndex] ?? 'x'
              const sB = (problemNode.existingElm as any)._portSizeCodes?.[problemNode.existingPostIndex] ?? 'x'
              setSizePrompt({
                elmA: elm, portA: problemNode.newPostIndex, sizeA: sA, labelA: elm.getXmlDumpType(),
                elmB: problemNode.existingElm, portB: problemNode.existingPostIndex, sizeB: sB, labelB: problemNode.existingElm.getXmlDumpType(),
              })
              onSimRunningChange?.(false)
              redraw()
              return
            }
          }
          const others = w.filter(x => x.rule !== 3)
          dragWarnings.push(...others)
        }
        if (dragWarnings.length > 0) {
          const seen = new Set<string>()
          setValidationWarnings(dragWarnings.filter(w => {
            if (seen.has(w.message)) return false
            seen.add(w.message)
            return true
          }))
        }

        redraw()
      }

      dragMode = 'none'
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const m = map()
      if (!m) return
      const rect = canvas.getBoundingClientRect()
      const around = new mapboxgl.Point(e.clientX - rect.left, e.clientY - rect.top)
      const delta = e.deltaY > 0 ? -0.5 : 0.5
      m.easeTo({ zoom: m.getZoom() + delta, around: m.unproject(around), duration: 0 })
    }

    const onMouseLeave = () => {
      if (mouseElmRef.current) { mouseElmRef.current = null; redraw() }
    }

    const onContextMenu = (e: MouseEvent) => {
      const elm = findHovered(e.clientX, e.clientY)
      if (elm) {
        e.preventDefault()
        setContextMenu({ x: e.clientX, y: e.clientY, elm })
      } else {
        e.preventDefault()
        setToolMenu({ x: e.clientX, y: e.clientY })
      }
    }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('mouseleave', onMouseLeave)
    canvas.addEventListener('contextmenu', onContextMenu)

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
  }, [onElementsChange, redraw])

  // ── Context menu handlers ────────────────────────────────────────────────────
  const handleEdit = useCallback(() => {
    if (contextMenu) {
      if (contextMenu.elm instanceof LumoValveElm) {
        setBlockElm(contextMenu.elm)
      } else {
        setEditElm(contextMenu.elm)
      }
    }
    setContextMenu(null)
  }, [contextMenu])

  const handleDelete = useCallback(() => {
    if (contextMenu) {
      onBeforeChange?.()
      const hasSelection = elementsRef.current.filter(e => e.selected).length > 1
      if (hasSelection) {
        onElementsChange(elementsRef.current.filter(e => !e.selected))
      } else {
        onElementsChange(elementsRef.current.filter(e => e !== contextMenu.elm))
      }
    }
    setContextMenu(null)
  }, [contextMenu, onElementsChange, onBeforeChange])

  const handleCopy = useCallback(() => {
    if (contextMenu) onCopy?.(contextMenu.elm as any)
    setContextMenu(null)
  }, [contextMenu, onCopy])

  const handleCut = useCallback(() => {
    if (contextMenu) onCut?.(contextMenu.elm as any)
    setContextMenu(null)
  }, [contextMenu, onCut])

  const handlePaste = useCallback(() => {
    onPaste?.()
    setContextMenu(null)
    setToolMenu(null)
  }, [onPaste])

  const handleEditApply = useCallback(() => {
    analyzeFlagRef.current = true
    redraw()
  }, [redraw])

  return (
    <div className="map-wrapper">
      <div ref={mapDivRef} className="map-base" />
      <canvas ref={canvasRef} className="map-canvas" />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onEdit={handleEdit}
          onCut={handleCut}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onDelete={handleDelete}
          onClose={() => setContextMenu(null)}
          canPaste={hasClipboard ?? false}
        />
      )}
      {toolMenu && (
        <ToolContextMenu
          x={toolMenu.x}
          y={toolMenu.y}
          activeTool={activeTool}
          activeElementType={activeElementType}
          onPaste={handlePaste}
          canPaste={hasClipboard ?? false}
          onSelect={(tool, elementType) => {
            if (tool === 'draw' && elementType) {
              onElementTypeChange?.(elementType)
              onToolChange?.('draw')
            } else {
              onToolChange?.(tool)
            }
            setToolMenu(null)
          }}
          onClose={() => setToolMenu(null)}
        />
      )}
      {validationWarnings.length > 0 && (
        <ValidationToast
          warnings={validationWarnings}
          onClose={() => setValidationWarnings([])}
        />
      )}
      {sizePrompt && (
        <SizePromptDialog
          labelA={sizePrompt.labelA}
          sizeA={sizePrompt.sizeA}
          labelB={sizePrompt.labelB}
          sizeB={sizePrompt.sizeB}
          onResolve={(code) => {
            if (!(sizePrompt.elmA as any)._portSizeCodes) (sizePrompt.elmA as any)._portSizeCodes = []
            if (!(sizePrompt.elmB as any)._portSizeCodes) (sizePrompt.elmB as any)._portSizeCodes = []
            ;(sizePrompt.elmA as any)._portSizeCodes[sizePrompt.portA] = code
            ;(sizePrompt.elmB as any)._portSizeCodes[sizePrompt.portB] = code
            setSizePrompt(null)
            onElementsChange([...elementsRef.current, sizePrompt.elmA])
            onSimRunningChange?.(true)
          }}
          onCancel={() => {
            // Discard element, keep simulation stopped
            setSizePrompt(null)
            onSimRunningChange?.(false)
          }}
        />
      )}
      {blockElm && (
        <BlockConfigDialog
          elm={blockElm}
          onClose={() => setBlockElm(null)}
          onApply={(_elm) => { handleEditApply(); setBlockElm(null) }}
        />
      )}
      {editElm && (
        <DeviceConfigDialog
          elm={editElm}
          elements={elementsRef.current}
          onClose={() => setEditElm(null)}
          onApply={() => handleEditApply()}
        />
      )}
    </div>
  )
}
