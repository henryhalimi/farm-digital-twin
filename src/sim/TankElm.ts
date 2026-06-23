import { CircuitElm, type DrawContext, type Simulator, type EditInfo, dbl } from './CircuitElm'
import { getImage, isReady } from './ImageLoader'

export class TankElm extends CircuitElm {
  capacitance = 1.0       // gal/PSI
  elevationFt = 0         // feet above ground

  get staticHeadPSI(): number { return this.elevationFt * 0.433 }
  get isElevated(): boolean { return this.elevationFt > 0 }

  // Capacitor companion model state
  private compResistance = 0
  private voltdiff = 1e-3
  private curSourceValue = 0

  constructor(x: number, y: number, x2?: number, y2?: number, flags = 0) {
    super(x, y, x2, y2, flags)
  }

  getXmlDumpType(): string { return 'tk' }
  getFixedLength(): number { return 32 }
  getPostCount(): number { return 2 }
  getVoltageSourceCount(): number { return this.isElevated ? 1 : 0 }
  nonLinear(): boolean { return false }
  hasGroundConnection(_n: number): boolean { return this.isElevated }

  setPoints(): void {
    super.setPoints()
    this.calcLeads(32)
  }

  reset(): void {
    super.reset()
    this.current = this.curcount = this.curSourceValue = 0
    this.voltdiff = 1e-3
  }

  setNodeVoltage(n: number, v: number): void {
    this.volts[n] = v
  }

  stamp(sim: Simulator): void {
    if (this.isElevated) {
      // Elevated tank: acts as pressure source (voltage source)
      sim.stampVoltageSource(0, this.nodes[1], this.voltSource, this.staticHeadPSI)
    } else {
      // Ground tank: capacitor companion model
      this.compResistance = sim.timeStep / (2 * this.capacitance)
      sim.stampResistor(this.nodes[0], this.nodes[1], this.compResistance)
      sim.stampRightSide(this.nodes[0])
      sim.stampRightSide(this.nodes[1])
    }
  }

  startIteration(): void {
    if (!this.isElevated) {
      this.curSourceValue = -this.voltdiff / this.compResistance - this.current
    }
  }

  doStep(sim: Simulator): void {
    if (!this.isElevated) {
      sim.stampCurrentSource(this.nodes[0], this.nodes[1], this.curSourceValue)
    }
  }

  stepFinished(): void {
    if (!this.isElevated) {
      this.voltdiff = this.volts[0] - this.volts[1]
      if (this.compResistance > 0)
        this.current = (this.volts[0] - this.volts[1]) / this.compResistance + this.curSourceValue
    }
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

    // Elevation label
    if (this.elevationFt > 0) {
      const cx = (this.lead1.x + this.lead2.x) / 2
      const cy = (this.lead1.y + this.lead2.y) / 2
      const fontSize = Math.max(8 / scale, 3)
      ctx.save()
      ctx.font = `bold ${fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillStyle = '#88ff88'
      ctx.fillText(`${this.elevationFt}ft / ${this.staticHeadPSI.toFixed(1)}PSI`, cx, cy - 2 / scale)
      ctx.restore()
    }

    this.curcount += this.current * dc.currentMult
    this.drawDots(dc, this.point1, this.lead1, this.curcount)
    this.drawDots(dc, this.point2, this.lead2, -this.curcount)
    this.drawPosts(dc)
  }

  getInfo(arr: string[]): void {
    arr[0] = 'tank'
    this.getBasicInfo(arr)
    if (this.isElevated) {
      arr[3] = `elevation = ${this.elevationFt} ft`
      arr[4] = `head = ${this.staticHeadPSI.toFixed(1)} PSI`
    } else {
      arr[3] = `C = ${this.capacitance} gal/PSI`
      arr[4] = `Pd = ${(this.volts[0] - this.volts[1]).toFixed(2)} PSI`
    }
  }

  getEditInfo(n: number): EditInfo | null {
    if (n === 0) return { name: 'Elevation above ground (ft)', value: this.elevationFt }
    if (n === 1) return { name: 'Capacitance (gal/PSI)', value: this.capacitance }
    return null
  }

  setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.elevationFt = Math.max(0, ei.value)
    if (n === 1) this.capacitance = Math.max(0.001, ei.value)
  }

  dumpXml(attrs: Record<string, string>): void {
    super.dumpXml(attrs)
    attrs['el']  = String(this.elevationFt)
    attrs['cap'] = String(this.capacitance)
  }

  undumpXml(elem: Element): void {
    super.undumpXml(elem)
    this.elevationFt = dbl(elem, 'el',  0)
    this.capacitance = dbl(elem, 'cap', 1.0)
  }

  static fromXml(elem: Element): TankElm {
    const x = elem.getAttribute('x')!.split(' ').map(Number)
    const elm = new TankElm(x[0], x[1], x[2], x[3])
    elm.undumpXml(elem)
    elm.setPoints()
    return elm
  }
}
