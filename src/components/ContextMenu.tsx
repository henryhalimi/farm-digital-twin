import { useEffect, useRef } from 'react'
import './ContextMenu.css'

interface ContextMenuProps {
  x: number
  y: number
  onEdit: () => void
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onDelete: () => void
  onClose: () => void
  canPaste: boolean
}

export function ContextMenu({ x, y, onEdit, onCut, onCopy, onPaste, onDelete, onClose, canPaste }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="context-menu" style={{ left: x, top: y }}>
      <button className="context-menu-item" onClick={onEdit}>Edit...</button>
      <div className="context-menu-separator" />
      <button className="context-menu-item" onClick={onCut}>Cut</button>
      <button className="context-menu-item" onClick={onCopy}>Copy</button>
      <button className="context-menu-item" onClick={onPaste} disabled={!canPaste}>Paste</button>
      <button className="context-menu-item" onClick={onDelete}>Delete</button>
    </div>
  )
}
