import { type DrawContext } from './CircuitElm'
import { ValveElm } from './ValveElm'
import { getImage, isReady } from './ImageLoader'
import type { BlockData } from './BlockData'

/**
 * Lumo smart valve — same stamp/toggle logic as ValveElm but drawn with
 * valve-icon.svg as a square centered on the body (higher default resistance).
 */
export class LumoValveElm extends ValveElm {
  // Block data attached to this valve
  _blockData?: BlockData

  constructor(x: number, y: number, x2?: number, y2?: number, flags = 0) {
    super(x, y, x2, y2, flags)
    this.openResistance = 1  // higher resistance than generic valve
  }

  getXmlDumpType(): string { return 'lv' }

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

    const img = getImage('/valve-icon.svg', onLoad)
    if (isReady(img)) {
      const dx = this.lead2.x - this.lead1.x
      const dy = this.lead2.y - this.lead1.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0) {
        const cdx = dx / len, cdy = dy / len
        ctx.save()
        ctx.transform(cdx, cdy, -cdy, cdx, this.lead1.x, this.lead1.y)
        ctx.drawImage(img, 0, -len / 2, len, len)
        if (this.position === 1) {
          ctx.globalCompositeOperation = 'source-atop'
          ctx.fillStyle = 'rgba(0, 80, 255, 0.4)'
          ctx.fillRect(0, -len / 2, len, len)
        }
        this.drawHighlightOverlay(ctx, 0, -len / 2, len, len)
        ctx.restore()
      }
    }

    this.curcount += this.current * dc.currentMult
    this.drawDots(dc, this.point1, this.lead1, this.curcount)
    this.drawDots(dc, this.point2, this.lead2, -this.curcount)
    this.drawPosts(dc)
    this.drawPortSizeLabels(dc)

    // ── Draw block label above valve ──────────────────────────────────────
    this.drawBlockLabel(ctx, scale)
  }

  private drawBlockLabel(ctx: CanvasRenderingContext2D, scale: number): void {
    const block = this._blockData
    if (!block?.blockId && !block?.blockName) return

    // Center of the element
    const cx = (this.point1.x + this.point2.x) / 2
    const cy = (this.point1.y + this.point2.y) / 2

    // Offset above the valve — perpendicular to element direction
    const dx = this.point2.x - this.point1.x
    const dy = this.point2.y - this.point1.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    // perpendicular unit vector
    const px = -dy / len
    const py =  dx / len
    const offset = Math.max(len * 0.8, 30)
    const lx = cx + px * offset
    const ly = cy + py * offset

    ctx.save()

    // Scale font to canvas
    const baseFontSize = Math.max(10 / scale, 4)

    // ── Block ID — large and bold ─────────────────────────────────────────
    if (block.blockId) {
      ctx.font = `bold ${baseFontSize * 1.4}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'

      // Background pill
      const idText = `Block ${block.blockId}`
      const tw = ctx.measureText(idText).width
      const th = baseFontSize * 1.4
      const pad = th * 0.3
      ctx.fillStyle = 'rgba(0, 40, 0, 0.75)'
      ctx.beginPath()
      ctx.roundRect(lx - tw / 2 - pad, ly - th - pad, tw + pad * 2, th + pad * 2, pad)
      ctx.fill()

      ctx.fillStyle = '#88ff88'
      ctx.fillText(idText, lx, ly)
    }

    // ── Block name — smaller below ID ─────────────────────────────────────
    if (block.blockName) {
      ctx.font = `${baseFontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#aaccaa'
      ctx.fillText(block.blockName, lx, ly + baseFontSize * 0.2)
    }

    ctx.restore()
  }

  getInfo(arr: string[]): void {
    arr[0] = 'Lumo valve'
    this.getBasicInfo(arr)
    arr[3] = this.position === 0 ? 'open' : 'closed'
  }

  static fromXml(elem: Element): LumoValveElm {
    const x = elem.getAttribute('x')!.split(' ').map(Number)
    const elm = new LumoValveElm(x[0], x[1], x[2], x[3])
    elm.undumpXml(elem)
    elm.setPoints()
    return elm
  }
}
