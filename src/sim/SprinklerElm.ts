import { CircuitElm, type DrawContext, type Simulator, type EditInfo, dbl } from './CircuitElm'
import { getImage, isReady } from './ImageLoader'

const IMG_SRC = '/sprinkler.png'
const IMG_SIZE = 20  // circuit units (matches GWT imgSize)

export class SprinklerElm extends CircuitElm {
  flowCoeff = 2
  private lastVolt = 0
  private sprinkling = false

  constructor(x: number, y: number, x2?: number, y2?: number, flags = 0) {
    super(x, y, x2, y2, flags)
  }

  getDumpType(): number { return 501 }
  getXmlDumpType(): string { return 'sp' }
  getFixedLength(): number { return 32 }
  getPostCount(): number { return 1 }
  // Single post at point1 (base class default)

  nonLinear(): boolean { return true }

  stamp(sim: Simulator): void {
    sim.stampNonLinear(this.nodes[0])
  }

  startIteration(): void {
    this.sprinkling = this.volts[0] >= 1
  }

  getConvergeLimit(): number { return 0.01 }

  doStep(sim: Simulator): void {
    if (!this.sprinkling) {
      this.current = 0
      sim.stampResistor(this.nodes[0], 0, 100)
      return
    }

    if (Math.abs(this.volts[0] - this.lastVolt) > this.getConvergeLimit())
      sim.converged = false

    const v = Math.max(0, this.volts[0])
    const sqrtV = Math.sqrt(v)
    const i0 = this.flowCoeff * sqrtV

    const lim = 1
    const dx = sqrtV > lim
      ? this.flowCoeff / (2 * sqrtV)
      : this.flowCoeff / (2 * lim)

    sim.stampVCCurrentSource(this.nodes[0], 0, this.nodes[0], 0, dx)
    sim.stampCurrentSource(this.nodes[0], 0, i0 - dx * this.volts[0])

    this.current = i0
    this.lastVolt = this.volts[0]
  }

  reset(): void {
    super.reset()
    this.lastVolt = 0
  }

  draw(dc: DrawContext, onLoad?: () => void): void {
    const { ctx, scale } = dc
    const lw = 3 / scale

    // Stem line colored by pressure
    ctx.save()
    ctx.strokeStyle = this.voltageColor(0)
    ctx.lineWidth = lw
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(this.point1.x, this.point1.y)
    ctx.lineTo(this.point2.x, this.point2.y)
    ctx.stroke()

    // Icon at point2, rotated to match element direction
    const img = getImage(IMG_SRC, onLoad)
    if (isReady(img)) {
      const angle = Math.atan2(this.dy, this.dx) + Math.PI / 2
      const aspect = img.naturalWidth / img.naturalHeight
      const drawW = IMG_SIZE * aspect
      const drawH = IMG_SIZE
      ctx.save()
      ctx.translate(this.point2.x, this.point2.y)
      ctx.rotate(angle)
      ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH)
      this.drawHighlightOverlay(ctx, -drawW / 2, -drawH, drawW, drawH)
      ctx.restore()
    }

    ctx.restore()

    this.curcount += this.current * dc.currentMult
    this.drawDots(dc, this.point1, this.point2, this.curcount)
    this.drawPosts(dc)
  }

  getInfo(arr: string[]): void {
    arr[0] = 'sprinkler'
    arr[1] = 'Flow = ' + CircuitElm.getCurrentText(this.getCurrent())
  }

  hasGroundConnection(_n: number): boolean { return true }
  getCurrentIntoNode(_n: number): number { return -this.current }

  // ── Edit ─────────────────────────────────────────────────────────────────────
  getEditInfo(n: number): EditInfo | null {
    if (n === 0) return { name: 'Flow Coefficient', value: this.flowCoeff, dimensionless: true }
    return null
  }

  setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.flowCoeff = ei.value
  }

  // ── XML serialisation ───────────────────────────────────────────────────────
  dumpXml(attrs: Record<string, string>): void {
    super.dumpXml(attrs)
    attrs['fc'] = String(this.flowCoeff)
  }

  undumpXml(elem: Element): void {
    super.undumpXml(elem)
    this.flowCoeff = dbl(elem, 'fc', this.flowCoeff)
  }

  static fromXml(elem: Element): SprinklerElm {
    const x = elem.getAttribute('x')!.split(' ').map(Number)
    const elm = new SprinklerElm(x[0], x[1], x[2], x[3])
    elm.undumpXml(elem)
    elm.setPoints()
    return elm
  }
}
