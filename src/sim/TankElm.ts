import { type DrawContext, type EditInfo } from './CircuitElm'
import { CapacitorElm } from './CapacitorElm'
import { getImage, isReady } from './ImageLoader'

export class TankElm extends CapacitorElm {
  constructor(x: number, y: number, x2?: number, y2?: number, flags = 0) {
    super(x, y, x2, y2, flags)
    this.capacitance = 1.0  // gal/PSI default
  }

  getXmlDumpType(): string { return 'tk' }
  getFixedLength(): number { return 32 }

  setPoints(): void {
    super.setPoints()
    this.calcLeads(32)
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

    const img = getImage('/Tank.png', onLoad)
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
        this.drawHighlightOverlay(ctx, 0, -hs, len, 2 * hs)
        ctx.restore()
      }
    }

    this.curcount += this.current * dc.currentMult
    this.drawDots(dc, this.point1, this.lead1, this.curcount)
    this.drawDots(dc, this.point2, this.lead2, -this.curcount)
    this.drawPosts(dc)
  }

  getInfo(arr: string[]): void {
    arr[0] = 'tank'
    this.getBasicInfo(arr)
    arr[3] = `C = ${this.capacitance} gal/PSI`
    arr[4] = `Pd = ${(this.volts[0] - this.volts[1]).toFixed(2)} PSI`
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────
  getEditInfo(n: number): EditInfo | null {
    if (n === 0) return { name: 'Capacitance (gal/PSI)', value: this.capacitance }
    return null
  }

  setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.capacitance = ei.value
  }

  dumpXml(attrs: Record<string, string>): void {
    super.dumpXml(attrs)
  }

  undumpXml(elem: Element): void {
    super.undumpXml(elem)
  }

  static fromXml(elem: Element): TankElm {
    const x = elem.getAttribute('x')!.split(' ').map(Number)
    const elm = new TankElm(x[0], x[1], x[2], x[3])
    elm.undumpXml(elem)
    elm.setPoints()
    return elm
  }
}
