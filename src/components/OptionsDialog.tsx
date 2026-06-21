import { useState } from 'react'
import './EditDialog.css'

interface OptionsDialogProps {
  speed: number
  anchorLat: number
  anchorLng: number
  hasElements: boolean
  onApply: (speed: number, lat: number, lng: number) => void
  onClose: () => void
}

export function OptionsDialog({ speed, anchorLat, anchorLng, hasElements, onApply, onClose }: OptionsDialogProps) {
  const [spd, setSpd] = useState(String(speed))
  const [lat, setLat] = useState(String(anchorLat))
  const [lng, setLng] = useState(String(anchorLng))

  const handleOk = () => {
    onApply(parseFloat(spd) || speed, parseFloat(lat) || anchorLat, parseFloat(lng) || anchorLng)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleOk()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="edit-dialog-overlay" onMouseDown={onClose}>
      <div className="edit-dialog" onMouseDown={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <h3>Options</h3>
        <div className="edit-dialog-field">
          <label>Current Speed</label>
          <input type="number" value={spd} step="any" autoFocus onChange={e => setSpd(e.target.value)} />
        </div>
        <div className="edit-dialog-field">
          <label>Anchor Latitude</label>
          <input type="number" value={lat} step="any" disabled={hasElements} onChange={e => setLat(e.target.value)} />
        </div>
        <div className="edit-dialog-field">
          <label>Anchor Longitude</label>
          <input type="number" value={lng} step="any" disabled={hasElements} onChange={e => setLng(e.target.value)} />
        </div>
        <div className="edit-dialog-buttons">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleOk}>OK</button>
        </div>
      </div>
    </div>
  )
}
