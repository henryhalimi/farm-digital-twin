import type { CircuitElm } from './CircuitElm'
import { ELEMENT_XML_TAG_MAP } from './ElementRegistry'

export interface CircuitOptions {
  currentSpeed?: number
  anchorLat?: number
  anchorLng?: number
}

// ── Save ──────────────────────────────────────────────────────────────────────

export function saveCircuit(elements: CircuitElm[], opts?: CircuitOptions): string {
  let cirAttrs = ''
  if (opts) {
    const parts: string[] = []
    if (opts.currentSpeed !== undefined) parts.push(`speed="${opts.currentSpeed}"`)
    if (opts.anchorLat !== undefined) parts.push(`lat="${opts.anchorLat}"`)
    if (opts.anchorLng !== undefined) parts.push(`lng="${opts.anchorLng}"`)
    if (parts.length > 0) cirAttrs = ' ' + parts.join(' ')
  }
  const lines: string[] = ['<?xml version="1.0"?>', `<cir${cirAttrs}>`]
  for (const elm of elements) {
    const tag = elm.getXmlDumpType()
    const attrs: Record<string, string> = {}
    elm.dumpXml(attrs)
    const attrStr = Object.entries(attrs)
      .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
      .join(' ')
    lines.push(`  <${tag} ${attrStr}/>`)
  }
  lines.push('</cir>', '')
  return lines.join('\n')
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;')
          .replace(/</g, '&lt;')
}

// ── Load ──────────────────────────────────────────────────────────────────────

export function loadCircuit(xml: string): { elements: CircuitElm[]; options: CircuitOptions } {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) throw new Error('XML parse error: ' + parserError.textContent)

  const root = doc.documentElement
  const options: CircuitOptions = {}
  if (root.hasAttribute('speed')) options.currentSpeed = parseFloat(root.getAttribute('speed')!)
  if (root.hasAttribute('lat')) options.anchorLat = parseFloat(root.getAttribute('lat')!)
  if (root.hasAttribute('lng')) options.anchorLng = parseFloat(root.getAttribute('lng')!)

  const elements: CircuitElm[] = []
  for (const child of root.children) {
    const tag = child.tagName
    const type = ELEMENT_XML_TAG_MAP.get(tag)
    if (!type?.fromXml) {
      console.warn('unknown XML element tag:', tag)
      continue
    }
    const elm = type.fromXml(child)
    if (elm) elements.push(elm)
  }
  return { elements, options }
}
