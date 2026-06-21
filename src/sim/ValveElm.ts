import { CircuitElm, type DrawContext, type Simulator, type EditInfo, dbl, int } from './CircuitElm'
import { getImage, isReady } from './ImageLoader'

export class ValveElm extends CircuitElm {
  position = 0          // 0 = open, 1 = closed
  openResistance = 0.01 // ohms (PSI·min/gal)

  constructor(x: number, y: number, x2?: number, y2?: number, flags = 0) {
    super(x, y, x2, y2, flags)
  }

  getXmlDumpType(): string { return 'vl' }
  getFixedLength(): number { return 32 }
  getPostCount(): number { return 2 }
  nonLinear(): boolean { return false }
  isClickable(): boolean { return true }

  toggle(): void { this.position = this.position === 0 ? 1 : 0 }

  setPoints(): void {
    super.setPoints()
    this.calcLeads(32)
  }

  stamp(sim: Simulator): void {
    const r = this.position === 0 ? this.openResistance : 1e8
    sim.stampResistor(this.nodes[0], this.nodes[1], r)
  }

  calculateCurrent(): void {
    const r = this.position === 0 ? this.openResistance : 1e8
    this.current = (this.volts[0] - this.volts[1]) / r
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

    // Valve image between leads — preserve aspect ratio
    const img = getImage('/valve.png', onLoad)
    if (isReady(img)) {
      const dx = this.lead2.x - this.lead1.x
      const dy = this.lead2.y - this.lead1.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0 && img.naturalWidth > 0) {
        const aspect = img.naturalHeight / img.naturalWidth
        const imgH = len * aspect
        const cdx = dx / len, cdy = dy / len
        ctx.save()
        ctx.transform(cdx, cdy, -cdy, cdx, this.lead1.x, this.lead1.y)
        ctx.drawImage(img, 0, -imgH / 2, len, imgH)
        if (this.position === 1) {
          ctx.globalCompositeOperation = 'source-atop'
          ctx.fillStyle = 'rgba(0, 80, 255, 0.4)'
          ctx.fillRect(0, -imgH / 2, len, imgH)
        }
        this.drawHighlightOverlay(ctx, 0, -imgH / 2, len, imgH)
        ctx.restore()
      }
    }

    this.curcount += this.current * dc.currentMult
    this.drawDots(dc, this.point1, this.lead1, this.curcount)
    this.drawDots(dc, this.point2, this.lead2, -this.curcount)
    this.drawPosts(dc)
  }

  getInfo(arr: string[]): void {
    arr[0] = 'valve'
    this.getBasicInfo(arr)
    arr[3] = this.position === 0
      ? `R = ${this.openResistance} PSI·min/gal`
      : 'closed'
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────
  getEditInfo(n: number): EditInfo | null {
    if (n === 0) return { name: 'Open Resistance', value: this.openResistance }
    return null
  }

  setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.openResistance = ei.value
  }

  dumpXml(attrs: Record<string, string>): void {
    super.dumpXml(attrs)
    attrs['or'] = String(this.openResistance)
    if (this.position !== 0) attrs['p'] = String(this.position)
  }

  undumpXml(elem: Element): void {
    super.undumpXml(elem)
    this.openResistance = dbl(elem, 'or', this.openResistance)
    this.position       = int(elem, 'p',  this.position)
  }

  static fromXml(elem: Element): ValveElm {
    const x = elem.getAttribute('x')!.split(' ').map(Number)
    const elm = new ValveElm(x[0], x[1], x[2], x[3])
    elm.undumpXml(elem)
    elm.setPoints()
    return elm
  }
}
