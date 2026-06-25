import { useState } from 'react'
import { PIPE_SIZE_CODES, PIPE_SIZE_CODE_LIST } from '../sim/DeviceFingerprint'
import './SizePromptDialog.css'

interface SizePromptDialogProps {
  /** Label for device A */
  labelA: string
  /** Current size code of device A port ('x' = unresolved) */
  sizeA: string
  /** Label for device B */
  labelB: string
  /** Current size code of device B port ('x' = unresolved) */
  sizeB: string
  /** Called with resolved size when user confirms */
  onResolve: (sizeCode: string) => void
  /** Called when user cancels — connection should be removed */
  onCancel: () => void
}

export function SizePromptDialog({ labelA, sizeA, labelB, sizeB, onResolve, onCancel }: SizePromptDialogProps) {
  const isMismatch = sizeA !== 'x' && sizeB !== 'x' && sizeA !== sizeB
  const defaultSize = sizeA !== 'x' ? sizeA : sizeB !== 'x' ? sizeB : ''
  const [selected, setSelected] = useState(defaultSize)

  return (
    <div className="size-prompt-overlay">
      <div className="size-prompt-dialog">
        <div className="spd-header">
          {isMismatch ? '⚠ Size Mismatch' : 'Assign Port Size'}
        </div>
        <div className="spd-body">
          {isMismatch ? (
            <p className="spd-message">
              <strong>{labelA}</strong> is {PIPE_SIZE_CODES[sizeA]} but <strong>{labelB}</strong> is {PIPE_SIZE_CODES[sizeB]}.
              <br />
              They cannot connect directly. Add a 2-port Manifold to adapt sizes, or assign a common size here.
            </p>
          ) : (
            <p className="spd-message">
              Assign a pipe size for the connection between <strong>{labelA}</strong> and <strong>{labelB}</strong>.
            </p>
          )}

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
