// ============================================================================
// DeviceFingerprint.ts
// Fingerprint specification, lookup tables, device registry, and
// connection validation engine for the hydraulic digital twin.
//
// Fingerprint structure:  [Domain][Type][Direction][SizeCode]...
//   repeating port definitions per domain section.
//
// Example:  WP Bx Bx         — Water Pipe, 2 bidirectional ports (size TBD)
//           WL IJ OJ BD BD   — Lumo Valve 2", main ports + utility ports
// ============================================================================

// ── Domain letters ────────────────────────────────────────────────────────────
export type Domain = 'W' | 'EP' | 'ES' | 'C'

// ── Port direction ────────────────────────────────────────────────────────────
export type PortDirection = 'I' | 'O' | 'B'

// ── Port size state ───────────────────────────────────────────────────────────
export type PortSizeState = 'UNRESOLVED' | 'ASSIGNED' | 'LOCKED'

// ── Water pipe size lookup table (A→Q) ───────────────────────────────────────
export const PIPE_SIZE_CODES: Record<string, string> = {
  A: '1/8"',
  B: '1/4"',
  C: '3/8"',
  D: '1/2"',
  E: '5/8"',
  F: '3/4"',
  G: '1"',
  H: '1-1/4"',
  I: '1-1/2"',
  J: '2"',
  K: '2-1/2"',
  L: '3"',
  M: '4"',
  N: '5"',
  O: '6"',
  P: '8"',
  Q: '10"',
}

export const PIPE_SIZE_CODE_LIST = Object.keys(PIPE_SIZE_CODES)  // ['A'..'Q']

// ── Electrical power lookup table ─────────────────────────────────────────────
export const POWER_CODES: Record<string, string> = {
  A: '24VAC',
  B: '120VAC',
  C: '240VAC',
  D: '480VAC',
  E: '3.3VDC',
  F: '5VDC',
  G: '12VDC',
  H: '24VDC',
  I: '48VDC',
}

// ── Electrical signal lookup table ────────────────────────────────────────────
export const SIGNAL_CODES: Record<string, string> = {
  A: '4-20mA Analog',
  B: '0-10V Analog',
  C: 'Digital On/Off',
  D: 'Pulse/Frequency',
  E: 'RS485',
  F: 'Modbus RTU',
  G: 'Modbus TCP',
  H: 'HART',
  I: 'I2C',
  J: 'SDI-12',
  K: 'CAN bus',
  L: 'SPI',
}

// ── Port definition ───────────────────────────────────────────────────────────
export interface PortDef {
  domain: Domain
  direction: PortDirection
  /** Size code from PIPE_SIZE_CODES (water ports) or signal/power code (E ports).
   *  'x' means UNRESOLVED — user must assign before simulation. */
  sizeCode: string
  sizeState: PortSizeState
  /** Label shown in config dialog, e.g. "Main Inlet", "AUX A Power" */
  label: string
  /** If true, port may remain unconnected without triggering Rule 5 warning */
  optional: boolean
}

// ── Device fingerprint ────────────────────────────────────────────────────────
export interface DeviceFingerprint {
  /** Full fingerprint string e.g. "WLIJOJBDBdEPOxOxESBxBx" */
  code: string
  /** Ordered list of port definitions */
  ports: PortDef[]
  /** True if device is a terminator (single water port, dead end) */
  isTerminator: boolean
  /** True if device is a valid primary pressure source */
  isPrimarySource: boolean
}

// ── Port state at runtime (per element instance) ──────────────────────────────
export interface PortState {
  portIndex: number
  direction: PortDirection       // resolved direction (may differ from def if B resolved)
  sizeCode: string               // actual assigned size code
  sizeState: PortSizeState
  connectedToElementId: string | null
  connectedToPortIndex: number | null
}

// ── Device type registry entry ────────────────────────────────────────────────
export interface DeviceTypeDef {
  /** Matches ElementTypeDef.id in ElementRegistry */
  id: string
  label: string
  fingerprint: DeviceFingerprint
  /** For manifold: port count is variable. Min/max enforced in config dialog. */
  variablePorts?: { min: number; max: number }
}

// ── Helper: build a water port ────────────────────────────────────────────────
function wp(direction: PortDirection, label: string, sizeCode = 'x', optional = false): PortDef {
  return { domain: 'W', direction, sizeCode, sizeState: sizeCode === 'x' ? 'UNRESOLVED' : 'ASSIGNED', label, optional }
}

// ── Helper: build an EP (electrical power) port ───────────────────────────────
function epp(direction: PortDirection, label: string, sizeCode = 'x'): PortDef {
  return { domain: 'EP', direction, sizeCode, sizeState: sizeCode === 'x' ? 'UNRESOLVED' : 'ASSIGNED', label, optional: false }
}

// ── Helper: build an ES (electrical signal) port ─────────────────────────────
function esp(direction: PortDirection, label: string, sizeCode = 'x'): PortDef {
  return { domain: 'ES', direction, sizeCode, sizeState: sizeCode === 'x' ? 'UNRESOLVED' : 'ASSIGNED', label, optional: false }
}

// ── Device type registry ──────────────────────────────────────────────────────
export const DEVICE_TYPES: DeviceTypeDef[] = [

  // ── Pipe ──────────────────────────────────────────────────────────────────
  {
    id: 'pipe',
    label: 'Pipe',
    fingerprint: {
      code: 'WPBxBx',
      isTerminator: false,
      isPrimarySource: false,
      ports: [
        wp('B', 'Port 1'),
        wp('B', 'Port 2'),
      ],
    },
  },

  // ── Primary Pump (self-contained pressure source) ─────────────────────────
  {
    id: 'pump',
    label: 'Primary Pump',
    fingerprint: {
      code: 'WUIxOx',
      isTerminator: false,
      isPrimarySource: true,
      ports: [
        wp('I', 'Suction'),
        wp('O', 'Discharge'),
      ],
    },
  },

  // ── Booster Pump ──────────────────────────────────────────────────────────
  {
    id: 'booster-pump',
    label: 'Booster Pump',
    fingerprint: {
      code: 'WBIxOx',
      isTerminator: false,
      isPrimarySource: false,
      ports: [
        wp('I', 'Inlet'),
        wp('O', 'Outlet'),
      ],
    },
  },

  // ── Elevated Tank ─────────────────────────────────────────────────────────
  {
    id: 'tank',
    label: 'Elevated Tank',
    fingerprint: {
      code: 'WTBxBx',
      isTerminator: false,
      isPrimarySource: true,   // when elevation > 0
      ports: [
        wp('B', 'Port 1'),
        wp('B', 'Port 2'),
      ],
    },
  },

  // ── Valve ─────────────────────────────────────────────────────────────────
  {
    id: 'valve',
    label: 'Valve',
    fingerprint: {
      code: 'WVBxBx',
      isTerminator: false,
      isPrimarySource: false,
      ports: [
        wp('B', 'Port 1'),
        wp('B', 'Port 2'),
      ],
    },
  },

  // ── Lumo Valve 2" ─────────────────────────────────────────────────────────
  {
    id: 'lumo-valve-2',
    label: 'Lumo Valve 2"',
    fingerprint: {
      code: 'WLIJOJBDBdEPOxOxESBxBx',
      isTerminator: false,
      isPrimarySource: false,
      ports: [
        wp('I', 'Main Inlet',    'J'),          // 2"
        wp('O', 'Main Outlet',   'J'),          // 2"
        wp('B', 'Utility Port 1','D', true),    // 1/2" optional (normally capped)
        wp('B', 'Utility Port 2','D', true),    // 1/2" optional (normally capped)
        epp('O', 'AUX A Power'),
        epp('O', 'AUX B Power'),
        esp('B', 'AUX A Signal'),
        esp('B', 'AUX B Signal'),
      ],
    },
  },

  // ── Lumo Valve 4" ─────────────────────────────────────────────────────────
  {
    id: 'lumo-valve-4',
    label: 'Lumo Valve 4"',
    fingerprint: {
      code: 'WLIMOMBDBdEPOxOxESBxBx',
      isTerminator: false,
      isPrimarySource: false,
      ports: [
        wp('I', 'Main Inlet',    'M'),          // 4"
        wp('O', 'Main Outlet',   'M'),          // 4"
        wp('B', 'Utility Port 1','D', true),    // 1/2" optional (normally capped)
        wp('B', 'Utility Port 2','D', true),    // 1/2" optional (normally capped)
        epp('O', 'AUX A Power'),
        epp('O', 'AUX B Power'),
        esp('B', 'AUX A Signal'),
        esp('B', 'AUX B Signal'),
      ],
    },
  },

  // ── Manifold (variable ports 2-6) ─────────────────────────────────────────
  {
    id: 'manifold',
    label: 'Manifold',
    variablePorts: { min: 2, max: 6 },
    fingerprint: {
      code: 'WM',                              // ports defined at config time
      isTerminator: false,
      isPrimarySource: false,
      ports: [                                 // default: 1 in + 2 out
        wp('I', 'Port 1'),
        wp('O', 'Port 2'),
        wp('O', 'Port 3'),
      ],
    },
  },

  // ── Filter ────────────────────────────────────────────────────────────────
  {
    id: 'filter',
    label: 'Filter',
    fingerprint: {
      code: 'WFIxOxBDBd',
      isTerminator: false,
      isPrimarySource: false,
      ports: [
        wp('I', 'Inlet'),
        wp('O', 'Outlet'),
        wp('B', 'Pressure Port 1', 'D', true),  // 1/2" optional (normally capped)
        wp('B', 'Pressure Port 2', 'D', true),  // 1/2" optional (normally capped)
      ],
    },
  },

  // ── PRV ───────────────────────────────────────────────────────────────────
  {
    id: 'prv',
    label: 'PRV',
    fingerprint: {
      code: 'WQIxOx',
      isTerminator: false,
      isPrimarySource: false,
      ports: [
        wp('I', 'Inlet'),
        wp('O', 'Outlet'),
      ],
    },
  },

  // ── Sprinkler (terminator) ────────────────────────────────────────────────
  {
    id: 'sprinkler',
    label: 'Sprinkler',
    fingerprint: {
      code: 'WKIx',
      isTerminator: true,
      isPrimarySource: false,
      ports: [
        wp('I', 'Inlet'),
      ],
    },
  },

  // ── Drip Irrigation (terminator) ─────────────────────────────────────────
  {
    id: 'drip',
    label: 'Drip',
    fingerprint: {
      code: 'WDIx',
      isTerminator: true,
      isPrimarySource: false,
      ports: [
        wp('I', 'Inlet'),
      ],
    },
  },

  // ── Custom Endpoint (terminator) ─────────────────────────────────────────
  {
    id: 'custom-endpoint',
    label: 'Custom Endpoint',
    fingerprint: {
      code: 'WXIx',
      isTerminator: true,
      isPrimarySource: false,
      ports: [
        wp('I', 'Inlet'),
      ],
    },
  },

  // ── Pipe Cap (terminator) ─────────────────────────────────────────────────
  {
    id: 'pipe-cap',
    label: 'Pipe Cap',
    fingerprint: {
      code: 'WCBx',
      isTerminator: true,
      isPrimarySource: false,
      ports: [
        wp('B', 'Port'),
      ],
    },
  },

  // ── Pressure Sensor (terminator) ─────────────────────────────────────────
  {
    id: 'pressure-sensor',
    label: 'Pressure Sensor',
    fingerprint: {
      code: 'WSIx',
      isTerminator: true,
      isPrimarySource: false,
      ports: [
        wp('I', 'Port'),
        esp('O', 'Signal Output', 'A'),          // 4-20mA analog
      ],
    },
  },

  // ── Pressure Switch (terminator) ─────────────────────────────────────────
  {
    id: 'pressure-switch',
    label: 'Pressure Switch',
    fingerprint: {
      code: 'WWIx',
      isTerminator: true,
      isPrimarySource: false,
      ports: [
        wp('I', 'Port'),
        esp('O', 'Signal Output', 'C'),          // digital on/off
      ],
    },
  },
]

// ── Device type map (keyed by id) ─────────────────────────────────────────────
export const DEVICE_TYPE_MAP = new Map(DEVICE_TYPES.map(d => [d.id, d]))

// ============================================================================
// CONNECTION VALIDATION ENGINE
// ============================================================================

export type ValidationResult =
  | { ok: true }
  | { ok: false; rule: number; message: string }

/**
 * Represents one side of a proposed connection.
 */
export interface ConnectionSide {
  deviceTypeId: string
  portIndex: number
  portState: PortState
}

/**
 * The element sitting between two devices in a proposed connection.
 * For water domain connections this must be a pipe section.
 */
export interface ConnectionBridge {
  deviceTypeId: string   // should be 'pipe' for water connections
}

/**
 * Validate a proposed connection between two device ports,
 * optionally through a bridge element (pipe section).
 *
 * Returns { ok: true } if all rules pass, or
 * { ok: false, rule: N, message: '...' } for the first failing rule.
 */
export function validateConnection(
  sideA: ConnectionSide,
  sideB: ConnectionSide,
  bridge: ConnectionBridge | null,
  _allDeviceTypeIds: string[],   // all devices currently on canvas (for Rule 6 check)
): ValidationResult {

  const typeA = DEVICE_TYPE_MAP.get(sideA.deviceTypeId)
  const typeB = DEVICE_TYPE_MAP.get(sideB.deviceTypeId)

  if (!typeA || !typeB) {
    return { ok: false, rule: 0, message: 'Unknown device type.' }
  }

  const portDefA = typeA.fingerprint.ports[sideA.portIndex]
  const portDefB = typeB.fingerprint.ports[sideB.portIndex]

  if (!portDefA || !portDefB) {
    return { ok: false, rule: 0, message: 'Invalid port index.' }
  }

  // ── Rule 1: Domain match ────────────────────────────────────────────────
  if (portDefA.domain !== portDefB.domain) {
    return {
      ok: false,
      rule: 1,
      message: `Domain mismatch: cannot connect a ${portDefA.domain} port to a ${portDefB.domain} port.`,
    }
  }

  const domain = portDefA.domain

  // ── Rule 2: Pipe section required between water devices ─────────────────
  if (domain === 'W') {
    const aIsTerminator = typeA.fingerprint.isTerminator
    const bIsTerminator = typeB.fingerprint.isTerminator

    // Two non-terminator water devices must have a pipe between them
    if (!aIsTerminator && !bIsTerminator) {
      if (!bridge || bridge.deviceTypeId !== 'pipe') {
        return {
          ok: false,
          rule: 2,
          message: `A pipe section is required between ${typeA.label} and ${typeB.label}. Water devices cannot connect directly.`,
        }
      }
    }
  }

  // ── Rule 3: Port size match ──────────────────────────────────────────────
  if (domain === 'W') {
    const sizeA = sideA.portState.sizeCode
    const sizeB = sideB.portState.sizeCode

    if (sizeA !== 'x' && sizeB !== 'x') {
      // Both assigned — must match
      if (sizeA !== sizeB) {
        const labelA = PIPE_SIZE_CODES[sizeA] ?? sizeA
        const labelB = PIPE_SIZE_CODES[sizeB] ?? sizeB
        return {
          ok: false,
          rule: 3,
          message: `Size mismatch: ${typeA.label} port is ${labelA} but ${typeB.label} port is ${labelB}. Insert a 2-port Manifold to adapt sizes.`,
        }
      }
    }
    // If one or both are 'x' (UNRESOLVED), size will be inherited on connection — allowed
  }

  // ── Rule 4: Direction compatibility ──────────────────────────────────────
  const dirA = sideA.portState.direction
  const dirB = sideB.portState.direction

  const aCanOutput = dirA === 'O' || dirA === 'B'
  const aCanInput  = dirA === 'I' || dirA === 'B'
  const bCanOutput = dirB === 'O' || dirB === 'B'
  const bCanInput  = dirB === 'I' || dirB === 'B'

  const compatible = (aCanOutput && bCanInput) || (aCanInput && bCanOutput)

  if (!compatible) {
    return {
      ok: false,
      rule: 4,
      message: `Direction incompatible: cannot connect ${dirA} port on ${typeA.label} to ${dirB} port on ${typeB.label}.`,
    }
  }

  // ── Rule 5: Open ends — checked at simulation time, not connection time ──
  // (enforced separately by validateNetworkForSimulation)

  // ── Rule 6: Primary source — checked at simulation time ──────────────────
  // (enforced separately by validateNetworkForSimulation)

  // ── Rule 7: Manifold must have at least 1 I and 1 O ──────────────────────
  // (enforced in config dialog on Apply — not here)

  return { ok: true }
}

/**
 * Validate the full network before simulation.
 * Checks Rules 5 and 6 across all placed devices.
 */
export function validateNetworkForSimulation(
  placedDevices: Array<{
    deviceTypeId: string
    portStates: PortState[]
    elevation?: number            // for tank: elevation > 0 qualifies as primary source
  }>,
): ValidationResult[] {
  const results: ValidationResult[] = []

  // ── Rule 6: At least one primary pressure source ─────────────────────────
  const hasPrimarySource = placedDevices.some(d => {
    const typeDef = DEVICE_TYPE_MAP.get(d.deviceTypeId)
    if (!typeDef) return false
    if (!typeDef.fingerprint.isPrimarySource) return false
    // Tank only qualifies if elevation > 0
    if (d.deviceTypeId === 'tank') return (d.elevation ?? 0) > 0
    return true
  })

  if (!hasPrimarySource) {
    results.push({
      ok: false,
      rule: 6,
      message: 'No primary pressure source found. Add a Primary Pump or an Elevated Tank with elevation > 0.',
    })
  }

  // ── Rule 5: No open ends ─────────────────────────────────────────────────
  for (const device of placedDevices) {
    const typeDef = DEVICE_TYPE_MAP.get(device.deviceTypeId)
    if (!typeDef) continue

    for (let i = 0; i < device.portStates.length; i++) {
      const portDef = typeDef.fingerprint.ports[i]
      const portState = device.portStates[i]

      // Skip optional ports (utility ports that are normally capped)
      if (portDef?.optional) continue
      // Skip electrical/control ports for now (water domain only at this stage)
      if (portDef?.domain !== 'W') continue

      if (portState.connectedToElementId === null) {
        results.push({
          ok: false,
          rule: 5,
          message: `Open end: ${typeDef.label} has an unconnected port "${portDef?.label ?? i}". Connect or cap before simulating.`,
        })
      }
    }
  }

  return results
}

/**
 * Resolve bidirectional port directions when a connection is made.
 * Returns the resolved direction for portA and portB.
 */
export function resolvePortDirections(
  dirA: PortDirection,
  dirB: PortDirection,
): { resolvedA: PortDirection; resolvedB: PortDirection } {
  // If one side is locked (I or O), the other B resolves to complement
  if (dirA === 'I' && dirB === 'B') return { resolvedA: 'I', resolvedB: 'O' }
  if (dirA === 'O' && dirB === 'B') return { resolvedA: 'O', resolvedB: 'I' }
  if (dirA === 'B' && dirB === 'I') return { resolvedA: 'O', resolvedB: 'I' }
  if (dirA === 'B' && dirB === 'O') return { resolvedA: 'I', resolvedB: 'O' }
  // Both B — first connection determines flow; A becomes I, B becomes O by convention
  if (dirA === 'B' && dirB === 'B') return { resolvedA: 'I', resolvedB: 'O' }
  // Already locked on both sides
  return { resolvedA: dirA, resolvedB: dirB }
}

/**
 * Inherit or validate port size when making a connection.
 * Returns the resolved size code for both ports, or null if there is a conflict.
 */
export function resolvePortSizes(
  sizeA: string,
  sizeB: string,
): { resolvedA: string; resolvedB: string } | null {
  if (sizeA === 'x' && sizeB === 'x') {
    // Both unresolved — caller must prompt user
    return null
  }
  if (sizeA === 'x') return { resolvedA: sizeB, resolvedB: sizeB }
  if (sizeB === 'x') return { resolvedA: sizeA, resolvedB: sizeA }
  if (sizeA === sizeB) return { resolvedA: sizeA, resolvedB: sizeB }
  // Mismatch — validation engine already caught this; return null to signal conflict
  return null
}
