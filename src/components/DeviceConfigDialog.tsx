import { useState, useEffect, useCallback } from 'react'
import type { CircuitElm, EditInfo } from '../sim/CircuitElm'
import {
  DEVICE_TYPE_MAP,
  PIPE_SIZE_CODES,
  PIPE_SIZE_CODE_LIST,
  type PortDef,
} from '../sim/DeviceFingerprint'
import './DeviceConfigDialog.css'

// ── Map ElementRegistry id → DeviceFingerprint id ────────────────────────────
// Some elements share an id, e.g. LumoValveElm uses 'lumo-valve' which we
// resolve to 'lumo-valve-2' or 'lumo-valve-4' based on the element's port data.
function resolveDeviceTypeId(elm: CircuitElm): string {
  const tag = elm.getXmlDumpType()
  const tagMap: Record<string, string> = {
    pp:  'pipe',
    pu:  'pump',
    bp:  'booster-pump',
    tk:  'tank',
    vl:  'valve',
    lv:  'lumo-valve-2',   // default; dialog can switch to lumo-valve-4
    mn:  'manifold',
    fi:  'filter',
    prv: 'prv',
    sp:  'sprinkler',
    src: 'pump',           // Source treated as part of pump; kept for compat
  }
  return tagMap[tag] ?? tag
}

// ── Port size state per port (local dialog state) ─────────────────────────────
interface PortSizeEntry {
  portIndex: number
  label: string
  direction: string
  sizeCode: string   // 'x' = unresolved
  optional: boolean
  domain: string
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface DeviceConfigDialogProps {
  elm: CircuitElm
  /** Called with updated element after Apply */
  onApply: (elm: CircuitElm) => void
  onClose: () => void
}

// ── Pipe material options ─────────────────────────────────────────────────────
const PIPE_MATERIALS = ['Rigid PVC', 'Flex PVC', 'Metal']
const PIPE_MATERIAL_C: Record<string, number> = {
  'Rigid PVC': 150,
  'Flex PVC':  130,
  'Metal':     120,
}

// ── Hazen-Williams friction loss (PSI) ───────────────────────────────────────
function hwFrictionLoss(diamInches: number, lenFt: number, material: string): number {
  if (lenFt <= 0 || diamInches <= 0) return 0
  const C = PIPE_MATERIAL_C[material] ?? 150
  // Q = 0.442 * C * d^2.63 * (hL/L)^0.54  →  solve for hL at Q=1 GPM for reference
  // We display per-unit values; actual loss computed by solver. Show loss at 10 GPM.
  const Q = 10
  const hLperFt = Math.pow(Q / (0.442 * C * Math.pow(diamInches, 2.63)), 1 / 0.54)
  return hLperFt * lenFt / 2.31   // feet of head → PSI
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DeviceConfigDialog({ elm, onApply, onClose }: DeviceConfigDialogProps) {

  const deviceTypeId = resolveDeviceTypeId(elm)
  const typeDef = DEVICE_TYPE_MAP.get(deviceTypeId)

  // ── Analytical fields from getEditInfo ────────────────────────────────────
  const [fields, setFields] = useState<EditInfo[]>([])

  // ── Port size state ───────────────────────────────────────────────────────
  const [portEntries, setPortEntries] = useState<PortSizeEntry[]>([])

  // ── Manifold port count ───────────────────────────────────────────────────
  const [manifoldPortCount, setManifoldPortCount] = useState(3)

  // ── Pipe-specific state ───────────────────────────────────────────────────
  const [pipeMaterial, setPipeMaterial] = useState('Rigid PVC')

  // ── Tank elevation ────────────────────────────────────────────────────────
  const [tankElevation, setTankElevation] = useState(0)

  // ── Drip emitter fields ───────────────────────────────────────────────────
  const [dripEmitters, setDripEmitters] = useState(100)
  const [dripRating, setDripRating] = useState(0.5)   // GPH per emitter

  // ── Pressure sensor range ─────────────────────────────────────────────────
  const [psRangeMin, setPsRangeMin] = useState(0)
  const [psRangeMax, setPsRangeMax] = useState(100)

  // ── Pressure switch trigger ───────────────────────────────────────────────
  const [psTrigger, setPsTrigger] = useState(50)
  const [psTriggerOn, setPsTriggerOn] = useState<'rise' | 'fall'>('rise')

  // ── Filter ΔP alert ───────────────────────────────────────────────────────
  const [filterDeltaP, setFilterDeltaP] = useState(5)

  // ── Validation warning ────────────────────────────────────────────────────
  const [warning, setWarning] = useState<string | null>(null)

  // ── Initialise from element ───────────────────────────────────────────────
  useEffect(() => {
    // Collect analytical fields
    const f: EditInfo[] = []
    for (let i = 0; ; i++) {
      const ei = elm.getEditInfo(i)
      if (!ei) break
      f.push({ ...ei })
    }
    setFields(f)

    // Build port entries from fingerprint
    if (typeDef) {
      const ports = typeDef.fingerprint.ports
      // For manifold use current outputCount from element fields
      let portList = ports
      if (deviceTypeId === 'manifold') {
        const oc = f[0]?.value ?? 2
        const total = 1 + Math.round(oc)
        portList = Array.from({ length: total }, (_, i) => {
          if (i === 0) return { domain: 'W', direction: 'I', sizeCode: 'x', label: `Port ${i + 1}`, optional: false } as PortDef
          return { domain: 'W', direction: 'O', sizeCode: 'x', label: `Port ${i + 1}`, optional: false } as PortDef
        })
        setManifoldPortCount(total)
      }
      setPortEntries(portList
        .filter(p => p.domain === 'W')
        .map((p, i) => ({
          portIndex: i,
          label: p.label,
          direction: p.direction,
          sizeCode: p.sizeCode === 'x' ? 'x' : p.sizeCode,
          optional: p.optional,
          domain: p.domain,
        }))
      )
    }
  }, [elm, typeDef, deviceTypeId])

  // ── Manifold port count change ────────────────────────────────────────────
  const handleManifoldPortCount = useCallback((count: number) => {
    setManifoldPortCount(count)
    setPortEntries(Array.from({ length: count }, (_, i) => ({
      portIndex: i,
      label: `Port ${i + 1}`,
      direction: i === 0 ? 'I' : 'O',
      sizeCode: portEntries[i]?.sizeCode ?? 'x',
      optional: false,
      domain: 'W',
    })))
  }, [portEntries])

  // ── Port direction change ─────────────────────────────────────────────────
  const handlePortDir = (idx: number, dir: string) => {
    setPortEntries(prev => prev.map((p, i) => i === idx ? { ...p, direction: dir } : p))
  }

  // ── Port size change ──────────────────────────────────────────────────────
  const handlePortSize = (idx: number, code: string) => {
    setPortEntries(prev => prev.map((p, i) => i === idx ? { ...p, sizeCode: code } : p))
  }

  // ── Analytical field changes ──────────────────────────────────────────────
  const handleFieldChange = (idx: number, raw: string) => {
    setFields(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], value: parseFloat(raw) || 0 }
      return next
    })
  }

  const handleSelectChange = (idx: number, selected: number) => {
    setFields(prev => {
      const next = [...prev]
      const choice = next[idx].choice
      if (choice) next[idx] = { ...next[idx], choice: { ...choice, selected } }
      return next
    })
  }

  // ── Validate before Apply ─────────────────────────────────────────────────
  const validate = useCallback((): string | null => {
    // Manifold: must have at least 1 I and 1 O  (Rule 7)
    if (deviceTypeId === 'manifold') {
      const hasInput  = portEntries.some(p => p.direction === 'I' || p.direction === 'B')
      const hasOutput = portEntries.some(p => p.direction === 'O' || p.direction === 'B')
      if (!hasInput)  return 'Manifold must have at least one Input port.'
      if (!hasOutput) return 'Manifold must have at least one Output port.'
    }
    // Tank: elevation must be >= 0
    if (deviceTypeId === 'tank' && tankElevation < 0) {
      return 'Tank elevation cannot be negative.'
    }
    // Pressure sensor: range min < max
    if (deviceTypeId === 'pressure-sensor' && psRangeMin >= psRangeMax) {
      return 'Pressure sensor range: min must be less than max.'
    }
    return null
  }, [deviceTypeId, portEntries, tankElevation, psRangeMin, psRangeMax])

  useEffect(() => {
    setWarning(validate())
  }, [validate])

  // ── Apply ─────────────────────────────────────────────────────────────────
  const handleApply = () => {
    const w = validate()
    if (w) { setWarning(w); return }

    // Apply analytical fields back to element
    for (let i = 0; i < fields.length; i++) {
      elm.setEditValue(i, fields[i])
    }

    // Store port size codes on element as custom attribute
    // (elements will persist these via dumpXml extensions)
    ;(elm as any)._portSizeCodes = portEntries.map(p => p.sizeCode)
    ;(elm as any)._portDirections = portEntries.map(p => p.direction)

    // Device-specific extras
    if (deviceTypeId === 'pipe') {
      ;(elm as any)._pipeMaterial = pipeMaterial
      // Update Hazen-Williams C on the pipe element
      ;(elm as any).hazenC = PIPE_MATERIAL_C[pipeMaterial] ?? 150
    }
    if (deviceTypeId === 'tank') {
      ;(elm as any)._elevation = tankElevation
    }
    if (deviceTypeId === 'drip') {
      ;(elm as any)._dripEmitters = dripEmitters
      ;(elm as any)._dripRating = dripRating
    }
    if (deviceTypeId === 'pressure-sensor') {
      ;(elm as any)._psRangeMin = psRangeMin
      ;(elm as any)._psRangeMax = psRangeMax
    }
    if (deviceTypeId === 'pressure-switch') {
      ;(elm as any)._psTrigger = psTrigger
      ;(elm as any)._psTriggerOn = psTriggerOn
    }
    if (deviceTypeId === 'filter') {
      ;(elm as any)._filterDeltaP = filterDeltaP
    }

    onApply(elm)
    onClose()
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const tankStaticHead = (tankElevation * 0.433).toFixed(1)
  const dripTotalGPH   = (dripEmitters * dripRating).toFixed(1)
  const dripTotalGPM   = (dripEmitters * dripRating / 60).toFixed(2)

  // Pipe friction loss preview (at 10 GPM reference)
  const pipeDiameter  = fields[0]?.value ?? 1.61
  const pipeLenFt     = ((elm as any).lengthMeters ?? 0) * 3.28084
  const pipeFriction  = hwFrictionLoss(pipeDiameter, pipeLenFt, pipeMaterial).toFixed(1)
  const pipeElevDiff  = (elm as any).elevDiff ?? 0
  const pipeElevPSI   = (pipeElevDiff * 3.28084 * 0.433).toFixed(1)

  // ── Title ─────────────────────────────────────────────────────────────────
  const info: string[] = new Array(4).fill('')
  elm.getInfo(info)
  const title = typeDef?.label ?? info[0] ?? 'Device'
  const fpCode = typeDef?.fingerprint.code ?? ''

  // ── Water ports only (exclude E/C for now) ────────────────────────────────
  const waterPorts = portEntries.filter(p => p.domain === 'W')

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="device-config-overlay" onMouseDown={onClose}>
      <div className="device-config-dialog" onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="dcd-header">
          <span className="dcd-title">{title}</span>
          <span className="dcd-fingerprint">{fpCode}</span>
        </div>

        <div className="dcd-body">

          {/* ── Manifold port count ─────────────────────────────────────── */}
          {deviceTypeId === 'manifold' && (
            <div>
              <div className="dcd-section-label">Configuration</div>
              <div className="dcd-port-count-row">
                <label>Number of ports</label>
                <select
                  value={manifoldPortCount}
                  onChange={e => handleManifoldPortCount(parseInt(e.target.value))}
                >
                  {[2, 3, 4, 5, 6].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ── Tank elevation ──────────────────────────────────────────── */}
          {deviceTypeId === 'tank' && (
            <div>
              <div className="dcd-section-label">Elevation</div>
              <div className="dcd-field">
                <label>Elevation above ground (ft)</label>
                <input
                  type="number"
                  value={tankElevation}
                  min={0}
                  step={1}
                  onChange={e => setTankElevation(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="dcd-field">
                <label>Static head</label>
                <span className="dcd-calculated">{tankStaticHead} PSI</span>
              </div>
            </div>
          )}

          {/* ── Pipe material ───────────────────────────────────────────── */}
          {deviceTypeId === 'pipe' && (
            <div>
              <div className="dcd-section-label">Material</div>
              <div className="dcd-field">
                <label>Material</label>
                <select
                  value={pipeMaterial}
                  onChange={e => setPipeMaterial(e.target.value)}
                >
                  {PIPE_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* ── Drip emitter fields ─────────────────────────────────────── */}
          {deviceTypeId === 'drip' && (
            <div>
              <div className="dcd-section-label">Emitters</div>
              <div className="dcd-field">
                <label>Number of emitters</label>
                <input
                  type="number"
                  value={dripEmitters}
                  min={1}
                  step={1}
                  onChange={e => setDripEmitters(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="dcd-field">
                <label>Emitter rating (GPH each)</label>
                <input
                  type="number"
                  value={dripRating}
                  min={0.1}
                  step={0.1}
                  onChange={e => setDripRating(parseFloat(e.target.value) || 0.1)}
                />
              </div>
              <div className="dcd-field">
                <label>Total demand</label>
                <span className="dcd-calculated">{dripTotalGPH} GPH / {dripTotalGPM} GPM</span>
              </div>
            </div>
          )}

          {/* ── Custom endpoint ─────────────────────────────────────────── */}
          {deviceTypeId === 'custom-endpoint' && (
            <div>
              <div className="dcd-section-label">Demand</div>
              {fields.slice(0, 1).map((ei, i) => (
                <div key={i} className="dcd-field">
                  <label>{ei.name}</label>
                  <input
                    type="number"
                    value={ei.value}
                    step="any"
                    onChange={e => handleFieldChange(i, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Pressure sensor range ───────────────────────────────────── */}
          {deviceTypeId === 'pressure-sensor' && (
            <div>
              <div className="dcd-section-label">Range</div>
              <div className="dcd-field">
                <label>Min (PSI)</label>
                <input
                  type="number"
                  value={psRangeMin}
                  step={1}
                  onChange={e => setPsRangeMin(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="dcd-field">
                <label>Max (PSI)</label>
                <input
                  type="number"
                  value={psRangeMax}
                  step={1}
                  onChange={e => setPsRangeMax(parseFloat(e.target.value) || 100)}
                />
              </div>
            </div>
          )}

          {/* ── Pressure switch trigger ─────────────────────────────────── */}
          {deviceTypeId === 'pressure-switch' && (
            <div>
              <div className="dcd-section-label">Trigger</div>
              <div className="dcd-field">
                <label>Trigger pressure (PSI)</label>
                <input
                  type="number"
                  value={psTrigger}
                  step={1}
                  onChange={e => setPsTrigger(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="dcd-field">
                <label>Trigger on</label>
                <select
                  value={psTriggerOn}
                  onChange={e => setPsTriggerOn(e.target.value as 'rise' | 'fall')}
                >
                  <option value="rise">Rising pressure</option>
                  <option value="fall">Falling pressure</option>
                </select>
              </div>
            </div>
          )}

          {/* ── Filter ΔP alert ─────────────────────────────────────────── */}
          {deviceTypeId === 'filter' && (
            <div>
              <div className="dcd-section-label">Alert</div>
              <div className="dcd-field">
                <label>ΔP alert threshold (PSI)</label>
                <input
                  type="number"
                  value={filterDeltaP}
                  min={0}
                  step={0.5}
                  onChange={e => setFilterDeltaP(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          )}

          {/* ── Analytical fields (from getEditInfo) ────────────────────── */}
          {fields.length > 0 && deviceTypeId !== 'custom-endpoint' && (
            <div>
              <div className="dcd-section-label">Properties</div>
              {fields.map((ei, i) => (
                <div key={i} className="dcd-field">
                  <label>{ei.name}</label>
                  {ei.choice ? (
                    <select
                      value={ei.choice.selected}
                      onChange={e => handleSelectChange(i, parseInt(e.target.value))}
                    >
                      {ei.choice.options.map((opt, j) => (
                        <option key={j} value={j}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      value={ei.value}
                      step="any"
                      onChange={e => handleFieldChange(i, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Pipe calculated losses ──────────────────────────────────── */}
          {deviceTypeId === 'pipe' && (
            <div>
              <div className="dcd-section-label">Calculated (at 10 GPM reference)</div>
              <div className="dcd-field">
                <label>Length</label>
                <span className="dcd-calculated">{pipeLenFt.toFixed(1)} ft</span>
              </div>
              <div className="dcd-field">
                <label>Elevation change</label>
                <span className="dcd-calculated">{(pipeElevDiff * 3.28084).toFixed(1)} ft</span>
              </div>
              <div className="dcd-field">
                <label>Friction loss</label>
                <span className="dcd-calculated">{pipeFriction} PSI</span>
              </div>
              <div className="dcd-field">
                <label>Elevation loss</label>
                <span className="dcd-calculated">{pipeElevPSI} PSI</span>
              </div>
            </div>
          )}

          {/* ── Water port sizes ────────────────────────────────────────── */}
          {waterPorts.length > 0 && (
            <div>
              <div className="dcd-section-label">Port Sizes</div>
              {waterPorts.map((p, i) => (
                <div key={i} className="dcd-port-row">
                  <span className="dcd-port-label">{p.label}</span>

                  {/* Direction — editable only for B ports on manifold */}
                  {deviceTypeId === 'manifold' ? (
                    <select
                      className="dcd-port-size-select"
                      style={{ width: 56 }}
                      value={p.direction}
                      onChange={e => handlePortDir(i, e.target.value)}
                    >
                      <option value="I">In</option>
                      <option value="O">Out</option>
                      <option value="B">Bi</option>
                    </select>
                  ) : (
                    <span className="dcd-port-dir">
                      {p.direction === 'I' ? 'In' : p.direction === 'O' ? 'Out' : 'Bi'}
                    </span>
                  )}

                  {/* Size selector */}
                  <select
                    className="dcd-port-size-select"
                    value={p.sizeCode}
                    onChange={e => handlePortSize(i, e.target.value)}
                  >
                    <option value="x">— select —</option>
                    {PIPE_SIZE_CODE_LIST.map(code => (
                      <option key={code} value={code}>
                        {code} — {PIPE_SIZE_CODES[code]}
                      </option>
                    ))}
                  </select>

                  {p.optional && <span className="dcd-port-optional">optional</span>}
                </div>
              ))}
            </div>
          )}

          {/* ── Warning ─────────────────────────────────────────────────── */}
          {warning && (
            <div className="dcd-warning">⚠ {warning}</div>
          )}

        </div>{/* end dcd-body */}

        {/* Footer */}
        <div className="dcd-footer">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={handleApply}
            disabled={!!warning}
          >
            Apply
          </button>
        </div>

      </div>
    </div>
  )
}
