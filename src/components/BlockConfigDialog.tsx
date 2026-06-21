import { useState, useEffect } from 'react'
import type { CircuitElm } from '../sim/CircuitElm'
import {
  type BlockData,
  type IrrigationType,
  IRRIGATION_TYPES,
  CROP_TYPES,
  calcBlockMetrics,
  defaultBlockData,
} from '../sim/BlockData'
import './BlockConfigDialog.css'

// ── Tab definitions ───────────────────────────────────────────────────────────
type Tab = 'block' | 'config' | 'history' | 'schedule'

const TABS: { id: Tab; label: string }[] = [
  { id: 'block',    label: 'Block'    },
  { id: 'config',   label: 'Config'   },
  { id: 'history',  label: 'History'  },
  { id: 'schedule', label: 'Schedule' },
]

// ── Props ─────────────────────────────────────────────────────────────────────
interface BlockConfigDialogProps {
  elm: CircuitElm
  onApply: (elm: CircuitElm, block: BlockData) => void
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────
export function BlockConfigDialog({ elm, onApply, onClose }: BlockConfigDialogProps) {

  const [activeTab, setActiveTab] = useState<Tab>('block')

  // Initialise block data from element or defaults
  const [block, setBlock] = useState<BlockData>(() => {
    return (elm as any)._blockData ?? defaultBlockData()
  })

  // Sync if elm changes
  useEffect(() => {
    setBlock((elm as any)._blockData ?? defaultBlockData())
  }, [elm])

  // ── Field helpers ─────────────────────────────────────────────────────────
  function setField<K extends keyof BlockData>(key: K, value: BlockData[K]) {
    setBlock(prev => ({ ...prev, [key]: value }))
  }

  // ── Calculated metrics ────────────────────────────────────────────────────
  const metrics = calcBlockMetrics(block)

  // ── Canvas label preview text ─────────────────────────────────────────────
  const previewId   = block.blockId   || '—'
  const previewName = block.blockName || 'Unnamed Block'
  const previewCrop = block.cropType  || ''

  // ── Apply ─────────────────────────────────────────────────────────────────
  function handleApply() {
    ;(elm as any)._blockData = { ...block }
    onApply(elm, block)
    onClose()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="block-config-overlay" onMouseDown={onClose}>
      <div className="block-config-dialog" onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bcd-header">
          <span className="bcd-title">
            {block.blockId ? `Block ${block.blockId}` : 'New Block'}
            {block.blockName ? ` — ${block.blockName}` : ''}
          </span>
          <span className="bcd-valve-id">Lumo Valve</span>
        </div>

        {/* Tabs */}
        <div className="bcd-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`bcd-tab${activeTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bcd-body">

          {/* ── Block tab ───────────────────────────────────────────────── */}
          {activeTab === 'block' && (
            <>
              {/* Canvas label preview */}
              <div className="bcd-label-preview">
                <div className="bcd-label-preview-id">Block {previewId}</div>
                <div className="bcd-label-preview-name">{previewName}</div>
                {previewCrop && (
                  <div className="bcd-label-preview-crop">{previewCrop}</div>
                )}
              </div>

              {/* Identity fields */}
              <div>
                <div className="bcd-section-label">Identity</div>
                <div className="bcd-field">
                  <label>Block ID</label>
                  <input
                    type="text"
                    placeholder="e.g. 4 or A"
                    value={block.blockId}
                    onChange={e => setField('blockId', e.target.value)}
                  />
                </div>
                <div className="bcd-field">
                  <label>Block name</label>
                  <input
                    type="text"
                    placeholder="e.g. North Cabernet"
                    value={block.blockName}
                    onChange={e => setField('blockName', e.target.value)}
                  />
                </div>
                <div className="bcd-field">
                  <label>Crop type</label>
                  <select
                    value={block.cropType}
                    onChange={e => setField('cropType', e.target.value)}
                  >
                    <option value="">— select —</option>
                    {CROP_TYPES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="bcd-field">
                  <label>Area (acres)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={block.areAcres || ''}
                    onChange={e => setField('areAcres', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="bcd-field">
                  <label>Plant count</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={block.plantCount || ''}
                    onChange={e => setField('plantCount', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>

              {/* Irrigation fields */}
              <div>
                <div className="bcd-section-label">Irrigation</div>
                <div className="bcd-field">
                  <label>Type</label>
                  <select
                    value={block.irrigationType}
                    onChange={e => setField('irrigationType', e.target.value as IrrigationType)}
                  >
                    {Object.entries(IRRIGATION_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Emitter fields — drip and microspray only */}
                {(block.irrigationType === 'drip' || block.irrigationType === 'microspray') && (
                  <>
                    <div className="bcd-field">
                      <label>Emitter count</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={block.emitterCount || ''}
                        onChange={e => setField('emitterCount', parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div className="bcd-field">
                      <label>Emitter rating (GPH)</label>
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={block.emitterRating}
                        onChange={e => setField('emitterRating', parseFloat(e.target.value) || 0.1)}
                      />
                    </div>
                  </>
                )}

                {/* Sprinkler — emitter count only, no rating */}
                {block.irrigationType === 'sprinkler' && (
                  <div className="bcd-field">
                    <label>Sprinkler count</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={block.emitterCount || ''}
                      onChange={e => setField('emitterCount', parseInt(e.target.value) || 0)}
                    />
                  </div>
                )}

                <div className="bcd-field">
                  <label>Operating PSI</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={block.operatingPSI}
                    onChange={e => setField('operatingPSI', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              {/* Calculated */}
              {block.plantCount > 0 && block.emitterCount > 0 && (
                <div>
                  <div className="bcd-section-label">Calculated</div>
                  <div className="bcd-field">
                    <label>Emitters per plant</label>
                    <span className="bcd-calculated">{metrics.emittersPerPlant}</span>
                  </div>
                  {(block.irrigationType === 'drip' || block.irrigationType === 'microspray') && (
                    <>
                      <div className="bcd-field">
                        <label>Total flow</label>
                        <span className="bcd-calculated">{metrics.totalGPH} GPH</span>
                      </div>
                      <div className="bcd-field">
                        <label></label>
                        <span className="bcd-calculated">{metrics.totalGPM} GPM</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Config tab — technical valve config ─────────────────────── */}
          {activeTab === 'config' && (
            <div className="bcd-placeholder">
              Technical valve configuration.<br />
              Open-resistance, port sizes, etc.<br />
              <br />
              (Handled in Device Config dialog)
            </div>
          )}

          {/* ── History tab — parking lot item 12 ───────────────────────── */}
          {activeTab === 'history' && (
            <div className="bcd-placeholder">
              Historic usage data for this block.<br />
              Flow history, anomalies, maintenance.<br />
              <br />
              Andy AI integration — coming soon.
            </div>
          )}

          {/* ── Schedule tab — parking lot item 9 ───────────────────────── */}
          {activeTab === 'schedule' && (
            <div className="bcd-placeholder">
              Schedule irrigation for this block.<br />
              Gals per plant, time window.<br />
              <br />
              Scheduling dialog — coming soon.
            </div>
          )}

        </div>{/* end bcd-body */}

        {/* Footer */}
        <div className="bcd-footer">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleApply}>Apply</button>
        </div>

      </div>
    </div>
  )
}
