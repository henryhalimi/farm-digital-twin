import type { Map as MapboxMap } from 'mapbox-gl'
import { ANCHOR_LAT, ANCHOR_LNG, METERS_PER_UNIT } from './CircuitElm'

// Mirrors UIManager.getElevation / queryTerrainElevation from the GWT original.
// Queries the Mapbox terrain DEM for a circuit coordinate.

// Elevation cache keyed by "cx,cy"
const elevationCache = new Map<string, number>()

let mapInstance: MapboxMap | null = null

export const UIManager = {
  setMap(map: MapboxMap) {
    mapInstance = map
  },

  // Returns elevation in meters, or NaN if terrain not yet loaded
  getElevation(cx: number, cy: number): number {
    const key = `${cx},${cy}`
    const cached = elevationCache.get(key)
    if (cached !== undefined) return cached

    const elev = UIManager.queryTerrainElevation(cx, cy)
    if (!isNaN(elev)) elevationCache.set(key, elev)
    return elev
  },

  queryTerrainElevation(cx: number, cy: number): number {
    if (!mapInstance) return NaN
    const lat = ANCHOR_LAT - (cy * METERS_PER_UNIT) / 111320.0
    const lng = ANCHOR_LNG + (cx * METERS_PER_UNIT) / (111320.0 * Math.cos(ANCHOR_LAT * Math.PI / 180))

    // mapboxgl.Map.queryTerrainElevation exists when terrain is enabled
    const elev = (mapInstance as any).queryTerrainElevation({ lng, lat }, { exaggerated: false })
    return elev == null ? NaN : elev
  },

  clearCache() {
    elevationCache.clear()
  },
}
