import { CircuitElm, type CPoint, type Simulator } from './CircuitElm'

// ── RowInfo ──────────────────────────────────────────────────────────────────
const ROW_NORMAL = 0
const ROW_CONST  = 1

class RowInfo {
  type = ROW_NORMAL
  mapCol = 0
  mapRow = 0
  value = 0
  rsChanges = false  // row's right side changes in doStep()
  lsChanges = false  // row's left side changes in doStep()
  dropRow = false    // row can be dropped from the simplified matrix
}

// ── Circuit graph nodes ───────────────────────────────────────────────────────
interface CircuitNodeLink {
  num: number         // which post/internal index on the element
  elm: CircuitElm
}

interface CircuitNode {
  internal: boolean
  links: CircuitNodeLink[]
}

function makeNode(internal = false): CircuitNode {
  return { internal, links: [] }
}

// ── NodeMapEntry ──────────────────────────────────────────────────────────────
class NodeMapEntry {
  node: number
  constructor(n = -1) { this.node = n }
}

// ── SimulationManager ─────────────────────────────────────────────────────────
export class SimulationManager implements Simulator {
  private elmList: CircuitElm[] = []
  private nodeList: CircuitNode[] = []
  private voltageSources: CircuitElm[] = []

  private circuitMatrix: number[][] = []
  private circuitRightSide: number[] = []
  private origMatrix: number[][] = []
  private origRightSide: number[] = []
  private lastNodeVoltages: number[] = []
  private nodeVoltages: number[] = []
  private circuitRowInfo: RowInfo[] = []
  private circuitPermute: number[] = []

  private circuitNonLinear = false
  private voltageSourceCount = 0
  private circuitMatrixSize = 0
  private circuitMatrixFullSize = 0
  private circuitNeedsMap = false
  private elmArr: CircuitElm[] = []

  // Simulator interface state
  converged = true
  subIterations = 0
  timeStep = 0.05   // seconds per simulation step (used by CapacitorElm etc.)

  private nodeMap = new Map<string, NodeMapEntry>()
  private unconnectedNodes: number[] = []

  private stopMessage: string | null = null

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Call this whenever elements are added/removed/changed. */
  setElements(elements: CircuitElm[]): void {
    this.elmList = [...elements]
    this.stopMessage = null

  }

  getStopMessage(): string | null { return this.stopMessage }

  /** Analyze and stamp the circuit. Returns false on error. */
  analyzeAndStamp(): boolean {
    if (this.elmList.length === 0) return false
    for (let i = 0; i < 10; i++) {
      if (this._preStamp()) break
      if (this.stopMessage) return false
    }
    if (this.stopMessage) return false
    this._stampCircuit()
    return this.circuitMatrix !== null && this.circuitMatrix.length > 0
  }

  /**
   * Run one simulation frame. Call analyzeAndStamp() first.
   * Returns true if the frame completed without errors.
   */
  runFrame(): boolean {
    if (!this.circuitMatrix || this.circuitMatrix.length === 0) return false
    if (this.elmList.length === 0) return false

    const elmArr = this.elmArr
    const size = this.circuitMatrixSize

    for (const elm of elmArr) elm.startIteration?.()

    const subiterCount = 5000
    let subiter = 0
    for (; subiter < subiterCount; subiter++) {
      this.converged = true
      this.subIterations = subiter

      // restore rhs (and matrix for nonlinear)
      for (let i = 0; i < size; i++)
        this.circuitRightSide[i] = this.origRightSide[i]
      if (this.circuitNonLinear) {
        for (let i = 0; i < size; i++)
          for (let j = 0; j < size; j++)
            this.circuitMatrix[i][j] = this.origMatrix[i][j]
      }

      for (const elm of elmArr) elm.doStep(this)
      if (this.stopMessage) return false

      if (this.circuitNonLinear) {
        if (this.converged && subiter > 0) break
        if (!lu_factor(this.circuitMatrix, size, this.circuitPermute)) {
          this._stop('Singular matrix!')
          return false
        }
      }

      lu_solve(this.circuitMatrix, size, this.circuitPermute, this.circuitRightSide)
      this._applySolvedRightSide(this.circuitRightSide)
      if (!this.circuitNonLinear) break
    }

    if (subiter === subiterCount) {
      this._stop('Convergence failed!')
      return false
    }

    for (const elm of elmArr) elm.stepFinished?.()
    for (let i = 0; i < this.lastNodeVoltages.length; i++)
      this.lastNodeVoltages[i] = this.nodeVoltages[i]
    return true
  }

  // ── Simulator interface (called by elements during stamp/doStep) ─────────────

  stampNonLinear(node: number): void {
    if (node > 0) this.circuitRowInfo[node - 1].lsChanges = true
  }

  stampVoltageSource(n1: number, n2: number, vs: number, v: number): void {
    const vn = this.nodeList.length + vs
    this._stampMatrix(vn, n1, -1)
    this._stampMatrix(vn, n2,  1)
    this._stampRightSideVal(vn, v)
    this._stampMatrix(n1, vn,  1)
    this._stampMatrix(n2, vn, -1)
  }

  // Like stampVoltageSource but marks right-side as dynamic (value set via updateVoltageSource)
  stampVoltageSourceDynamic(n1: number, n2: number, vs: number): void {
    const vn = this.nodeList.length + vs
    this._stampMatrix(vn, n1, -1)
    this._stampMatrix(vn, n2,  1)
    this._stampMatrix(n1, vn,  1)
    this._stampMatrix(n2, vn, -1)
    this._markRsChanges(vn)
  }

  // Update the right-side value for a previously stamped dynamic voltage source
  updateVoltageSource(_n1: number, _n2: number, vs: number, v: number): void {
    const vn = this.nodeList.length + vs
    this._stampRightSideVal(vn, v)
  }

  stampResistor(n1: number, n2: number, r: number): void {
    const r0 = 1 / r
    if (!isFinite(r0) || isNaN(r0)) { console.warn('bad resistance', r); return }
    this._stampMatrix(n1, n1,  r0)
    this._stampMatrix(n2, n2,  r0)
    this._stampMatrix(n1, n2, -r0)
    this._stampMatrix(n2, n1, -r0)
  }

  stampVCCurrentSource(cn1: number, cn2: number, vn1: number, vn2: number, g: number): void {
    this._stampMatrix(cn1, vn1,  g)
    this._stampMatrix(cn2, vn2,  g)
    this._stampMatrix(cn1, vn2, -g)
    this._stampMatrix(cn2, vn1, -g)
  }

  stampCurrentSource(n1: number, n2: number, i: number): void {
    this._stampRightSideVal(n1, -i)
    this._stampRightSideVal(n2,  i)
  }

  stampRightSide(n: number): void {
    this._markRsChanges(n)
  }

  // ── Private — pre-stamp ───────────────────────────────────────────────────

  private _preStamp(): boolean {
    this.nodeList = []
    this.nodeMap = new Map()
    this.unconnectedNodes = []

    this._setGroundNode()
    this._makeNodeList()

    // assign voltage sources
    let vscount = 0
    this.circuitNonLinear = false
    this.voltageSources = []
    for (const ce of this.elmList) {
      if (ce.nonLinear()) this.circuitNonLinear = true
      const ivs = ce.getVoltageSourceCount()
      for (let j = 0; j < ivs; j++) {
        this.voltageSources.push(ce)
        ce.setVoltageSource(j, vscount++)
      }
    }
    this.voltageSourceCount = vscount

    this._findUnconnectedNodes()
    return true
  }

  private _ptKey(p: CPoint): string { return `${p.x},${p.y}` }

  private _setGroundNode(): void {
    // Always allocate node 0 as ground
    this.nodeList.push(makeNode())
  }

  private _makeNodeList(): void {
    for (const ce of this.elmList) {
      const posts   = ce.getPostCount()
      const inodes  = ce.getInternalNodeCount()

      for (let j = 0; j < posts; j++) {
        const pt  = ce.getPost(j)
        const key = this._ptKey(pt)
        let cln = this.nodeMap.get(key)

        if (!cln || cln.node === -1) {
          const cn: CircuitNode = makeNode()
          const cnl: CircuitNodeLink = { num: j, elm: ce }
          cn.links.push(cnl)
          ce.setNode(j, this.nodeList.length)
          if (cln) cln.node = this.nodeList.length
          else this.nodeMap.set(key, new NodeMapEntry(this.nodeList.length))
          this.nodeList.push(cn)
        } else {
          const n = cln.node
          const cnl: CircuitNodeLink = { num: j, elm: ce }
          this.nodeList[n].links.push(cnl)
          ce.setNode(j, n)
          if (n === 0) ce.setNodeVoltage(j, 0)
        }
      }

      for (let j = 0; j < inodes; j++) {
        const cn: CircuitNode = makeNode(true)
        const cnl: CircuitNodeLink = { num: j + posts, elm: ce }
        cn.links.push(cnl)
        ce.setNode(j + posts, this.nodeList.length)
        this.nodeList.push(cn)
      }
    }
  }

  private _findUnconnectedNodes(): void {
    const closure = new Array<boolean>(this.nodeList.length).fill(false)
    closure[0] = true
    let changed = true
    this.unconnectedNodes = []

    while (changed) {
      changed = false
      for (const ce of this.elmList) {
        for (let j = 0; j < ce.getPostCount(); j++) {
          if (!closure[ce.nodes[j]]) {
            if (ce.hasGroundConnection?.(j)) {
              closure[ce.nodes[j]] = changed = true
            }
            continue
          }
          for (let k = 0; k < ce.getPostCount(); k++) {
            if (j === k) continue
            const kn = ce.nodes[k]
            if (!closure[kn]) {
              closure[kn] = true
              changed = true
            }
          }
        }
      }
      if (changed) continue

      // connect one unconnected node to ground
      for (let i = 0; i < this.nodeList.length; i++) {
        if (!closure[i] && !this.nodeList[i].internal) {
          this.unconnectedNodes.push(i)
          closure[i] = true
          changed = true
          break
        }
      }
    }
  }

  // ── Private — stamp ────────────────────────────────────────────────────────

  private _stampCircuit(): void {
    const matrixSize = this.nodeList.length - 1 + this.voltageSourceCount
    this.circuitMatrix     = Array.from({ length: matrixSize }, () => new Array<number>(matrixSize).fill(0))
    this.circuitRightSide  = new Array<number>(matrixSize).fill(0)
    this.nodeVoltages      = new Array<number>(this.nodeList.length - 1).fill(0)
    if (this.lastNodeVoltages.length !== this.nodeVoltages.length)
      this.lastNodeVoltages = new Array<number>(this.nodeList.length - 1).fill(0)
    this.origMatrix    = Array.from({ length: matrixSize }, () => new Array<number>(matrixSize).fill(0))
    this.origRightSide = new Array<number>(matrixSize).fill(0)
    this.circuitMatrixSize = this.circuitMatrixFullSize = matrixSize
    this.circuitRowInfo = Array.from({ length: matrixSize }, () => new RowInfo())
    this.circuitPermute = new Array<number>(matrixSize).fill(0)
    this.circuitNeedsMap = false

    // connect unconnected nodes to ground with a big resistor
    for (const n of this.unconnectedNodes) this.stampResistor(0, n, 1e8)

    // stamp small leak resistor on single-link nodes
    for (let i = 1; i < this.nodeList.length; i++) {
      const cn = this.nodeList[i]
      if (cn && !cn.internal && cn.links.length === 1)
        this.stampResistor(i, 0, 1)
    }

    // stamp all elements
    for (const ce of this.elmList) ce.stamp(this)

    if (!this._simplifyMatrix(matrixSize)) return
    if (!this.circuitMatrix || this.circuitMatrix.length === 0) return

    // for linear circuits, factor once
    if (!this.circuitNonLinear) {
      if (!lu_factor(this.circuitMatrix, this.circuitMatrixSize, this.circuitPermute)) {
        this._stop('Singular matrix!')
        return
      }
    }

    this.elmArr = [...this.elmList]

  }

  private _simplifyMatrix(matrixSize: number): boolean {
    for (let i = 0; i < matrixSize; i++) {
      const re = this.circuitRowInfo[i]
      if (re.lsChanges || re.dropRow || re.rsChanges) continue

      let qp = -1
      let qv = 0
      let rsadd = 0

      // scan row; break early if more than one nonzero non-const entry
      let j = 0
      for (; j < matrixSize; j++) {
        const q = this.circuitMatrix[i][j]
        if (this.circuitRowInfo[j].type === ROW_CONST) {
          rsadd -= this.circuitRowInfo[j].value * q
          continue
        }
        if (q === 0) continue
        if (qp === -1) { qp = j; qv = q; continue }
        // more than one nonzero non-const → can't simplify this row
        break
      }

      // j === matrixSize means we completed without break — row has at most one nonzero
      if (j === matrixSize) {
        if (qp === -1) {
          this._stop('Matrix error')
          return false
        }
        const elt = this.circuitRowInfo[qp]
        if (elt.type !== ROW_NORMAL) continue
        elt.type = ROW_CONST
        elt.value = (this.circuitRightSide[i] + rsadd) / qv
        this.circuitRowInfo[i].dropRow = true
        // find first earlier row referencing this column; restart scan before it
        let k = 0
        for (; k < i; k++)
          if (this.circuitMatrix[k][qp] !== 0) break
        i = k - 1
      }
    }

    // assign column mappings
    let nn = 0
    for (let i = 0; i < matrixSize; i++) {
      const elt = this.circuitRowInfo[i]
      if (elt.type === ROW_NORMAL) { elt.mapCol = nn++; continue }
      if (elt.type === ROW_CONST) elt.mapCol = -1
    }

    // build reduced matrix
    const newsize = nn
    const newmatx: number[][] = Array.from({ length: newsize }, () => new Array<number>(newsize).fill(0))
    const newrs: number[]     = new Array<number>(newsize).fill(0)

    let ii = 0
    for (let i = 0; i < matrixSize; i++) {
      const rri = this.circuitRowInfo[i]
      if (rri.dropRow) { rri.mapRow = -1; continue }
      newrs[ii] = this.circuitRightSide[i]
      rri.mapRow = ii
      for (let j = 0; j < matrixSize; j++) {
        const ri = this.circuitRowInfo[j]
        if (ri.type === ROW_CONST)
          newrs[ii] -= ri.value * this.circuitMatrix[i][j]
        else
          newmatx[ii][ri.mapCol] += this.circuitMatrix[i][j]
      }
      ii++
    }

    this.circuitMatrix    = newmatx
    this.circuitRightSide = newrs
    this.circuitMatrixSize = newsize
    for (let i = 0; i < newsize; i++) this.origRightSide[i] = newrs[i]
    for (let i = 0; i < newsize; i++)
      for (let j = 0; j < newsize; j++)
        this.origMatrix[i][j] = newmatx[i][j]
    this.circuitNeedsMap = true
    return true
  }

  // ── Private — matrix stamping primitives ───────────────────────────────────

  private _stampMatrix(i: number, j: number, x: number): void {
    if (i > 0 && j > 0) {
      if (this.circuitNeedsMap) {
        i = this.circuitRowInfo[i - 1].mapRow
        const ri = this.circuitRowInfo[j - 1]
        if (ri.type === ROW_CONST) {
          this.circuitRightSide[i] -= x * ri.value
          return
        }
        j = ri.mapCol
      } else {
        i--; j--
      }
      this.circuitMatrix[i][j] += x
    }
  }

  private _stampRightSideVal(i: number, x: number): void {
    if (i > 0) {
      if (this.circuitNeedsMap) {
        i = this.circuitRowInfo[i - 1].mapRow
      } else {
        i--
      }
      this.circuitRightSide[i] += x
    }
  }

  // Mark that rhs of row i changes in doStep() — for stamp() time only
  private _markRsChanges(i: number): void {
    if (i > 0) this.circuitRowInfo[i - 1].rsChanges = true
  }

  // ── Private — solution distribution ───────────────────────────────────────

  private _applySolvedRightSide(rs: number[]): void {
    for (let j = 0; j < this.circuitMatrixFullSize; j++) {
      const ri = this.circuitRowInfo[j]
      let res: number
      if (ri.type === ROW_CONST) res = ri.value
      else res = rs[ri.mapCol]
      if (isNaN(res)) { this.converged = false; break }
      if (j < this.nodeList.length - 1) {
        this.nodeVoltages[j] = res
      } else {
        const ji = j - (this.nodeList.length - 1)
        this.voltageSources[ji].setCurrent(ji, res)
      }
    }
    this._setNodeVoltages(this.nodeVoltages)
  }

  private _setNodeVoltages(nv: number[]): void {
    for (let j = 0; j < nv.length; j++) {
      const res = nv[j]
      const cn = this.nodeList[j + 1]
      for (const cnl of cn.links) {
        cnl.elm.setNodeVoltage(cnl.num, res)
      }
    }
  }

  // ── Private — error ────────────────────────────────────────────────────────

  private _stop(msg: string): void {
    this.stopMessage = msg
    this.circuitMatrix = []
    console.error('SimulationManager:', msg)
  }
}

// ── LU decomposition (Crout's method) ─────────────────────────────────────────

function lu_factor(a: number[][], n: number, ipvt: number[]): boolean {
  // check for all-zero rows (singular)
  for (let i = 0; i < n; i++) {
    let rowAllZeros = true
    for (let j = 0; j < n; j++) {
      if (a[i][j] !== 0) { rowAllZeros = false; break }
    }
    if (rowAllZeros) return false
  }

  for (let j = 0; j < n; j++) {
    // upper triangular
    for (let i = 0; i < j; i++) {
      let q = a[i][j]
      for (let k = 0; k < i; k++) q -= a[i][k] * a[k][j]
      a[i][j] = q
    }

    // lower triangular + pivot tracking
    let largest = 0
    let largestRow = -1
    for (let i = j; i < n; i++) {
      let q = a[i][j]
      for (let k = 0; k < j; k++) q -= a[i][k] * a[k][j]
      a[i][j] = q
      const x = Math.abs(q)
      if (x >= largest) { largest = x; largestRow = i }
    }

    // pivot
    if (j !== largestRow) {
      if (largestRow === -1) return false
      for (let k = 0; k < n; k++) {
        const x = a[largestRow][k]
        a[largestRow][k] = a[j][k]
        a[j][k] = x
      }
    }
    ipvt[j] = largestRow

    if (a[j][j] === 0) return false

    if (j !== n - 1) {
      const mult = 1.0 / a[j][j]
      for (let i = j + 1; i < n; i++) a[i][j] *= mult
    }
  }
  return true
}

function lu_solve(a: number[][], n: number, ipvt: number[], b: number[]): void {
  let bi = 0

  // forward substitution with pivoting
  for (let i = 0; i < n; i++) {
    const row = ipvt[i]
    const swap = b[row]
    b[row] = b[i]
    b[i] = swap
    if (swap !== 0) { bi = i; i++; break }
  }
  for (let i = bi + 1; i < n; i++) {
    const row = ipvt[i]
    let tot = b[row]
    b[row] = b[i]
    for (let j = bi; j < i; j++) tot -= a[i][j] * b[j]
    b[i] = tot
  }

  // back substitution
  for (let i = n - 1; i >= 0; i--) {
    let tot = b[i]
    for (let j = i + 1; j < n; j++) tot -= a[i][j] * b[j]
    b[i] = tot / a[i][i]
  }
}
