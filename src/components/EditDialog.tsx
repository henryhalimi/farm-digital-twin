import { useState, useEffect } from 'react'
import type { CircuitElm, EditInfo } from '../sim/CircuitElm'
import './EditDialog.css'

interface EditDialogProps {
  elm: CircuitElm
  onClose: () => void
  onApply: () => void
}

export function EditDialog({ elm, onClose, onApply }: EditDialogProps) {
  // Collect all fields from getEditInfo
  const [fields, setFields] = useState<EditInfo[]>([])

  useEffect(() => {
    const f: EditInfo[] = []
    for (let i = 0; ; i++) {
      const ei = elm.getEditInfo(i)
      if (!ei) break
      f.push({ ...ei })
    }
    setFields(f)
  }, [elm])

  const handleChange = (idx: number, raw: string) => {
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

  const handleOk = () => {
    for (let i = 0; i < fields.length; i++) {
      elm.setEditValue(i, fields[i])
    }
    onApply()
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleOk()
    if (e.key === 'Escape') onClose()
  }

  // Get element type name from getInfo
  const info: string[] = new Array(10).fill(null)
  elm.getInfo(info)
  const title = info[0] || 'Element'

  return (
    <div className="edit-dialog-overlay" onMouseDown={onClose}>
      <div className="edit-dialog" onMouseDown={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <h3>Edit {title}</h3>
        {fields.map((ei, i) => (
          <div key={i} className="edit-dialog-field">
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
                autoFocus={i === 0}
                onChange={e => handleChange(i, e.target.value)}
              />
            )}
          </div>
        ))}
        <div className="edit-dialog-buttons">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleOk}>OK</button>
        </div>
      </div>
    </div>
  )
}
