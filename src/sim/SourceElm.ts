import { CircuitElm, type DrawContext, type Simulator, type CPoint, type EditInfo, dbl } from './CircuitElm'
import { getImage, isReady } from './ImageLoader'

const IMG_SRC = '/source-icon.svg'
const IMG_SIZE = 20  // circuit units (matches GWT imgSize)

export class SourceElm extends CircuitElm {
  pressure = 60  // PSI

  constructor(x: number, y: number, x2?: number, y2?: number, flags = 0) {
    super(x, y, x2, y2, flags)
  }

  getDumpType(): number { return 503 }
  getXmlDumpType(): string { return 'src' }
  getFixedLength(): number { return 32 }
  getPostCount(): number { return 1 }
  getVoltageSourceCount(): number { return 1 }

  // The single post is at point2 (the far/connection end)
  getPost(_n: number): CPoint { return this.point2 }

  stamp(sim: Simulator): void {
    sim.stampVoltageSource(0, this.nodes[0], this.voltSource, this.pressure)
  }

  reset(): void {
    super.reset()
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

    // Icon at point1 (the base/tail)
    const img = getImage(IMG_SRC, onLoad)
    if (isReady(img)) {
      const aspect = img.naturalWidth / img.naturalHeight
      const drawW = IMG_SIZE * aspect
      const drawH = IMG_SIZE
      ctx.drawImage(img, this.point1.x - drawW / 2, this.point1.y - drawH, drawW, drawH)
      this.drawHighlightOverlay(ctx, this.point1.x - drawW / 2, this.point1.y - drawH, drawW, drawH)
    }

    ctx.restore()

    this.curcount += this.current * dc.currentMult
    this.drawDots(dc, this.point1, this.point2, this.curcount)
    this.drawPosts(dc)
  }

  getInfo(arr: string[]): void {
    arr[0] = 'source'
    arr[1] = CircuitElm.getCurrentText(this.getCurrent())
    arr[2] = CircuitElm.getVoltageText(this.pressure)
  }

  hasGroundConnection(_n: number): boolean { return true }
  getCurrentIntoNode(_n: number): number { return -this.current }

  // ── Edit ─────────────────────────────────────────────────────────────────────
  getEditInfo(n: number): EditInfo | null {
    if (n === 0) return { name: 'Pressure (PSI)', value: this.pressure }
    return null
  }

  setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.pressure = ei.value
  }

  // ── XML serialisation ───────────────────────────────────────────────────────
  dumpXml(attrs: Record<string, string>): void {
    super.dumpXml(attrs)
    attrs['pr'] = String(this.pressure)
  }

  undumpXml(elem: Element): void {
    super.undumpXml(elem)
    this.pressure = dbl(elem, 'pr', this.pressure)
  }

  static fromXml(elem: Element): SourceElm {
    const x = elem.getAttribute('x')!.split(' ').map(Number)
    const elm = new SourceElm(x[0], x[1], x[2], x[3])
    elm.undumpXml(elem)
    elm.setPoints()
    return elm
  }
}
