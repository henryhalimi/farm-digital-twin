import { type DrawContext } from './CircuitElm'
import { PumpElm } from './PumpElm'
import { getImage, isReady } from './ImageLoader'

/**
 * Booster pump — same stamp/nonlinear logic as PumpElm but drawn with
 * pump-icon.svg as a square centered on the body.
 */
export class BoosterPumpElm extends PumpElm {
  constructor(x: number, y: number, x2?: number, y2?: number, flags = 0) {
    super(x, y, x2, y2, flags)
  }

  getXmlDumpType(): string { return 'bp' }

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

    const img = getImage('/pump-icon.svg', onLoad)
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
  }

  getInfo(arr: string[]): void {
    arr[0] = 'booster pump'
    this.getBasicInfo(arr)
    arr[3] = this.position === 0 ? `shutoff = ${this.shutoffHead} PSI` : 'off'
  }

  static fromXml(elem: Element): BoosterPumpElm {
    const x = elem.getAttribute('x')!.split(' ').map(Number)
    const elm = new BoosterPumpElm(x[0], x[1], x[2], x[3])
    elm.undumpXml(elem)
    elm.setPoints()
    return elm
  }
}
