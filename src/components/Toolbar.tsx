import { useState, useRef, useEffect } from 'react'
import { ELEMENT_TYPES, type ElementTypeDef } from '../sim/ElementRegistry'
import './Toolbar.css'

export type Tool = 'select' | 'draw' | 'pan'

interface ToolbarProps {
  activeTool: Tool
  onToolChange: (tool: Tool) => void
  activeElementType: ElementTypeDef
  onElementTypeChange: (type: ElementTypeDef) => void
  elementCount: number
  simRunning: boolean
  onSimRunningChange: (running: boolean) => void
}

function ElementIcon({ type, size = 28 }: { type: ElementTypeDef; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawKey, forceRedraw] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, size, size)
    type.drawIcon(ctx, size, size, () => forceRedraw(n => n + 1))
  }, [type, size, drawKey])

  return <canvas ref={canvasRef} style={{ width: size, height: size, display: 'block' }} />
}

export function Toolbar({
  activeTool, onToolChange,
  activeElementType, onElementTypeChange,
  elementCount,
  simRunning, onSimRunningChange,
}: ToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pickerOpen) return
    const handle = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setPickerOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [pickerOpen])

  const handleDrawClick = () => {
    onToolChange(activeTool === 'draw' ? 'select' : 'draw')
  }

  const handlePickerSelect = (type: ElementTypeDef) => {
    onElementTypeChange(type)
    onToolChange('draw')
    setPickerOpen(false)
  }

  return (
    <div className="toolbar">
      {/* Select tool */}
      <button
        className={`toolbar-btn ${activeTool === 'select' ? 'active' : ''}`}
        onClick={() => onToolChange('select')}
        title="Select (V)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3 1l10 6-5 1.5L6 14z" />
        </svg>
        Select
      </button>

      {/* Pan tool */}
      <button
        className={`toolbar-btn ${activeTool === 'pan' ? 'active' : ''}`}
        onClick={() => onToolChange('pan')}
        title="Pan (Space)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1v4M8 11v4M1 8h4M11 8h4M8 0a1 1 0 011 1v3a1 1 0 01-2 0V1a1 1 0 011-1zM8 11a1 1 0 011 1v3a1 1 0 01-2 0v-3a1 1 0 011-1zM0 8a1 1 0 011-1h3a1 1 0 010 2H1a1 1 0 01-1-1zM11 8a1 1 0 011-1h3a1 1 0 010 2h-3a1 1 0 01-1-1z" />
        </svg>
        Pan
      </button>

      {/* Draw tool — split button: left activates draw, right opens picker */}
      <div
        ref={pickerRef}
        className={`draw-split-btn ${activeTool === 'draw' ? 'active' : ''}`}
      >
        <button
          className="draw-split-main"
          onClick={handleDrawClick}
          title="Draw element"
        >
          <ElementIcon type={activeElementType} size={18} />
          <span>{activeElementType.label}</span>
        </button>
        <button
          className="draw-split-arrow"
          onClick={() => setPickerOpen(p => !p)}
          title="Choose element type"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M1 3l4 4 4-4z" />
          </svg>
        </button>

        {pickerOpen && (
          <div className="element-picker">
            {ELEMENT_TYPES.map(type => (
              <button
                key={type.id}
                className={`picker-item ${type.id === activeElementType.id ? 'selected' : ''}`}
                onClick={() => handlePickerSelect(type)}
              >
                <ElementIcon type={type} size={28} />
                <span>{type.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="toolbar-separator" />

      <button
        className={`toolbar-btn ${simRunning ? 'active' : ''}`}
        onClick={() => onSimRunningChange(!simRunning)}
        disabled={elementCount === 0}
        title={simRunning ? 'Stop simulation' : 'Run simulation'}
      >
        {simRunning ? 'Stop' : 'Run'}
      </button>

      <div className="toolbar-spacer" />

      <div className="toolbar-status">
        {elementCount > 0 && <span>{elementCount} element{elementCount !== 1 ? 's' : ''}</span>}
        <span className="toolbar-mode">
          {activeTool === 'draw'
            ? `✏️ Drawing ${activeElementType.label} — click and drag`
            : activeTool === 'pan'
            ? '🖱 Pan mode'
            : '🔲 Select mode'}
        </span>
      </div>
    </div>
  )
}
