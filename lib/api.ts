import { osrmToLeafletCoords, osrmDistanceToKm, osrmDurationToMin, computeBoundingBox } from './geo'
import { evaluateRouteSafety, type OsmDataInput, type SafetyFeatureId } from './safety'

export type ReasonType = 'positive' | 'caution' | 'negative'
export type Vehicle = 'walk' | 'cycle' | 'bike' | 'car'
export type Place = {
  display_name: string
  lat: string
  lon: string
  city?: string
  state?: string
  source?: string
}

export type RouteLabel = 'fastest' | 'safest' | 'alternative'
export type ConfidenceLevel = 'high' | 'moderate' | 'low' | 'insufficient'

export type SafetyFactor = {
  id: SafetyFeatureId
  label: string
  weight: number // 0-100
  score: number // 0-100 for this route
  description: string
  selected: boolean
  status: 'active' | 'deselected' | 'unmapped'
}

export type Route = {
  id: string
  label: RouteLabel
  duration_min: number
  distance_km: number
  safety_score: number
  vehicle: Vehicle
  reasons: { type: ReasonType; text: string }[]
  segments: { coords: [number, number][]; score: number; reason: string }[]
  steps: { instruction: string; distance_m: number; lat: number; lng: number; road_name?: string }[]
  safetyFactors: SafetyFactor[]
  confidence?: ConfidenceLevel
  confidenceScore?: number
  confidenceReason?: string
  dataSources?: string[]
  limitations?: string[]
  isMeaningfulComparison?: boolean
  comparisonNote?: string
}

export type UnsafeReport = {
  id: string
  lat: number
  lng: number
  type: 'pothole' | 'poor_lighting' | 'suspicious_activity' | 'harassment' | 'other'
  note: string
  timestamp: number
}

// ── Search & Geocoding via secure internal API ───────────────────────────────

export async function searchPlaces(query: string): Promise<Place[]> {
  const trimmed = query.trim()
  if (!trimmed || trimmed.length < 2) return []

  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      return []
    }
    const data = await res.json()
    return Array.isArray(data.places) ? data.places : []
  } catch {
    return []
  }
}

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(`/api/geocode?reverse=true&lat=${lat}&lon=${lon}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return `Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`
    const data = await res.json()
    if (data.places && data.places.length > 0) {
      return data.places[0].display_name
    }
  } catch {
    // fallback
  }
  return `Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`
}

export async function resolveCoordinates(
  query: string | { lat: number; lon: number },
): Promise<{ lat: number; lon: number }> {
  // If already a coordinate object
  if (typeof query === 'object' && query !== null && 'lat' in query && 'lon' in query) {
    const lat = Number(query.lat)
    const lon = Number(query.lon)
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { lat, lon }
    }
  }

  const queryStr = String(query || '').trim()

  // Check if comma-separated lat,lon coordinates (e.g. "21.1837, 79.0681")
  const coordMatch = queryStr.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/)
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1])
    const lon = parseFloat(coordMatch[3])
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { lat, lon }
    }
  }

  // Geocode via internal API
  const places = await searchPlaces(queryStr)
  if (places.length > 0) {
    return {
      lat: parseFloat(places[0].lat),
      lon: parseFloat(places[0].lon),
    }
  }

  throw new Error(`Could not find coordinates for "${queryStr}". Please select an option from suggestions.`)
}

// ── Routing & Safety Integration ─────────────────────────────────────────────

interface BackendRouteData {
  distance_m: number
  duration_s: number
  coordinates: [number, number][] // [lon, lat]
  steps: { instruction: string; distance_m: number; lat: number; lng: number; road_name?: string }[]
}

export async function fetchBackendRoutes(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
  vehicle: Vehicle,
): Promise<{ routes: BackendRouteData[]; isSameLocation?: boolean }> {
  const originParam = `${origin.lat},${origin.lon}`
  const destParam = `${destination.lat},${destination.lon}`
  const url = `/api/route?origin=${encodeURIComponent(originParam)}&destination=${encodeURIComponent(
    destParam,
  )}&vehicle=${encodeURIComponent(vehicle)}`

  const response = await fetch(url)
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    throw new Error(errData.error || `Routing engine error (HTTP ${response.status})`)
  }

  const data = await response.json()
  if (!data.routes || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error('No driving route found between these locations.')
  }

  return data
}

export async function fetchSafetyData(bbox: { south: number; west: number; north: number; east: number }): Promise<OsmDataInput> {
  const url = `/api/safety?south=${bbox.south}&west=${bbox.west}&north=${bbox.north}&east=${bbox.east}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      return {
        features: [],
        status: 'unavailable',
        totalMappedLighting: 0,
      }
    }
    return await res.json()
  } catch {
    return {
      features: [],
      status: 'unavailable',
      totalMappedLighting: 0,
    }
  }
}

// ── In-Memory Session Cache for Instant Safety Recalculation ─────────────────
interface RoutingSessionCache {
  cacheKey: string
  rawRoutes: BackendRouteData[]
  allLeafletCoords: [number, number][][]
  osmData: OsmDataInput
}

let routingSessionCache: RoutingSessionCache | null = null

export async function getRoutes(
  origin: string | { lat: number; lon: number } = 'FC Road, Pune',
  destination: string | { lat: number; lon: number } = 'Deccan Gymkhana, Pune',
  vehicle: Vehicle = 'car',
  time = new Date(),
  selectedFeatures: SafetyFeatureId[] = ['lighting', 'police', 'hospital', 'commercial', 'reports'],
): Promise<Route[]> {
  const isSameLocation =
    typeof origin === 'string' &&
    typeof destination === 'string' &&
    origin.trim().toLowerCase() === destination.trim().toLowerCase()

  if (isSameLocation) {
    const coords = await resolveCoordinates(origin).catch(() => ({ lat: 18.5204, lon: 73.8567 }))
    return [
      {
        id: 'r_same',
        label: 'safest',
        vehicle,
        duration_min: 0,
        distance_km: 0,
        safety_score: 95,
        reasons: [{ type: 'positive', text: 'You are already at your destination.' }],
        segments: [{ coords: [[coords.lat, coords.lon]], score: 95, reason: 'Current location' }],
        steps: [{ instruction: 'You are at your destination', distance_m: 0, lat: coords.lat, lng: coords.lon }],
        safetyFactors: [],
        confidence: 'high',
        confidenceScore: 90,
        confidenceReason: 'Departure and arrival locations are identical.',
        isMeaningfulComparison: false,
        comparisonNote: 'Departure and arrival locations are identical.',
        dataSources: ['Direct Geolocation Verification'],
        limitations: ['Zero distance journey.'],
      },
    ]
  }

  // 1. Resolve coordinates for origin and destination
  const [startCoords, destCoords] = await Promise.all([
    resolveCoordinates(origin),
    resolveCoordinates(destination),
  ])

  const cacheKey = `${startCoords.lat.toFixed(4)},${startCoords.lon.toFixed(4)}->${destCoords.lat.toFixed(4)},${destCoords.lon.toFixed(4)}_${vehicle}`

  let rawRoutes: BackendRouteData[]
  let allLeafletCoords: [number, number][][]
  let osmData: OsmDataInput

  // 2. Reuse session cache for corridors if available (allows instant feature recalculation)
  if (routingSessionCache && routingSessionCache.cacheKey === cacheKey) {
    rawRoutes = routingSessionCache.rawRoutes
    allLeafletCoords = routingSessionCache.allLeafletCoords
    osmData = routingSessionCache.osmData
  } else {
    // Fetch real driving corridors from backend routing engine
    const routeResponse = await fetchBackendRoutes(startCoords, destCoords, vehicle)
    rawRoutes = routeResponse.routes

    // Convert GeoJSON [lon, lat] coordinates to Leaflet [lat, lon]
    allLeafletCoords = rawRoutes.map((r) => osrmToLeafletCoords(r.coordinates))
    const bbox = computeBoundingBox(allLeafletCoords)

    // Fetch civic infrastructure & lighting data for corridor bounding box
    osmData = await fetchSafetyData(bbox)

    // Update in-memory session cache
    routingSessionCache = {
      cacheKey,
      rawRoutes,
      allLeafletCoords,
      osmData,
    }
  }

  const storedReports = getStoredReports()

  // 3. Map each genuine route and assess safety using user-selected features
  const mappedRoutes: Route[] = rawRoutes.map((rawRoute, index) => {
    const leafletCoords = allLeafletCoords[index]
    const distance_km = osrmDistanceToKm(rawRoute.distance_m)
    const drivingMin = osrmDurationToMin(rawRoute.duration_s)

    let duration_min: number
    switch (vehicle) {
      case 'walk':
        duration_min = Math.max(1, Math.round((distance_km / 4.5) * 60))
        break
      case 'cycle':
        duration_min = Math.max(1, Math.round((distance_km / 15) * 60))
        break
      case 'bike':
        duration_min = Math.max(1, Math.round(drivingMin * 0.85))
        break
      case 'car':
      default:
        duration_min = drivingMin
        break
    }

    const safetyAssessment = evaluateRouteSafety(
      leafletCoords,
      distance_km,
      osmData,
      storedReports,
      time,
      selectedFeatures,
    )

    return {
      id: `r_candidate_${index + 1}`,
      label: 'alternative' as RouteLabel,
      duration_min,
      distance_km,
      safety_score: safetyAssessment.safety_score,
      vehicle,
      reasons: safetyAssessment.reasons,
      segments: safetyAssessment.segments,
      steps: rawRoute.steps,
      safetyFactors: safetyAssessment.safetyFactors,
      confidence: safetyAssessment.confidence,
      confidenceScore: safetyAssessment.confidenceScore,
      confidenceReason: safetyAssessment.confidenceReason,
      dataSources: safetyAssessment.dataSources,
      limitations: safetyAssessment.limitations,
    }
  })

  // 4. Transparent labeling: pick distinct Fastest and Safest routes
  if (mappedRoutes.length === 1) {
    mappedRoutes[0].label = 'fastest'
    mappedRoutes[0].isMeaningfulComparison = false
    mappedRoutes[0].comparisonNote =
      'Only one route available on the road network for this journey.'
  } else if (mappedRoutes.length > 1) {
    // Fastest = route with lowest ETA (duration_min)
    const fastestCandidate = [...mappedRoutes].reduce((best, curr) =>
      curr.duration_min < best.duration_min ? curr : best,
    )
    fastestCandidate.label = 'fastest'
    fastestCandidate.isMeaningfulComparison = true
    fastestCandidate.comparisonNote = '⚡ Fastest route to destination'

    // Safest = route with highest safety score.
    // If the fastest route also has the highest score, pick the next-best alternative for Safest.
    const sortedBySafety = [...mappedRoutes].sort((a, b) => {
      if (b.safety_score !== a.safety_score) return b.safety_score - a.safety_score
      return a.duration_min - b.duration_min
    })

    const safestCandidate =
      sortedBySafety[0].id !== fastestCandidate.id
        ? sortedBySafety[0]
        : sortedBySafety.find((r) => r.id !== fastestCandidate.id) || sortedBySafety[1]

    if (safestCandidate) {
      safestCandidate.label = 'safest'
      safestCandidate.isMeaningfulComparison = true
      const timeDiff = safestCandidate.duration_min - fastestCandidate.duration_min
      const scoreDiff = safestCandidate.safety_score - fastestCandidate.safety_score
      safestCandidate.comparisonNote =
        timeDiff > 0
          ? `+${timeDiff} min, safety ${scoreDiff >= 0 ? '+' : ''}${scoreDiff} pts`
          : '🛡️ Highest safety score along distinct corridor'
    }

    // Any other routes are labeled 'alternative'
    for (const route of mappedRoutes) {
      if (route.id !== fastestCandidate.id && route.id !== safestCandidate?.id) {
        route.label = 'alternative'
        route.isMeaningfulComparison = true
        route.comparisonNote = `Alternative route (${route.duration_min} min, safety ${route.safety_score})`
      }
    }
  }

  return mappedRoutes
}

// ── Unsafe Report persistence (localStorage) ─────────────────────────────────
const REPORTS_KEY = 'safesafar:unsafe_reports'

export function getStoredReports(): UnsafeReport[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(REPORTS_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function saveReport(report: Omit<UnsafeReport, 'id' | 'timestamp'>): UnsafeReport {
  const full: UnsafeReport = {
    ...report,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  }
  const existing = getStoredReports()
  localStorage.setItem(REPORTS_KEY, JSON.stringify([full, ...existing].slice(0, 50)))
  return full
}
