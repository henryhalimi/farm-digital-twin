import { CircuitElm, type DrawContext, type Simulator, type CPoint, type EditInfo, int } from './CircuitElm'
import { getImage, isReady } from './ImageLoader'

export class ManifoldElm extends CircuitElm {
  outputCount = 2
  private outputPosts: CPoint[] = []
  private outputLeads: CPoint[] = []
  private outputCurrents: number[] = []
  private curcounts: number[] = []

  constructor(x: number, y: number, x2?: number, y2?: number, flags = 0) {
    super(x, y, x2, y2, flags)
    this._setupOutputs()
  }

  // Guard: CircuitElm constructor calls allocNodes() before our class fields are set.
  // We skip that first call; _setupOutputs() calls it again once outputCount is ready.
  allocNodes(): void {
    if (this.outputCount === undefined) return
    super.allocNodes()
  }

  private _setupOutputs(): void {
    this.outputCurrents = new Array(this.outputCount).fill(0)
    this.curcounts = new Array(this.outputCount).fill(0)
    this.allocNodes()
  }

  getXmlDumpType(): string { return 'mn' }
  getFixedLength(): number { return 90 }
  getPostCount(): number { return 1 + this.outputCount }
  getPost(n: number): CPoint { return n === 0 ? this.point1 : this.outputPosts[n - 1] }

  private _getHalfSize(): number {
    return Math.max(24, Math.floor((this.outputCount - 1) * 16 / 2 + 8))
  }

  setPoints(): void {
    super.setPoints()
    const hs = this._getHalfSize()
    this.calcLeads(2 * hs)
    this.outputPosts = []
    this.outputLeads = []
    const spacing = 16
    const totalSpan = (this.outputCount - 1) * spacing
    const f2 = this.dn > 0 ? (this.dn + 16) / (2 * this.dn) : 0.6
    for (let i = 0; i < this.outputCount; i++) {
      const offset = -totalSpan / 2 + i * spacing
      this.outputPosts.push(this.interpPoint(this.point1, this.point2, 1, offset))
      this.outputLeads.push(this.interpPoint(this.point1, this.point2, f2, offset))
    }
  }

  stamp(sim: Simulator): void {
    for (let i = 0; i < this.outputCount; i++)
      sim.stampResistor(this.nodes[0], this.nodes[i + 1], 1e-2)
  }

  calculateCurrent(): void {
    for (let i = 0; i < this.outputCount; i++)
      this.outputCurrents[i] = (this.volts[0] - this.volts[i + 1]) / 1e-2
    this.current = this.outputCurrents.reduce((s, c) => s + c, 0)
  }

  draw(dc: DrawContext, onLoad?: () => void): void {
    const { ctx, scale } = dc
    const lw = 3 / scale

    ctx.save()
    ctx.lineWidth = lw
    ctx.lineCap = 'round'

    // Input lead: point1 → lead1
    ctx.strokeStyle = this.voltageColor(0)
    ctx.beginPath(); ctx.moveTo(this.point1.x, this.point1.y); ctx.lineTo(this.lead1.x, this.lead1.y); ctx.stroke()

    // Output leads: outputPosts → outputLeads
    for (let i = 0; i < this.outputCount; i++) {
      const op = this.outputPosts[i]
      const ol = this.outputLeads[i]
      ctx.strokeStyle = this.voltageColor(i + 1)
      ctx.beginPath(); ctx.moveTo(op.x, op.y); ctx.lineTo(ol.x, ol.y); ctx.stroke()
    }
    ctx.restore()

    // Flow dots
    const inputCurrent = this.outputCurrents.reduce((s, c) => s + c, 0)
    this.curcount += inputCurrent * dc.currentMult
    this.drawDots(dc, this.point1, this.lead1, this.curcount)
    for (let i = 0; i < this.outputCount; i++) {
      this.curcounts[i] += this.outputCurrents[i] * dc.currentMult
      this.drawDots(dc, this.outputLeads[i], this.outputPosts[i], this.curcounts[i])
    }

    // Manifold image — square centered between leads
    const img = getImage('/manifold-icon.svg', onLoad)
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

    this.drawPosts(dc)
    this.drawPortSizeLabels(dc)
  }

  getInfo(arr: string[]): void {
    arr[0] = 'manifold'
    arr[1] = 'Flow in = ' + CircuitElm.getCurrentDText(this.current)
    arr[2] = `${this.outputCount} outputs`
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────
  getEditInfo(n: number): EditInfo | null {
    if (n === 0) return { name: 'Outputs', value: this.outputCount, dimensionless: true }
    return null
  }

  setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      const oldCount = this.outputCount
      const oldPosts = this.outputPosts.map(p => ({ ...p }))
      this.outputCount = Math.max(2, Math.round(ei.value))
      this._setupOutputs()
      this.setPoints()
      // Store old post positions so MapView can move connected pipes
      if (this.outputCount !== oldCount) {
        ;(this as any)._oldOutputPosts = oldPosts
        ;(this as any)._newOutputPosts = this.outputPosts.map(p => ({ ...p }))
      }
    }
  }

  dumpXml(attrs: Record<string, string>): void {
    super.dumpXml(attrs)
    attrs['oc'] = String(this.outputCount)
  }

  undumpXml(elem: Element): void {
    super.undumpXml(elem)
    this.outputCount = Math.max(2, int(elem, 'oc', this.outputCount))
    this._setupOutputs()
  }

  static fromXml(elem: Element): ManifoldElm {
    const x = elem.getAttribute('x')!.split(' ').map(Number)
    const elm = new ManifoldElm(x[0], x[1], x[2], x[3])
    elm.undumpXml(elem)
    elm.setPoints()
    return elm
  }
}
