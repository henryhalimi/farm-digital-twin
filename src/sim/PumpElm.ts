import { CircuitElm, type DrawContext, type Simulator, type EditInfo, dbl, int } from './CircuitElm'
import { getImage, isReady } from './ImageLoader'

const PUMP_TYPES = ['Fixed Duty', 'VFD', 'External Control'] as const

export class PumpElm extends CircuitElm {
  position = 0           // 0 = on, 1 = off
  shutoffHead = 100      // PSI
  pumpCurveCoeff = 0.001
  pumpType = 0           // 0=Fixed Duty, 1=VFD, 2=External Control
  private voltage = 0

  constructor(x: number, y: number, x2?: number, y2?: number, flags = 0) {
    super(x, y, x2, y2, flags)
  }

  getXmlDumpType(): string { return 'pu' }
  getFixedLength(): number { return 32 }
  getPostCount(): number { return 2 }
  getVoltageSourceCount(): number { return this.position === 0 ? 1 : 0 }
  nonLinear(): boolean { return true }
  isClickable(): boolean { return true }
  hasGroundConnection(_n: number): boolean { return true }

  toggle(): void { this.position = this.position === 0 ? 1 : 0 }

  setPoints(): void {
    super.setPoints()
    this.calcLeads(32)
  }

  stamp(sim: Simulator): void {
    if (this.position === 0)
      sim.stampVoltageSourceDynamic(this.nodes[0], this.nodes[1], this.voltSource)
    else
      sim.stampResistor(this.nodes[0], this.nodes[1], 1e8)
  }

  startIteration(): void {
    if (this.position === 1) { this.voltage = 0; return }
    this.voltage = this.shutoffHead - this.pumpCurveCoeff * this.current * this.current
    if (this.voltage < 0) this.voltage = 0
  }

  doStep(sim: Simulator): void {
    if (this.position === 0)
      sim.updateVoltageSource(this.nodes[0], this.nodes[1], this.voltSource, this.voltage)
  }

  draw(dc: DrawContext, onLoad?: () => void): void {
    const { ctx, scale } = dc
    const lw = 3 / scale

    // Lead stubs
    ctx.save()
    ctx.lineWidth = lw
    ctx.lineCap = 'round'
    ctx.strokeStyle = this.voltageColor(0)
    ctx.beginPath(); ctx.moveTo(this.point1.x, this.point1.y); ctx.lineTo(this.lead1.x, this.lead1.y); ctx.stroke()
    ctx.strokeStyle = this.voltageColor(1)
    ctx.beginPath(); ctx.moveTo(this.point2.x, this.point2.y); ctx.lineTo(this.lead2.x, this.lead2.y); ctx.stroke()
    ctx.restore()

    // Pump image between leads
    const img = getImage('/Pump-Electrical.png', onLoad)
    if (isReady(img)) {
      const dx = this.lead2.x - this.lead1.x
      const dy = this.lead2.y - this.lead1.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0) {
        const hs = len / 2
        const cdx = dx / len, cdy = dy / len
        ctx.save()
        ctx.transform(cdx, cdy, -cdy, cdx, this.lead1.x, this.lead1.y)
        ctx.drawImage(img, 0, -hs, len, 2 * hs)
        if (this.position === 1) {
          ctx.globalCompositeOperation = 'source-atop'
          ctx.fillStyle = 'rgba(0, 80, 255, 0.4)'
          ctx.fillRect(0, -hs, len, 2 * hs)
        }
        this.drawHighlightOverlay(ctx, 0, -hs, len, 2 * hs)
        ctx.restore()
      }
    }

    // Pump type label below the image (in rotated lead-to-lead space)
    {
      const dx = this.lead2.x - this.lead1.x
      const dy = this.lead2.y - this.lead1.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0) {
        const hs = len / 2
        const cdx = dx / len, cdy = dy / len
        const fontSize = 10
        ctx.save()
        ctx.transform(cdx, cdy, -cdy, cdx, this.lead1.x, this.lead1.y)
        ctx.fillStyle = 'white'
        ctx.font = `bold ${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(this.pumpTypeString(), len / 2, hs + 2 / scale)
        ctx.restore()
      }
    }

    this.curcount += this.current * dc.currentMult
    this.drawDots(dc, this.point1, this.lead1, this.curcount)
    this.drawDots(dc, this.point2, this.lead2, -this.curcount)
    this.drawPosts(dc)
  }

  pumpTypeString(): string { return PUMP_TYPES[this.pumpType] ?? PUMP_TYPES[0] }

  getInfo(arr: string[]): void {
    arr[0] = `pump (${this.pumpTypeString()})`
    this.getBasicInfo(arr)
    arr[3] = this.position === 0 ? `shutoff = ${this.shutoffHead} PSI` : 'off'
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────
  getEditInfo(n: number): EditInfo | null {
    if (n === 0) return { name: 'Shutoff Head (PSI)', value: this.shutoffHead }
    if (n === 1) return { name: 'Pump Curve Coefficient', value: this.pumpCurveCoeff, dimensionless: true }
    if (n === 2) return {
      name: 'Pump Type', value: 0,
      choice: { options: [...PUMP_TYPES], selected: this.pumpType },
    }
    return null
  }

  setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.shutoffHead = ei.value
    if (n === 1) this.pumpCurveCoeff = ei.value
    if (n === 2 && ei.choice) this.pumpType = ei.choice.selected
  }

  dumpXml(attrs: Record<string, string>): void {
    super.dumpXml(attrs)
    attrs['sh']  = String(this.shutoffHead)
    attrs['pcc'] = String(this.pumpCurveCoeff)
    if (this.position !== 0) attrs['p'] = String(this.position)
    if (this.pumpType !== 0) attrs['pt'] = String(this.pumpType)
  }

  undumpXml(elem: Element): void {
    super.undumpXml(elem)
    this.shutoffHead    = dbl(elem, 'sh',  this.shutoffHead)
    this.pumpCurveCoeff = dbl(elem, 'pcc', this.pumpCurveCoeff)
    this.position       = int(elem, 'p',   this.position)
    this.pumpType       = int(elem, 'pt',  this.pumpType)
  }

  static fromXml(elem: Element): PumpElm {
    const x = elem.getAttribute('x')!.split(' ').map(Number)
    const elm = new PumpElm(x[0], x[1], x[2], x[3])
    elm.undumpXml(elem)
    elm.setPoints()
    return elm
  }
}
