import { useEffect } from 'react'
import './ValidationToast.css'

interface ValidationToastProps {
  warnings: { rule: number; message: string }[]
  onClose: () => void
}

export function ValidationToast({ warnings, onClose }: ValidationToastProps) {
  // Auto-dismiss after 6 seconds
  useEffect(() => {
    const t = setTimeout(onClose, 6000)
    return () => clearTimeout(t)
  }, [onClose, warnings])

  if (warnings.length === 0) return null

  return (
    <div className="validation-toast">
      {warnings.map((w, i) => (
        <div key={i} className="validation-toast-item">
          <span className="validation-toast-rule">Rule {w.rule}</span>
          <span className="validation-toast-msg">{w.message}</span>
        </div>
      ))}
      <button className="validation-toast-close" onClick={onClose}>✕</button>
    </div>
  )
}
