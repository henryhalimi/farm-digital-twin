import { CircuitElm, type DrawContext, type Simulator, type EditInfo, getVoltageColor, dbl } from './CircuitElm'
import { UIManager } from './UIManager'

export class PipeElm extends CircuitElm {
  diameter = 1.61    // pipe inner diameter, inches
  elevDiff = 0       // elevation difference: point2 - point1, meters
  lengthMeters = 0   // physical pipe length in meters (from GPS distance)

  // Internal points for drawing pipe barrel sides
  ps3 = { x: 0, y: 0 }
  ps4 = { x: 0, y: 0 }

  // Newton-Raphson state
  private lastVolts = [0, 0, 0]

  constructor(x: number, y: number, x2?: number, y2?: number, flags = 0) {
    super(x, y, x2, y2, flags)
  }

  // ── Identity ───────────────────────────────────────────────────────────────
  getDumpType(): number { return 500 }
  getXmlDumpType(): string { return 'pp' }
  getShortcut(): number { return 'p'.charCodeAt(0) }
  getFixedLength(): number { return 0 }   // variable length

  // ── Node/source counts ─────────────────────────────────────────────────────
  getPostCount(): number { return 2 }
  getInternalNodeCount(): number { return 1 }   // internal pressure node
  getVoltageSourceCount(): number { return 1 }   // elevation voltage source
  nonLinear(): boolean { return true }

  // ── Geometry ───────────────────────────────────────────────────────────────
  setPoints(): void {
    super.setPoints()
    this.calcLeads(32)
    this.ps3 = { x: 0, y: 0 }
    this.ps4 = { x: 0, y: 0 }

    // Physical length from GPS
    this.lengthMeters = CircuitElm.gpsDistanceMeters(
      this.point1.x, this.point1.y,
      this.point2.x, this.point2.y,
    )

    // Refresh elevation difference from terrain if available
    const elev1 = UIManager.getElevation(this.point1.x, this.point1.y)
    const elev2 = UIManager.getElevation(this.point2.x, this.point2.y)
    if (!isNaN(elev1) && !isNaN(elev2)) {
      this.elevDiff = elev2 - elev1
    }
  }

  // ── Hydraulic model ────────────────────────────────────────────────────────

  // Elevation pressure difference in PSI (positive = point2 is higher → pressure drop)
  getElevPressure(): number {
    // 1 m water head = 3.28084 ft × 0.433 PSI/ft ≈ 1.4206 PSI
    return this.elevDiff * 3.28084 * 0.433
  }

  // Hazen-Williams flow equation:
  //   Q (GPM) = 0.442 × C × d^2.63 × (ΔP / L)^0.54
  // C = 150 (smooth plastic pipe), dv in PSI, L in feet, d in inches
  evalFunc(dv: number): number {
    const lenFeet = this.lengthMeters * 3.28084
    const head = dv * 2.31   // PSI → feet of head
    return -0.442 * 150 * Math.pow(this.diameter, 2.63) *
      Math.sign(head) * Math.pow(Math.abs(head) / lenFeet, 0.54)
  }

  // ── Simulation ─────────────────────────────────────────────────────────────

  stamp(sim: Simulator): void {
    // Nonlinear flow resistance between nodes 0 (inlet) and 2 (internal)
    sim.stampNonLinear(this.nodes[0])
    sim.stampNonLinear(this.nodes[2])
    // Voltage source between nodes 2 and 1 for elevation pressure
    sim.stampVoltageSource(this.nodes[2], this.nodes[1], this.voltSource, -this.getElevPressure())
  }

  getConvergeLimit(): number {
    if (this.lastVolts[0] === 0 && this.lastVolts[1] === 0) return 0.001
    return 0.01
  }

  doStep(sim: Simulator): void {
    const convergeLimit = this.getConvergeLimit()
    for (let i = 0; i < 3; i++) {
      if (Math.abs(this.volts[i] - this.lastVolts[i]) > convergeLimit)
        sim.converged = false
    }

    // Flow is across the pipe resistance (nodes 0 → 2)
    const dv = this.volts[2] - this.volts[0]
    let i0 = this.evalFunc(dv)

    // Linearise: stamp conductance from numerical derivative at each input node
    for (let i = 0; i < 2; i++) {
      const nd = i === 0 ? 0 : 2
      let ddv = this.volts[nd] - this.lastVolts[nd]
      if (Math.abs(ddv) < 1e-6) ddv = 1e-6
      const vMinus = i === 0
        ? (this.volts[2] - (this.volts[0] - ddv))
        : ((this.volts[2] - ddv) - this.volts[0])
      const iv  = this.evalFunc(dv)
      const iv2 = this.evalFunc(vMinus)
      let dx = (iv - iv2) / ddv
      if (Math.abs(dx) < 1e-6) dx = dx >= 0 ? 1e-6 : -1e-6
      sim.stampVCCurrentSource(this.nodes[0], this.nodes[2], this.nodes[nd], 0, dx)
      i0 -= dx * this.volts[nd]
    }
    sim.stampCurrentSource(this.nodes[0], this.nodes[2], i0)

    this.current = this.evalFunc(dv)
    this.lastVolts[0] = this.volts[0]
    this.lastVolts[1] = this.volts[1]
    this.lastVolts[2] = this.volts[2]
  }

  reset(): void {
    super.reset()
    this.lastVolts = [0, 0, 0]
  }

  // ── Drawing ────────────────────────────────────────────────────────────────
  draw(dc: DrawContext, _onLoad?: () => void): void {
    const { ctx, scale, showVoltageColors } = dc
    const lw = 3 / scale

    ctx.save()
    ctx.lineWidth = lw
    ctx.lineCap = 'round'

    if (this.needsHighlight()) {
      ctx.strokeStyle = CircuitElm.SELECT_COLOR
    } else if (showVoltageColors) {
      const grad = ctx.createLinearGradient(
        this.point1.x, this.point1.y, this.point2.x, this.point2.y)
      grad.addColorStop(0, getVoltageColor(this.volts[0]))
      grad.addColorStop(1, getVoltageColor(this.volts[1]))
      ctx.strokeStyle = grad
    } else {
      ctx.strokeStyle = '#ffffff'
    }

    ctx.beginPath()
    ctx.moveTo(this.point1.x, this.point1.y)
    ctx.lineTo(this.point2.x, this.point2.y)
    ctx.stroke()
    ctx.restore()

    // Current flow dots
    this.curcount += this.current * dc.currentMult
    this.drawDots(dc, this.point1, this.point2, this.curcount)

    // ── Size label ────────────────────────────────────────────────────────────
    this.drawSizeLabel(ctx, scale)

    // Endpoint posts
    this.drawPosts(dc)
  }

  private drawSizeLabel(ctx: CanvasRenderingContext2D, scale: number): void {
    const sizeCode = (this as any)._portSizeCodes?.[0] ?? 'x'
    const SIZES: Record<string, string> = {
      A:'1/8"',B:'1/4"',C:'3/8"',D:'1/2"',E:'5/8"',F:'3/4"',
      G:'1"',H:'1-1/4"',I:'1-1/2"',J:'2"',K:'2-1/2"',
      L:'3"',M:'4"',N:'5"',O:'6"',P:'8"',Q:'10"'
    }
    const label = sizeCode === 'x' ? '?' : `${sizeCode} ${SIZES[sizeCode] ?? ''}`
    const color = sizeCode === 'x' ? '#ffaa00' : '#00ccff'

    const mx = (this.point1.x + this.point2.x) / 2
    const my = (this.point1.y + this.point2.y) / 2
    const dx = this.point2.x - this.point1.x
    const dy = this.point2.y - this.point1.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const px = -dy / len, py = dx / len
    const offset = 10 / scale
    const lx = mx + px * offset
    const ly = my + py * offset

    const fontSize = Math.max(11 / scale, 3)
    ctx.save()
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    ctx.fillText(label, lx, ly)
    ctx.restore()
  }

  // ── Info display ───────────────────────────────────────────────────────────
  getInfo(arr: string[]): void {
    arr[0] = 'pipe'
    this.getBasicInfo(arr)
    arr[3] = 'len = ' + CircuitElm.getUnitText(this.lengthMeters / 0.3048, 'ft')
    arr[4] = 'elev diff = ' + CircuitElm.getUnitText(this.elevDiff / 0.3048, 'ft')
    arr[5] = 'elev P = ' + CircuitElm.getUnitText(this.getElevPressure(), 'PSI')
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────
  getEditInfo(n: number): EditInfo | null {
    if (n === 0) return { name: 'Diameter (inches)', value: this.diameter }
    return null
  }

  setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.diameter = ei.value
  }

  // ── XML serialisation ───────────────────────────────────────────────────────
  dumpXml(attrs: Record<string, string>): void {
    super.dumpXml(attrs)
    attrs['ln']  = String(this.lengthMeters)
    attrs['dia'] = String(this.diameter)
    attrs['ed']  = String(this.elevDiff)
  }

  undumpXml(elem: Element): void {
    super.undumpXml(elem)
    this.lengthMeters = dbl(elem, 'ln', this.lengthMeters)
    this.diameter     = dbl(elem, 'dia', this.diameter)
    this.elevDiff     = dbl(elem, 'ed', 0)
  }

  static fromXml(elem: Element): PipeElm {
    const x = elem.getAttribute('x')!.split(' ').map(Number)
    const elm = new PipeElm(x[0], x[1], x[2], x[3])
    elm.undumpXml(elem)
    elm.setPoints()
    return elm
  }
}
