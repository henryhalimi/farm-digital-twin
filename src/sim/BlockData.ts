// ============================================================================
// BlockData.ts
// Data model for a farm block — attached to a Lumo Valve element instance.
// One block = one Lumo Valve.
// ============================================================================

export type IrrigationType = 'drip' | 'sprinkler' | 'microspray' | 'custom'

export const IRRIGATION_TYPES: Record<IrrigationType, string> = {
  drip:       'Drip',
  sprinkler:  'Sprinkler',
  microspray: 'Micro Spray',
  custom:     'Custom',
}

// ── Crop list — captured now, used later for ET models and analytics ──────────
export const CROP_TYPES = [
  // Wine grapes
  'Cabernet Sauvignon',
  'Chardonnay',
  'Merlot',
  'Pinot Noir',
  'Zinfandel',
  'Sauvignon Blanc',
  'Syrah / Shiraz',
  'Other Wine Grape',
  // Table grapes
  'Table Grape',
  // Tree fruit
  'Almond',
  'Pistachio',
  'Walnut',
  'Pecan',
  'Apple',
  'Pear',
  'Cherry',
  'Peach / Nectarine',
  'Plum / Prune',
  'Citrus — Orange',
  'Citrus — Lemon',
  'Citrus — Other',
  'Avocado',
  'Olive',
  // Berries
  'Strawberry',
  'Blueberry',
  'Raspberry',
  'Blackberry',
  // Row crops
  'Tomato',
  'Pepper',
  'Lettuce',
  'Onion',
  'Garlic',
  'Corn',
  'Cotton',
  // Other
  'Nursery',
  'Turf / Landscape',
  'Other',
]

// ── Block data ────────────────────────────────────────────────────────────────
export interface BlockData {
  // Identity
  blockId:        string        // e.g. "4" or "A"
  blockName:      string        // e.g. "North Cabernet"
  cropType:       string        // from CROP_TYPES
  areAcres:       number        // block area in acres
  plantCount:     number        // number of plants/trees

  // Irrigation
  irrigationType: IrrigationType
  emitterCount:   number
  emitterRating:  number
  operatingPSI:   number

  // Backend device link
  deviceId?:      string    // Lumo device UUID — links twin to physical valve

  // GPS (populated later by field tech)
  lat?:           number
  lng?:           number
}

// ── Calculated values from BlockData ─────────────────────────────────────────
export function calcBlockMetrics(b: BlockData) {
  const emittersPerPlant = b.plantCount > 0
    ? (b.emitterCount / b.plantCount).toFixed(1)
    : '—'

  const totalGPH = b.emitterCount * b.emitterRating
  const totalGPM = totalGPH / 60

  return {
    emittersPerPlant,
    totalGPH: totalGPH.toFixed(0),
    totalGPM: totalGPM.toFixed(1),
  }
}

// ── Default empty block ───────────────────────────────────────────────────────
export function defaultBlockData(): BlockData {
  return {
    blockId:        '',
    blockName:      '',
    cropType:       '',
    areAcres:       0,
    plantCount:     0,
    irrigationType: 'drip',
    emitterCount:   0,
    emitterRating:  0.5,
    operatingPSI:   15,
  }
}

// ── Serialize / deserialize for XML persistence ───────────────────────────────
export function blockDataToXmlAttrs(b: BlockData): Record<string, string> {
  return {
    blockId:        b.blockId,
    blockName:      b.blockName,
    cropType:       b.cropType,
    areAcres:       String(b.areAcres),
    plantCount:     String(b.plantCount),
    irrigationType: b.irrigationType,
    emitterCount:   String(b.emitterCount),
    emitterRating:  String(b.emitterRating),
    operatingPSI:   String(b.operatingPSI),
    ...(b.lat !== undefined ? { lat: String(b.lat) } : {}),
    ...(b.lng !== undefined ? { lng: String(b.lng) } : {}),
  }
}

export function blockDataFromXmlAttrs(attrs: Record<string, string>): BlockData {
  return {
    blockId:        attrs.blockId        ?? '',
    blockName:      attrs.blockName      ?? '',
    cropType:       attrs.cropType       ?? '',
    areAcres:       parseFloat(attrs.areAcres)     || 0,
    plantCount:     parseInt(attrs.plantCount)      || 0,
    irrigationType: (attrs.irrigationType as IrrigationType) ?? 'drip',
    emitterCount:   parseInt(attrs.emitterCount)   || 0,
    emitterRating:  parseFloat(attrs.emitterRating) || 0.5,
    operatingPSI:   parseFloat(attrs.operatingPSI)  || 15,
    lat:            attrs.lat ? parseFloat(attrs.lat) : undefined,
    lng:            attrs.lng ? parseFloat(attrs.lng) : undefined,
  }
}
