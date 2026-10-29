import type { BoundingBox } from './geo'

export interface OsmFeature {
  id: string
  lat: number
  lon: number
  category: 'police' | 'hospital' | 'shop' | 'public_place' | 'street_lamp' | 'lit_way'
  name?: string
  tags?: Record<string, string>
}

export interface OverpassResult {
  features: OsmFeature[]
  status: 'ok' | 'cached' | 'fallback' | 'unavailable' | 'error'
  errorMessage?: string
  totalMappedLighting: number
  totalMappedPolice: number
  totalMappedHospitals: number
  totalMappedCommercial: number
  fetchedAt: number
}

/**
 * Fetch infrastructure features via internal /api/safety route
 */
export async function fetchOsmInfrastructure(bbox: BoundingBox): Promise<OverpassResult> {
  try {
    const url = `/api/safety?south=${bbox.south}&west=${bbox.west}&north=${bbox.north}&east=${bbox.east}`
    const res = await fetch(url)
    if (!res.ok) {
      return {
        features: [],
        status: 'unavailable',
        totalMappedLighting: 0,
        totalMappedPolice: 0,
        totalMappedHospitals: 0,
        totalMappedCommercial: 0,
        fetchedAt: Date.now(),
      }
    }
    const data = await res.json()
    return data
  } catch {
    return {
      features: [],
      status: 'unavailable',
      totalMappedLighting: 0,
      totalMappedPolice: 0,
      totalMappedHospitals: 0,
      totalMappedCommercial: 0,
      fetchedAt: Date.now(),
    }
  }
}
