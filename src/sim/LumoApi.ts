// ============================================================================
// LumoApi.ts
// Client for Lumo backend API — valve control and device status
// ============================================================================

const API_BASE = 'https://api.lumo-dev.com/v1'

// API key stored in environment or config
// In production this comes from your auth system — never hardcoded
let _apiKey = ''

export function setApiKey(key: string) {
  _apiKey = key
}

function headers(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${_apiKey}`,
  }
}

// ── Device status ─────────────────────────────────────────────────────────────
export interface DeviceStatus {
  id:          string
  name?:       string
  valveState:  'open' | 'closed' | 'unknown'
  isOnline:    boolean
  batteryPct?: number
  flowRate?:   number
}

export async function getDeviceStatus(deviceId: string): Promise<DeviceStatus> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}`, {
    method: 'GET',
    headers: headers(),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()

  // Map Lumo API response to our DeviceStatus shape
  const device = data.device ?? data
  return {
    id:         device.id,
    name:       device.name,
    valveState: mapValveState(device.data?.valve_state ?? device.valve_state),
    isOnline:   device.status === 'DEVICE_STATUS_ONLINE',
    batteryPct: device.data?.battery_percent,
    flowRate:   device.data?.flow_rate,
  }
}

function mapValveState(raw: string | undefined): 'open' | 'closed' | 'unknown' {
  if (!raw) return 'unknown'
  const s = raw.toLowerCase()
  if (s.includes('open'))   return 'open'
  if (s.includes('close') || s.includes('closed')) return 'closed'
  return 'unknown'
}

// ── Valve commands ────────────────────────────────────────────────────────────
export interface CommandResult {
  commandId: string
  success:   boolean
}

export async function openValve(deviceId: string): Promise<CommandResult> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/open_valve`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`Open valve failed: ${res.status}`)
  const data = await res.json()
  return {
    commandId: data.command_id ?? data.id ?? '',
    success:   true,
  }
}

export async function closeValve(deviceId: string): Promise<CommandResult> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/close_valve`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`Close valve failed: ${res.status}`)
  const data = await res.json()
  return {
    commandId: data.command_id ?? data.id ?? '',
    success:   true,
  }
}

// ── Poll device status ────────────────────────────────────────────────────────
// Returns a cleanup function to stop polling
export function pollDeviceStatus(
  deviceId: string,
  intervalMs: number,
  onUpdate: (status: DeviceStatus) => void,
  onError?: (err: Error) => void,
): () => void {
  let active = true

  const poll = async () => {
    if (!active) return
    try {
      const status = await getDeviceStatus(deviceId)
      if (active) onUpdate(status)
    } catch (err) {
      if (active && onError) onError(err as Error)
    }
    if (active) setTimeout(poll, intervalMs)
  }

  poll()
  return () => { active = false }
}
