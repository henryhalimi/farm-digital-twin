import { useRef, useState, useCallback } from 'react'
import type { CircuitElm } from '../sim/CircuitElm'
import { saveCircuit, loadCircuit } from '../sim/CircuitSerializer'

const MAX_UNDO = 50

export function useUndoRedo() {
  const undoStack = useRef<string[]>([])
  const redoStack = useRef<string[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const pushUndo = useCallback((elements: CircuitElm[]) => {
    undoStack.current.push(saveCircuit(elements))
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift()
    redoStack.current = []
    setCanUndo(true)
    setCanRedo(false)
  }, [])

  const undo = useCallback((current: CircuitElm[]): CircuitElm[] | null => {
    const xml = undoStack.current.pop()
    if (!xml) return null
    redoStack.current.push(saveCircuit(current))
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(true)
    return loadCircuit(xml).elements
  }, [])

  const redo = useCallback((current: CircuitElm[]): CircuitElm[] | null => {
    const xml = redoStack.current.pop()
    if (!xml) return null
    undoStack.current.push(saveCircuit(current))
    setCanUndo(true)
    setCanRedo(redoStack.current.length > 0)
    return loadCircuit(xml).elements
  }, [])

  return { pushUndo, undo, redo, canUndo, canRedo }
}
