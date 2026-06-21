// ============================================================================
// ConnectionValidator.ts
//
// Inspects a newly placed element (elm) against the existing elements on the
// canvas and returns a list of validation warnings.
//
// Called immediately after the user drops an element onto the canvas.
// Violations are shown as non-blocking warnings — the element is still added
// but the user is informed of the problem.
// ============================================================================

import type { CircuitElm } from './CircuitElm'
import {
  DEVICE_TYPE_MAP,
  PIPE_SIZE_CODES,
  resolvePortDirections,
  resolvePortSizes,
} from './DeviceFingerprint'

// ── Map XML tag → device type id ─────────────────────────────────────────────
const XML_TAG_TO_TYPE_ID: Record<string, string> = {
  pp:  'pipe',
  pu:  'pump',
  bp:  'booster-pump',
  tk:  'tank',
  vl:  'valve',
  lv:  'lumo-valve-2',
  mn:  'manifold',
  fi:  'filter',
  prv: 'prv',
  sp:  'sprinkler',
  src: 'pump',
  // new devices
  dr:  'drip',
  cx:  'custom-endpoint',
  cc:  'pipe-cap',
  ws:  'pressure-sensor',
  ww:  'pressure-switch',
}

function getTypeId(elm: CircuitElm): string {
  return XML_TAG_TO_TYPE_ID[elm.getXmlDumpType()] ?? elm.getXmlDumpType()
}

// ── A connection: two elements sharing the same grid point ───────────────────
export interface SharedNode {
  /** The newly placed element */
  newElm: CircuitElm
  newPostIndex: number
  /** The existing element at the same grid point */
  existingElm: CircuitElm
  existingPostIndex: number
}

// ── Find all shared nodes between newElm and existing elements ────────────────
export function findSharedNodes(
  newElm: CircuitElm,
  existingElements: CircuitElm[],
): SharedNode[] {
  const shared: SharedNode[] = []
  for (let ni = 0; ni < newElm.getPostCount(); ni++) {
    const np = newElm.getPost(ni)
    for (const existing of existingElements) {
      if (existing === newElm) continue
      for (let ei = 0; ei < existing.getPostCount(); ei++) {
        const ep = existing.getPost(ei)
        if (np.x === ep.x && np.y === ep.y) {
          shared.push({
            newElm, newPostIndex: ni,
            existingElm: existing, existingPostIndex: ei,
          })
        }
      }
    }
  }
  return shared
}

// ── Validation warning ────────────────────────────────────────────────────────
export interface ValidationWarning {
  rule: number
  message: string
}

// ── Main validation function ──────────────────────────────────────────────────
export function validatePlacement(
  newElm: CircuitElm,
  existingElements: CircuitElm[],
): ValidationWarning[] {
  const warnings: ValidationWarning[] = []
  const newTypeId  = getTypeId(newElm)
  const newTypeDef = DEVICE_TYPE_MAP.get(newTypeId)

  // Find all points where newElm touches existing elements
  const sharedNodes = findSharedNodes(newElm, existingElements)

  for (const node of sharedNodes) {
    const existingTypeId  = getTypeId(node.existingElm)
    const existingTypeDef = DEVICE_TYPE_MAP.get(existingTypeId)

    if (!newTypeDef || !existingTypeDef) continue

    // Guard: manifold has variable ports — use first available def if out of range
    const safePDef = (defs: typeof newTypeDef.fingerprint.ports, idx: number) =>
      defs[idx] ?? defs[defs.length - 1]

    const npd = safePDef(newTypeDef.fingerprint.ports, node.newPostIndex)
    const epd = safePDef(existingTypeDef.fingerprint.ports, node.existingPostIndex)

    if (!npd || !epd) continue

    // ── Rule 1: Domain match ───────────────────────────────────────────────
    if (npd.domain !== epd.domain) {
      warnings.push({
        rule: 1,
        message: `Domain mismatch: ${newTypeDef.label} (${npd.domain}) cannot connect directly to ${existingTypeDef.label} (${epd.domain}).`,
      })
      continue   // further checks on this pair don't apply
    }

    const domain = npd.domain

    // ── Rule 2: Pipe required between water devices ────────────────────────
    if (domain === 'W') {
      const newIsTerm      = newTypeDef.fingerprint.isTerminator
      const existingIsTerm = existingTypeDef.fingerprint.isTerminator
      const newIsPipe      = newTypeId === 'pipe'
      const existingIsPipe = existingTypeId === 'pipe'

      // Two non-terminator, non-pipe water devices touching directly
      if (!newIsTerm && !existingIsTerm && !newIsPipe && !existingIsPipe) {
        warnings.push({
          rule: 2,
          message: `${newTypeDef.label} and ${existingTypeDef.label} cannot connect directly. A pipe section is required between them.`,
        })
      }

      // A terminator connecting directly to another terminator is also wrong
      if (newIsTerm && existingIsTerm) {
        warnings.push({
          rule: 2,
          message: `${newTypeDef.label} and ${existingTypeDef.label} are both terminators and cannot connect directly.`,
        })
      }
    }

    // ── Rule 3: Port size match ────────────────────────────────────────────
    if (domain === 'W') {
      const sizeA = (newElm as any)._portSizeCodes?.[node.newPostIndex] ?? npd.sizeCode
      const sizeB = (node.existingElm as any)._portSizeCodes?.[node.existingPostIndex] ?? epd.sizeCode

      if (sizeA !== 'x' && sizeB !== 'x') {
        const resolved = resolvePortSizes(sizeA, sizeB)
        if (!resolved) {
          const labelA = PIPE_SIZE_CODES[sizeA] ?? sizeA
          const labelB = PIPE_SIZE_CODES[sizeB] ?? sizeB
          warnings.push({
            rule: 3,
            message: `Size mismatch: ${newTypeDef.label} port is ${labelA} but ${existingTypeDef.label} port is ${labelB}. Insert a 2-port Manifold to adapt sizes.`,
          })
        }
      }
      // If either is 'x' (unresolved), auto-inherit — no warning needed
      // Size propagation stored on element for later use
      if (sizeA !== 'x' && sizeB === 'x') {
        if (!(node.existingElm as any)._portSizeCodes) {
          (node.existingElm as any)._portSizeCodes = []
        }
        ;(node.existingElm as any)._portSizeCodes[node.existingPostIndex] = sizeA
      } else if (sizeB !== 'x' && sizeA === 'x') {
        if (!(newElm as any)._portSizeCodes) {
          (newElm as any)._portSizeCodes = []
        }
        ;(newElm as any)._portSizeCodes[node.newPostIndex] = sizeB
      }
    }

    // ── Rule 4: Direction compatibility ───────────────────────────────────
    if (domain === 'W') {
      const dirA = ((newElm as any)._portDirections?.[node.newPostIndex]
        ?? npd.direction) as 'I' | 'O' | 'B'
      const dirB = ((node.existingElm as any)._portDirections?.[node.existingPostIndex]
        ?? epd.direction) as 'I' | 'O' | 'B'

      const resolved = resolvePortDirections(dirA, dirB)

      // Check compatibility: need one side that can output and one that can input
      const aOut = resolved.resolvedA === 'O'
      const aIn  = resolved.resolvedA === 'I'
      const bOut = resolved.resolvedB === 'O'
      const bIn  = resolved.resolvedB === 'I'

      if (!((aOut && bIn) || (aIn && bOut))) {
        warnings.push({
          rule: 4,
          message: `Direction conflict: both ${newTypeDef.label} and ${existingTypeDef.label} resolved to the same direction at this connection.`,
        })
      } else {
        // Store resolved directions back onto elements
        if (dirA === 'B') {
          if (!(newElm as any)._portDirections) (newElm as any)._portDirections = []
          ;(newElm as any)._portDirections[node.newPostIndex] = resolved.resolvedA
        }
        if (dirB === 'B') {
          if (!(node.existingElm as any)._portDirections) (node.existingElm as any)._portDirections = []
          ;(node.existingElm as any)._portDirections[node.existingPostIndex] = resolved.resolvedB
        }
      }
    }
  }

  // ── Rule 5: Open ends — prompt if new element has unresolved ports ─────────
  // Only warn for non-terminators with more than one port
  if (newTypeDef && !newTypeDef.fingerprint.isTerminator) {
    const waterPorts = newTypeDef.fingerprint.ports.filter(p => p.domain === 'W' && !p.optional)
    const connectedPostIndices = new Set(sharedNodes.map(n => n.newPostIndex))
    const openPorts = waterPorts.filter((_, i) => !connectedPostIndices.has(i))

    if (openPorts.length > 0 && sharedNodes.length > 0) {
      // Only warn if at least one port IS connected (otherwise it's just been placed)
      warnings.push({
        rule: 5,
        message: `${newTypeDef.label} has ${openPorts.length} unconnected port${openPorts.length > 1 ? 's' : ''}. Connect or cap before simulating.`,
      })
    }
  }

  return warnings
}

// ── Network-level validation (called before simulation runs) ─────────────────
export function validateNetwork(elements: CircuitElm[]): ValidationWarning[] {
  const warnings: ValidationWarning[] = []

  // ── Rule 6: At least one primary pressure source ───────────────────────────
  const hasPrimarySource = elements.some(elm => {
    const typeId = getTypeId(elm)
    const typeDef = DEVICE_TYPE_MAP.get(typeId)
    if (!typeDef?.fingerprint.isPrimarySource) return false
    if (typeId === 'tank') {
      return ((elm as any)._elevation ?? 0) > 0
    }
    return true
  })

  if (elements.length > 0 && !hasPrimarySource) {
    warnings.push({
      rule: 6,
      message: 'No primary pressure source in the network. Add a Primary Pump or an Elevated Tank with elevation set.',
    })
  }

  // ── Rule 5: Open ends across all elements ──────────────────────────────────
  for (const elm of elements) {
    const typeId  = getTypeId(elm)
    const typeDef = DEVICE_TYPE_MAP.get(typeId)
    if (!typeDef || typeDef.fingerprint.isTerminator) continue

    const waterPorts = typeDef.fingerprint.ports.filter(p => p.domain === 'W' && !p.optional)

    for (let pi = 0; pi < waterPorts.length; pi++) {
      const post = elm.getPost(pi)
      // Check if any other element shares this post
      const connected = elements.some(other => {
        if (other === elm) return false
        for (let oi = 0; oi < other.getPostCount(); oi++) {
          const op = other.getPost(oi)
          if (op.x === post.x && op.y === post.y) return true
        }
        return false
      })
      if (!connected) {
        warnings.push({
          rule: 5,
          message: `${typeDef.label} has an open port. Connect or cap before simulating.`,
        })
        break  // one warning per device is enough
      }
    }
  }

  return warnings
}
