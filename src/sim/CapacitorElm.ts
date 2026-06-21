import { CircuitElm, type DrawContext, type Simulator, dbl } from './CircuitElm'

/**
 * Companion-model capacitor using trapezoidal approximation.
 * In the irrigation domain: voltage=PSI, current=GPM, capacitance=gal/PSI.
 */
export class CapacitorElm extends CircuitElm {
  capacitance = 1.0        // gal/PSI
  protected compResistance = 0
  protected voltdiff = 1e-3  // initial charge to kick-start dynamics
  private curSourceValue = 0

  constructor(x: number, y: number, x2?: number, y2?: number, flags = 0) {
    super(x, y, x2, y2, flags)
  }

  getXmlDumpType(): string { return 'cap' }

  reset(): void {
    super.reset()
    this.current = this.curcount = this.curSourceValue = 0
    this.voltdiff = 1e-3
  }

  // Override: don't call calculateCurrent during setNodeVoltage (it must wait for stepFinished)
  setNodeVoltage(n: number, v: number): void {
    this.volts[n] = v
  }

  stamp(sim: Simulator): void {
    // Trapezoidal companion model: conductance = 2C/dt
    this.compResistance = sim.timeStep / (2 * this.capacitance)
    sim.stampResistor(this.nodes[0], this.nodes[1], this.compResistance)
    sim.stampRightSide(this.nodes[0])
    sim.stampRightSide(this.nodes[1])
  }

  startIteration(): void {
    this.curSourceValue = -this.voltdiff / this.compResistance - this.current
  }

  doStep(sim: Simulator): void {
    sim.stampCurrentSource(this.nodes[0], this.nodes[1], this.curSourceValue)
  }

  stepFinished(): void {
    this.voltdiff = this.volts[0] - this.volts[1]
    this.calculateCurrent()
  }

  calculateCurrent(): void {
    if (this.compResistance > 0)
      this.current = (this.volts[0] - this.volts[1]) / this.compResistance + this.curSourceValue
  }

  // Default draw — subclasses override
  draw(dc: DrawContext, _onLoad?: () => void): void {
    const { ctx, scale } = dc
    ctx.save()
    ctx.lineWidth = 3 / scale
    ctx.lineCap = 'round'
    ctx.strokeStyle = this.voltageColor(0)
    ctx.beginPath(); ctx.moveTo(this.point1.x, this.point1.y); ctx.lineTo(this.point2.x, this.point2.y); ctx.stroke()
    ctx.restore()
    this.drawPosts(dc)
  }

  getInfo(arr: string[]): void {
    arr[0] = 'capacitor'
    this.getBasicInfo(arr)
    arr[3] = `C = ${this.capacitance} gal/PSI`
  }

  dumpXml(attrs: Record<string, string>): void {
    super.dumpXml(attrs)
    attrs['c'] = String(this.capacitance)
  }

  undumpXml(elem: Element): void {
    super.undumpXml(elem)
    this.capacitance = dbl(elem, 'c', this.capacitance)
  }

  static fromXml(elem: Element): CapacitorElm {
    const x = elem.getAttribute('x')!.split(' ').map(Number)
    const elm = new CapacitorElm(x[0], x[1], x[2], x[3])
    elm.undumpXml(elem)
    elm.setPoints()
    return elm
  }
}
