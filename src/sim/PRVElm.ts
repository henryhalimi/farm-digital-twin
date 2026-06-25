import { CircuitElm, type DrawContext, type Simulator, type EditInfo, dbl } from './CircuitElm'
import { getImage, isReady } from './ImageLoader'

/**
 * Pressure Reducing Valve — nonlinear element that adjusts its resistance
 * to maintain the outlet (node 1) at setPoint PSI.
 */
export class PRVElm extends CircuitElm {
  setPoint = 75       // PSI
  private resistance = 1

  constructor(x: number, y: number, x2?: number, y2?: number, flags = 0) {
    super(x, y, x2, y2, flags)
  }

  getXmlDumpType(): string { return 'prv' }
  getFixedLength(): number { return 32 }
  nonLinear(): boolean { return true }

  setPoints(): void {
    super.setPoints()
    this.calcLeads(32)
  }

  stamp(sim: Simulator): void {
    sim.stampNonLinear(this.nodes[0])
    sim.stampNonLinear(this.nodes[1])
    this.resistance = 1
  }

  startIteration(): void {
    const diff = this.volts[1] - this.setPoint
    if (this.current !== 0)
      this.resistance += 0.25 * diff / this.current
    if (this.resistance <= 1e-4) this.resistance = 1e-4
  }

  doStep(sim: Simulator): void {
    sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance)
  }

  calculateCurrent(): void {
    this.current = (this.volts[0] - this.volts[1]) / this.resistance
  }

  draw(dc: DrawContext, onLoad?: () => void): void {
    const { ctx, scale } = dc
    const lw = 3 / scale

    ctx.save()
    ctx.lineWidth = lw
    ctx.lineCap = 'round'
    ctx.strokeStyle = this.voltageColor(0)
    ctx.beginPath(); ctx.moveTo(this.point1.x, this.point1.y); ctx.lineTo(this.lead1.x, this.lead1.y); ctx.stroke()
    ctx.strokeStyle = this.voltageColor(1)
    ctx.beginPath(); ctx.moveTo(this.point2.x, this.point2.y); ctx.lineTo(this.lead2.x, this.lead2.y); ctx.stroke()
    ctx.restore()

    const img = getImage('/prv-icon.svg', onLoad)
    if (isReady(img)) {
      const dx = this.lead2.x - this.lead1.x
      const dy = this.lead2.y - this.lead1.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0) {
        const cdx = dx / len, cdy = dy / len
        ctx.save()
        ctx.transform(cdx, cdy, -cdy, cdx, this.lead1.x, this.lead1.y)
        ctx.drawImage(img, 0, -len / 2, len, len)
        this.drawHighlightOverlay(ctx, 0, -len / 2, len, len)
        ctx.restore()
      }
    }

    this.curcount += this.current * dc.currentMult
    this.drawDots(dc, this.point1, this.lead1, this.curcount)
    this.drawDots(dc, this.point2, this.lead2, -this.curcount)
    this.drawPosts(dc)
    this.drawPortSizeLabels(dc)
  }

  getInfo(arr: string[]): void {
    arr[0] = 'PRV'
    this.getBasicInfo(arr)
    arr[3] = `Pout = ${this.volts[1].toFixed(1)} PSI`
    arr[4] = `set point = ${this.setPoint} PSI`
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────
  getEditInfo(n: number): EditInfo | null {
    if (n === 0) return { name: 'Set Point (PSI)', value: this.setPoint }
    return null
  }

  setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.setPoint = ei.value
  }

  dumpXml(attrs: Record<string, string>): void {
    super.dumpXml(attrs)
    attrs['sp'] = String(this.setPoint)
  }

  undumpXml(elem: Element): void {
    super.undumpXml(elem)
    this.setPoint = dbl(elem, 'sp', this.setPoint)
  }

  static fromXml(elem: Element): PRVElm {
    const x = elem.getAttribute('x')!.split(' ').map(Number)
    const elm = new PRVElm(x[0], x[1], x[2], x[3])
    elm.undumpXml(elem)
    elm.setPoints()
    return elm
  }
}
