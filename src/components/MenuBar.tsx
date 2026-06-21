import { useState, useRef, useEffect } from 'react'
import './MenuBar.css'

interface MenuItem {
  label: string
  shortcut?: string
  separator?: boolean
  disabled?: boolean
  onClick?: () => void
}

interface Menu {
  label: string
  items: MenuItem[]
}

interface MenuBarProps {
  onNewFile?: () => void
  onSave?: () => void
  onOpen?: () => void
  onCut?: () => void
  onCopy?: () => void
  onPaste?: () => void
  onDelete?: () => void
  onSelectAll?: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  onOptions?: () => void
  onLoadExample?: (file: string) => void
}

export function MenuBar({ onNewFile, onSave, onOpen, onCut, onCopy, onPaste, onDelete, onSelectAll, onUndo, onRedo, canUndo, canRedo, onOptions, onLoadExample }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const menuBarRef = useRef<HTMLDivElement>(null)

  const menus: Menu[] = [
    {
      label: 'File',
      items: [
        { label: 'New', shortcut: '⌘N', onClick: onNewFile },
        { label: 'Open…', shortcut: '⌘O', onClick: onOpen },
        { label: 'Save', shortcut: '⌘S', onClick: onSave },
        { separator: true, label: '' },
        { label: 'Quit', shortcut: '⌘Q', onClick: () => window.close() },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: '⌘Z', disabled: !canUndo, onClick: onUndo },
        { label: 'Redo', shortcut: '⌘⇧Z', disabled: !canRedo, onClick: onRedo },
        { separator: true, label: '' },
        { label: 'Cut', shortcut: '⌘X', onClick: onCut },
        { label: 'Copy', shortcut: '⌘C', onClick: onCopy },
        { label: 'Paste', shortcut: '⌘V', onClick: onPaste },
        { label: 'Delete', shortcut: '⌫', onClick: onDelete },
        { separator: true, label: '' },
        { label: 'Select All', shortcut: '⌘A', onClick: onSelectAll },
      ],
    },
    {
      label: 'Examples',
      items: [
        { label: 'Sample Network', onClick: () => onLoadExample?.('network.cir') },
        { label: 'Mountainside', onClick: () => onLoadExample?.('mountain.cir') },
      ],
    },
    {
      label: 'Tools',
      items: [
        { label: 'Options…', onClick: onOptions },
      ],
    },
  ]

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="menu-bar" ref={menuBarRef}>
      {menus.map((menu) => (
        <div key={menu.label} className="menu-root">
          <button
            className={`menu-label ${openMenu === menu.label ? 'active' : ''}`}
            onMouseDown={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
            onMouseEnter={() => openMenu !== null && setOpenMenu(menu.label)}
          >
            {menu.label}
          </button>
          {openMenu === menu.label && (
            <div className="menu-dropdown">
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div key={i} className="menu-separator" />
                ) : (
                  <button
                    key={i}
                    className={`menu-item ${item.disabled ? 'disabled' : ''}`}
                    disabled={item.disabled}
                    onClick={() => {
                      item.onClick?.()
                      setOpenMenu(null)
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
