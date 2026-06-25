import type { Map as MapboxMap } from 'mapbox-gl'

// Circuit coordinate system: 1 unit = 1 meter.
// Anchor maps circuit origin (0,0) to this GPS point.
export let ANCHOR_LAT = 34.201272
export let ANCHOR_LNG = -119.061576
export const METERS_PER_UNIT = 1.0

export function setAnchor(lat: number, lng: number) {
  ANCHOR_LAT = lat
  ANCHOR_LNG = lng
}

// A point in circuit coordinates (integers, in meters from anchor)
export interface CPoint {
  x: number
  y: number
}

// ── Color scale (maps pressure/voltage to a color) ──────────────────────────
export const COLOR_SCALE_COUNT = 201  // odd so midpoint = neutral
export const VOLTAGE_RANGE = 5        // PSI range for color scale

const colorScale: string[] = new Array(COLOR_SCALE_COUNT)

function lerpColor(r1: number, g1: number, b1: number,
                   r2: number, g2: number, b2: number, t: number) {
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `rgb(${r},${g},${b})`
}

export function initColorScale(
  positiveColor = { r: 0, g: 0, b: 255 },
  negativeColor = { r: 255, g: 0,   b: 0   },
  neutralColor  = { r: 255, g: 255, b: 255  },
) {
  for (let i = 0; i < COLOR_SCALE_COUNT; i++) {
    const v = i * 2.0 / COLOR_SCALE_COUNT - 1
    if (v < 0) {
      colorScale[i] = lerpColor(
        neutralColor.r, neutralColor.g, neutralColor.b,
        negativeColor.r, negativeColor.g, negativeColor.b,
        -v,
      )
    } else {
      colorScale[i] = lerpColor(
        neutralColor.r, neutralColor.g, neutralColor.b,
        positiveColor.r, positiveColor.g, positiveColor.b,
        v,
      )
    }
  }
}
initColorScale()

export function getVoltageColor(volts: number, voltageRange = VOLTAGE_RANGE): string {
  let v = volts
  if (v < 0) v = 0
  let c = Math.round((v + voltageRange) * (COLOR_SCALE_COUNT - 1) / (voltageRange * 2))
  c = Math.max(0, Math.min(COLOR_SCALE_COUNT - 1, c))
  return colorScale[c]
}

// ── Simulator interface (methods elements need from the matrix solver) ────────
export interface Simulator {
  converged: boolean
  subIterations: number
  timeStep: number
  stampNonLinear(node: number): void
  stampVoltageSource(n1: number, n2: number, vs: number, v: number): void
  stampVoltageSourceDynamic(n1: number, n2: number, vs: number): void
  updateVoltageSource(n1: number, n2: number, vs: number, v: number): void
  stampVCCurrentSource(n1: number, n2: number, vn1: number, vn2: number, g: number): void
  stampCurrentSource(n1: number, n2: number, i: number): void
  stampResistor(n1: number, n2: number, r: number): void
  stampRightSide(n: number): void
}

// ── Draw context bundle ──────────────────────────────────────────────────────
// The canvas transform is pre-set so all drawing happens in circuit coordinates.
export interface DrawContext {
  ctx: CanvasRenderingContext2D
  scale: number       // CSS pixels per circuit unit (for line widths, dot sizes)
  simRunning: boolean
  showVoltageColors: boolean
  currentMult: number // controls dot animation speed
  nodeCounts?: Map<string, number> // "x,y" → number of elements sharing that node
}

// ── EditInfo — used by Edit dialog to show/modify element fields ─────────────
export interface EditInfo {
  name: string
  value: number
  dimensionless?: boolean
  choice?: { options: string[], selected: number }
}

// ── CircuitElm base class ────────────────────────────────────────────────────
export abstract class CircuitElm {
  // The element the mouse is currently over (set by MapView before each redraw)
  static mouseElm: CircuitElm | null = null

  static readonly SELECT_COLOR = '#00ffff'
  // endpoints in circuit coords (integer meters from anchor)
  x: number; y: number
  x2: number; y2: number
  flags: number

  // computed by setPoints()
  dx = 0; dy = 0
  dn = 0          // length
  dpx1 = 0; dpy1 = 0   // unit perpendicular
  dsign = 0
  point1: CPoint = { x: 0, y: 0 }
  point2: CPoint = { x: 0, y: 0 }
  lead1: CPoint = { x: 0, y: 0 }
  lead2: CPoint = { x: 0, y: 0 }

  nodes: number[] = []
  volts: number[] = []
  voltSource = 0
  current = 0
  curcount = 0
  selected = false

  // bounding box in circuit coords
  bbox = { x: 0, y: 0, w: 0, h: 0 }

  constructor(x: number, y: number, x2?: number, y2?: number, flags = 0) {
    this.x = x; this.y = y
    this.x2 = x2 ?? x; this.y2 = y2 ?? y
    this.flags = flags
    this.allocNodes()
    this.initBoundingBox()
  }

  // ── Subclass overrides ─────────────────────────────────────────────────────
  abstract draw(dc: DrawContext, onLoad?: () => void): void
  getInfo(_arr: string[]): void { }
  getEditInfo(_n: number): EditInfo | null { return null }
  setEditValue(_n: number, _ei: EditInfo): void { }
  getPostCount(): number { return 2 }
  getInternalNodeCount(): number { return 0 }
  getVoltageSourceCount(): number { return 0 }
  getNodeCount(): number { return this.getPostCount() + this.getInternalNodeCount() }
  nonLinear(): boolean { return false }
  stamp(_sim: Simulator): void { }
  doStep(_sim: Simulator): void { }
  startIteration(): void { }
  stepFinished(): void { }
  hasGroundConnection(_n: number): boolean { return false }
  reset(): void { this.volts.fill(0); this.curcount = 0 }
  getShortcut(): number { return 0 }
  getFixedLength(): number { return 60 }
  isClickable(): boolean { return false }
  toggle(): void { }
  getXmlDumpType(): string { return '' }

  // Serialize element attributes into a plain object (tag set by subclass)
  dumpXml(attrs: Record<string, string>): void {
    attrs['x'] = `${this.x} ${this.y} ${this.x2} ${this.y2}`
    if (this.flags !== 0) attrs['f'] = String(this.flags)
  }

  // Read element attributes from an XML element; caller sets position afterwards
  undumpXml(elem: Element): void {
    this.flags = int(elem, 'f', this.flags)
  }

  // ── Node/voltage bookkeeping ───────────────────────────────────────────────
  allocNodes(): void {
    const n = this.getNodeCount()
    if (this.nodes.length !== n) {
      this.nodes = new Array(n).fill(0)
      this.volts = new Array(n).fill(0)
    }
  }

  setNode(p: number, n: number): void { this.nodes[p] = n }
  setVoltageSource(_n: number, v: number): void { this.voltSource = v }
  setNodeVoltage(n: number, v: number): void { this.volts[n] = v; this.calculateCurrent() }
  calculateCurrent(): void { }
  setCurrent(_vn: number, c: number): void { this.current = c }
  getCurrent(): number { return this.current }
  getVoltageDiff(): number { return this.volts[0] - this.volts[1] }
  getPostVoltage(n: number): number { return this.volts[n] }

  needsHighlight(): boolean { return CircuitElm.mouseElm === this || this.selected }

  // Use instead of the standalone getVoltageColor() so highlight takes priority
  voltageColor(n: number): string {
    if (this.needsHighlight()) return CircuitElm.SELECT_COLOR
    return getVoltageColor(this.volts[n])
  }
  getPost(n: number): CPoint { return n === 0 ? this.point1 : this.point2 }

  // ── Geometry ───────────────────────────────────────────────────────────────
  setPoints(): void {
    this.dx = this.x2 - this.x
    this.dy = this.y2 - this.y
    this.dn = Math.sqrt(this.dx * this.dx + this.dy * this.dy)
    if (this.dn === 0) this.dn = 1e-10
    this.dpx1 = this.dy / this.dn
    this.dpy1 = -this.dx / this.dn
    this.dsign = this.dy === 0 ? Math.sign(this.dx) : Math.sign(this.dy)
    this.point1 = { x: this.x, y: this.y }
    this.point2 = { x: this.x2, y: this.y2 }
  }

  calcLeads(len: number): void {
    if (this.dn < len || len === 0) {
      this.lead1 = { ...this.point1 }
      this.lead2 = { ...this.point2 }
      return
    }
    this.lead1 = this.interpPoint(this.point1, this.point2, (this.dn - len) / (2 * this.dn))
    this.lead2 = this.interpPoint(this.point1, this.point2, (this.dn + len) / (2 * this.dn))
  }

  interpPoint(a: CPoint, b: CPoint, f: number, g = 0): CPoint {
    if (g === 0) {
      return {
        x: Math.floor(a.x * (1 - f) + b.x * f + 0.48),
        y: Math.floor(a.y * (1 - f) + b.y * f + 0.48),
      }
    }
    const gx = b.y - a.y
    const gy = a.x - b.x
    const gn = g / Math.sqrt(gx * gx + gy * gy)
    return {
      x: Math.floor(a.x * (1 - f) + b.x * f + gn * gx + 0.48),
      y: Math.floor(a.y * (1 - f) + b.y * f + gn * gy + 0.48),
    }
  }

  // Returns two points symmetrically offset perpendicularly by ±g
  interpPoint2(a: CPoint, b: CPoint, f: number, g: number): [CPoint, CPoint] {
    const gx = b.y - a.y
    const gy = a.x - b.x
    const gn = g / Math.sqrt(gx * gx + gy * gy)
    const c: CPoint = {
      x: Math.floor(a.x * (1 - f) + b.x * f + gn * gx + 0.48),
      y: Math.floor(a.y * (1 - f) + b.y * f + gn * gy + 0.48),
    }
    const d: CPoint = {
      x: Math.floor(a.x * (1 - f) + b.x * f - gn * gx + 0.48),
      y: Math.floor(a.y * (1 - f) + b.y * f - gn * gy + 0.48),
    }
    return [c, d]
  }

  // ── Bounding box ───────────────────────────────────────────────────────────
  initBoundingBox(): void {
    this.bbox = {
      x: Math.min(this.x, this.x2),
      y: Math.min(this.y, this.y2),
      w: Math.abs(this.x2 - this.x) + 1,
      h: Math.abs(this.y2 - this.y) + 1,
    }
  }

  setBbox(x1: number, y1: number, x2: number, y2: number): void {
    if (x1 > x2) { [x1, x2] = [x2, x1] }
    if (y1 > y2) { [y1, y2] = [y2, y1] }
    this.bbox = { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 }
  }

  setBboxFromPoints(p1: CPoint, p2: CPoint, w: number): void {
    this.setBbox(p1.x, p1.y, p2.x, p2.y)
    const dpx = Math.round(this.dpx1 * w)
    const dpy = Math.round(this.dpy1 * w)
    this.adjustBbox(p1.x + dpx, p1.y + dpy, p1.x - dpx, p1.y - dpy)
  }

  adjustBbox(x1: number, y1: number, x2: number, y2: number): void {
    if (x1 > x2) { [x1, x2] = [x2, x1] }
    if (y1 > y2) { [y1, y2] = [y2, y1] }
    this.bbox = {
      x: Math.min(this.bbox.x, x1),
      y: Math.min(this.bbox.y, y1),
      w: Math.max(this.bbox.x + this.bbox.w, x2) - Math.min(this.bbox.x, x1),
      h: Math.max(this.bbox.y + this.bbox.h, y2) - Math.min(this.bbox.y, y1),
    }
  }

  // ── Coordinate conversions ─────────────────────────────────────────────────

  // Circuit coordinate → [lat, lng]
  static circuitToGps(cx: number, cy: number): [number, number] {
    const lat = ANCHOR_LAT - (cy * METERS_PER_UNIT) / 111320.0
    const lng = ANCHOR_LNG + (cx * METERS_PER_UNIT) / (111320.0 * Math.cos(ANCHOR_LAT * Math.PI / 180))
    return [lat, lng]
  }

  // Haversine distance in meters between two circuit-coordinate points
  static gpsDistanceMeters(x1: number, y1: number, x2: number, y2: number): number {
    const [lat1, lng1] = CircuitElm.circuitToGps(x1, y1)
    const [lat2, lng2] = CircuitElm.circuitToGps(x2, y2)
    const R = 6371000
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const dφ = (lat2 - lat1) * Math.PI / 180
    const dλ = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  // Project a circuit point to canvas pixel coords via the Mapbox map
  static projectToPixel(p: CPoint, map: MapboxMap): { x: number; y: number } {
    const [lat, lng] = CircuitElm.circuitToGps(p.x, p.y)
    return map.project([lng, lat])
  }

  // ── Drawing helpers ────────────────────────────────────────────────────────

  // Apply a cyan tint overlay to a drawn image region when highlighted.
  // Call immediately after ctx.drawImage() while still in the same save/restore.
  drawHighlightOverlay(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    if (!this.needsHighlight()) return
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = 'rgba(0, 255, 255, 0.6)'
    ctx.fillRect(x, y, w, h)
    ctx.globalCompositeOperation = 'source-over'
  }

  // Draw current flow dots along a line segment (in circuit coordinates)
  drawDots(dc: DrawContext, pa: CPoint, pb: CPoint, pos: number): void {
    if (!dc.simRunning || pos === 0) return
    const dx = pb.x - pa.x
    const dy = pb.y - pa.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1e-10) return
    const ds = 16 / dc.scale     // 16-pixel spacing → circuit units
    const posC = pos / dc.scale  // convert accumulated pos to circuit units
    let p = ((posC % ds) + ds) % ds
    const r = 2 / dc.scale       // 2-pixel dot radius
    const ctx = dc.ctx
    ctx.fillStyle = '#00ffff'
    for (; p < len; p += ds) {
      const px = pa.x + p * dx / len
      const py = pa.y + p * dy / len
      ctx.fillRect(px - r, py - r, 2 * r, 2 * r)
    }
  }

  updateDotCount(): void {
    this.curcount = this.curcount + this.current // caller scales by currentMult
  }

  // Draw endpoint posts (small circles in circuit coords)
  // Skip posts shared by exactly 2 elements (simple connections)
  drawPosts(dc: DrawContext): void {
    const ctx = dc.ctx
    const r = 3 / dc.scale
    for (let i = 0; i < this.getPostCount(); i++) {
      const p = this.getPost(i)
      if (dc.nodeCounts) {
        const count = dc.nodeCounts.get(p.x + ',' + p.y) ?? 0
        if (count === 2) continue
      }
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
    }
  }

  // Draw size labels next to each water port
  drawPortSizeLabels(dc: DrawContext): void {
    const ctx = dc.ctx
    const scale = dc.scale
    const sizeCodes: string[] = (this as any)._portSizeCodes ?? []
    if (sizeCodes.length === 0) return

    const SIZES: Record<string, string> = {
      A:'1/8"',B:'1/4"',C:'3/8"',D:'1/2"',E:'5/8"',F:'3/4"',
      G:'1"',H:'1-1/4"',I:'1-1/2"',J:'2"',K:'2-1/2"',
      L:'3"',M:'4"',N:'5"',O:'6"',P:'8"',Q:'10"'
    }

    const fontSize = Math.max(11 / scale, 3)
    ctx.save()
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let i = 0; i < this.getPostCount() && i < sizeCodes.length; i++) {
      const p = this.getPost(i)
      const code = sizeCodes[i] ?? 'x'
      const label = code === 'x' ? '?' : `${code} ${SIZES[code] ?? ''}`
      const color = code === 'x' ? '#ffaa00' : '#00ccff'

      // Offset label away from center of element
      const cx = (this.point1.x + this.point2.x) / 2
      const cy = (this.point1.y + this.point2.y) / 2
      const dx = p.x - cx, dy = p.y - cy
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const offset = 8 / scale
      const lx = p.x + (dx / dist) * offset
      const ly = p.y + (dy / dist) * offset

      ctx.fillStyle = color
      ctx.fillText(label, lx, ly)
    }
    ctx.restore()
  }

  // ── Info text ──────────────────────────────────────────────────────────────
  static getUnitText(v: number, u: string): string {
    return `${+v.toFixed(3)} ${u}`
  }

  static getCurrentText(i: number): string { return CircuitElm.getUnitText(i, 'GPM') }
  static getCurrentDText(i: number): string { return CircuitElm.getUnitText(Math.abs(i), 'GPM') }
  static getVoltageDText(v: number): string { return CircuitElm.getUnitText(Math.abs(v), 'PSI') }
  static getVoltageText(v: number): string { return CircuitElm.getUnitText(v, 'PSI') }

  getBasicInfo(arr: string[]): number {
    arr[1] = 'Flow = ' + CircuitElm.getCurrentDText(this.getCurrent())
    arr[2] = 'Pd = ' + CircuitElm.getVoltageDText(this.getVoltageDiff())
    return 3
  }

  // ── Misc ───────────────────────────────────────────────────────────────────
  static distance(p1: CPoint, p2: CPoint): number {
    const dx = p1.x - p2.x, dy = p1.y - p2.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Port of CircuitElm.drag() — sets x2,y2 from drag target, respecting fixedLength
  drag(xx: number, yy: number): void {
    const dx = xx - this.x
    const dy = yy - this.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 20) {
      this.x2 = this.x; this.y2 = this.y
    } else {
      const fixedLen = this.getFixedLength()
      if (fixedLen > 0 && dist > fixedLen) {
        this.x2 = this.x + Math.round(fixedLen * dx / dist)
        this.y2 = this.y + Math.round(fixedLen * dy / dist)
      } else {
        this.x2 = xx; this.y2 = yy
      }
    }
    this.setPoints()
  }

  creationFailed(): boolean { return this.x === this.x2 && this.y === this.y2 }

  move(dx: number, dy: number): void {
    this.x += dx; this.y += dy; this.x2 += dx; this.y2 += dy
    this.bbox.x += dx; this.bbox.y += dy
    this.setPoints()
  }

  movePoint(n: number, dx: number, dy: number): void {
    const ox = this.x, oy = this.y, ox2 = this.x2, oy2 = this.y2
    if (n === 0) { this.x += dx; this.y += dy }
    else { this.x2 += dx; this.y2 += dy }
    if (this.x === this.x2 && this.y === this.y2) {
      this.x = ox; this.y = oy; this.x2 = ox2; this.y2 = oy2
    }
    this.setPoints()
  }

  getMouseDistance(gx: number, gy: number): number {
    // Squared distance from point (gx,gy) to the line segment x1→x2
    const dtop = (this.y2 - this.y) * gx - (this.x2 - this.x) * gy + this.x2 * this.y - this.y2 * this.x
    const dbot = (this.y2 - this.y) ** 2 + (this.x2 - this.x) ** 2
    return dbot === 0 ? Infinity : dtop * dtop / dbot
  }
}

// ── XML attribute helpers (used by subclasses in undumpXml) ───────────────────
export function dbl(elem: Element, attr: string, def: number): number {
  const v = elem.getAttribute(attr); return v !== null ? parseFloat(v) : def
}
export function int(elem: Element, attr: string, def: number): number {
  const v = elem.getAttribute(attr); return v !== null ? parseInt(v, 10) : def
}
