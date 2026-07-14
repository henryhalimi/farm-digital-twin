import { type DrawContext } from './CircuitElm'
import { ValveElm } from './ValveElm'
import { getImage, isReady } from './ImageLoader'
import type { BlockData } from './BlockData'
import { openValve, closeValve, getDeviceStatus } from './LumoApi'

// Poll interval in ms — check real valve state every 10 seconds
const POLL_INTERVAL = 10_000

export class LumoValveElm extends ValveElm {
  _blockData?: BlockData
  _apiError?: string
  _apiPending = false

  // Polling
  private _pollTimer?: ReturnType<typeof setTimeout>
  private _redrawCallback?: () => void  // set by MapView to trigger canvas redraw

  constructor(x: number, y: number, x2?: number, y2?: number, flags = 0) {
    super(x, y, x2, y2, flags)
    this.openResistance = 1
  }

  getXmlDumpType(): string { return 'lv' }

  // Called by MapView to give this element a way to trigger redraws
  setRedrawCallback(fn: () => void): void {
    this._redrawCallback = fn
    this.startPolling()
  }

  startPolling(): void {
    this.stopPolling()
    const deviceId = this._blockData?.deviceId
    if (!deviceId) return
    const poll = async () => {
      try {
        const status = await getDeviceStatus(deviceId)
        const shouldBeOpen = status.valveState === 'open'
        const isOpen = this.position === 1
        if (shouldBeOpen !== isOpen) {
          // Backend state differs from local — sync to backend
          this.position = shouldBeOpen ? 1 : 0
          this._redrawCallback?.()
        }
        this._apiError = undefined
      } catch (err) {
        // Silent — don't interrupt UX for poll failures
      }
      this._pollTimer = setTimeout(poll, POLL_INTERVAL)
    }
    // Start first poll after a short delay
    this._pollTimer = setTimeout(poll, 2000)
  }

  stopPolling(): void {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer)
      this._pollTimer = undefined
    }
  }

  // Toggle sends command to physical valve
  toggle(): void {
    const deviceId = this._blockData?.deviceId
    if (!deviceId) {
      super.toggle()
      return
    }

    super.toggle()
    this._apiPending = true
    this._apiError = undefined

    const command = this.position === 1
      ? openValve(deviceId)
      : closeValve(deviceId)

    command
      .then(() => { this._apiPending = false; this._redrawCallback?.() })
      .catch((err: Error) => {
        this._apiPending = false
        this._apiError = err.message
        super.toggle()  // revert on failure
        this._redrawCallback?.()
      })
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

    // ── API status indicator ──────────────────────────────────────────────
    if (this._apiPending || this._apiError) {
      const cx = (this.lead1.x + this.lead2.x) / 2
      const cy = (this.lead1.y + this.lead2.y) / 2
      const r = 4 / scale
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = this._apiError ? '#ff4444' : '#ffaa00'
      ctx.fill()
      ctx.restore()
    }

    this.drawBlockLabel(ctx, scale)
  }

  private drawBlockLabel(ctx: CanvasRenderingContext2D, scale: number): void {
    const block = this._blockData
    if (!block?.blockId && !block?.blockName) return

    const cx = (this.point1.x + this.point2.x) / 2
    const cy = (this.point1.y + this.point2.y) / 2
    const dx = this.point2.x - this.point1.x
    const dy = this.point2.y - this.point1.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const px = -dy / len, py = dx / len
    const offset = Math.max(len * 0.8, 30)
    const lx = cx + px * offset
    const ly = cy + py * offset

    ctx.save()
    const baseFontSize = Math.max(10 / scale, 4)

    if (block.blockId) {
      ctx.font = `bold ${baseFontSize * 1.4}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
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
    if (this._blockData?.deviceId) arr[4] = `device: ${this._blockData.deviceId.slice(0, 8)}...`
  }

  static fromXml(elem: Element): LumoValveElm {
    const x = elem.getAttribute('x')!.split(' ').map(Number)
    const elm = new LumoValveElm(x[0], x[1], x[2], x[3])
    elm.undumpXml(elem)
    elm.setPoints()
    return elm
  }
}
