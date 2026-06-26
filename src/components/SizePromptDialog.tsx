import { useState } from 'react'
import { PIPE_SIZE_CODES, PIPE_SIZE_CODE_LIST } from '../sim/DeviceFingerprint'
import './SizePromptDialog.css'

interface SizePromptDialogProps {
  labelA: string
  sizeA: string   // 'x' = unresolved
  labelB: string
  sizeB: string   // 'x' = unresolved
  onResolve: (sizeCode: string) => void
  onCancel: () => void
}

export function SizePromptDialog({ labelA, sizeA, labelB, sizeB, onResolve, onCancel }: SizePromptDialogProps) {
  const isMismatch    = sizeA !== 'x' && sizeB !== 'x' && sizeA !== sizeB
  const oneSideKnown  = (sizeA !== 'x') !== (sizeB !== 'x')   // exactly one side assigned
  const knownSize     = sizeA !== 'x' ? sizeA : sizeB
  const knownLabel    = sizeA !== 'x' ? labelA : labelB
  const unknownLabel  = sizeA !== 'x' ? labelB : labelA

  const [selected, setSelected] = useState(oneSideKnown ? knownSize : '')

  // One side already has a size — just confirm it extends to the other side
  if (oneSideKnown && !isMismatch) {
    return (
      <div className="size-prompt-overlay">
        <div className="size-prompt-dialog">
          <div className="spd-header">Confirm Connection Size</div>
          <div className="spd-body">
            <p className="spd-message">
              <strong>{knownLabel}</strong> is <strong>{PIPE_SIZE_CODES[knownSize]}</strong>.
              <br />
              <strong>{unknownLabel}</strong> will connect at the same size.
            </p>
          </div>
          <div className="spd-footer">
            <button onClick={onCancel}>Cancel</button>
            <button className="primary" onClick={() => onResolve(knownSize)}>
              Connect at {PIPE_SIZE_CODES[knownSize]}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Mismatch — two different known sizes
  if (isMismatch) {
    return (
      <div className="size-prompt-overlay">
        <div className="size-prompt-dialog">
          <div className="spd-header">⚠ Size Mismatch</div>
          <div className="spd-body">
            <p className="spd-message">
              <strong>{labelA}</strong> is <strong>{PIPE_SIZE_CODES[sizeA]}</strong> but{' '}
              <strong>{labelB}</strong> is <strong>{PIPE_SIZE_CODES[sizeB]}</strong>.
              <br /><br />
              These cannot connect directly. Cancel and add a 2-port Manifold between them to adapt sizes.
            </p>
          </div>
          <div className="spd-footer">
            <button className="primary" onClick={onCancel}>Cancel connection</button>
          </div>
        </div>
      </div>
    )
  }

  // Both unresolved — ask user to pick a size
  return (
    <div className="size-prompt-overlay">
      <div className="size-prompt-dialog">
        <div className="spd-header">Assign Connection Size</div>
        <div className="spd-body">
          <p className="spd-message">
            Assign a pipe size for the connection between{' '}
            <strong>{labelA}</strong> and <strong>{labelB}</strong>.
          </p>
          <div className="spd-field">
            <label>Pipe size</label>
            <select value={selected} onChange={e => setSelected(e.target.value)}>
              <option value="">— select —</option>
              {PIPE_SIZE_CODE_LIST.map(code => (
                <option key={code} value={code}>
                  {code} — {PIPE_SIZE_CODES[code]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="spd-footer">
          <button onClick={onCancel}>Cancel connection</button>
          <button
            className="primary"
            onClick={() => selected && onResolve(selected)}
            disabled={!selected}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
