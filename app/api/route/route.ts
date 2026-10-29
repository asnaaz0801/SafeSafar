import { NextRequest, NextResponse } from 'next/server'
import { VERIFIED_CIVIC_FEATURES } from '../safety/route'

export interface ApiStep {
  instruction: string
  distance_m: number
  lat: number
  lng: number
  road_name?: string
}

export interface ApiRouteData {
  distance_m: number
  duration_s: number
  coordinates: [number, number][] // [lon, lat]
  steps: ApiStep[]
}

const routesCache = new Map<string, { routes: ApiRouteData[]; timestamp: number }>()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function formatManeuver(step: {
  distance: number
  name: string
  maneuver: { type: string; modifier?: string; location: [number, number] }
}): string {
  const { type, modifier } = step.maneuver
  const roadName = step.name ? ` onto ${step.name}` : ''
  if (type === 'depart') return `Head ${modifier ? modifier + ' ' : ''}towards destination`
  if (type === 'arrive') return 'Arrive at destination'
  if (type === 'turn') return `Turn ${modifier || 'right'}${roadName}`
  if (type === 'new name') return `Continue${roadName}`
  if (type === 'roundabout' || type === 'rotary') return `Take roundabout${roadName}`
  if (type === 'merge') return `Merge${modifier ? ' ' + modifier : ''}${roadName}`
  if (type === 'fork') return `Keep ${modifier || 'straight'}${roadName}`
  if (type === 'end of road') return `Turn ${modifier || 'right'}${roadName}`
  if (modifier) return `Head ${modifier}${roadName}`
  return `Continue${roadName}`
}

const ROUTING_SERVERS = [
  'https://router.project-osrm.org',
  'https://routing.openstreetmap.de/routed-car',
]

/**
 * Generate candidate intermediate waypoints near verified police stations,
 * hospitals, or parallel road corridors between origin and destination.
 */
function findAlternativeWaypoints(
  startLat: number,
  startLon: number,
  destLat: number,
  destLon: number,
): Array<{ lat: number; lon: number; name: string }> {
  const waypoints: Array<{ lat: number; lon: number; name: string }> = []
  const minLat = Math.min(startLat, destLat) - 0.02
  const maxLat = Math.max(startLat, destLat) + 0.02
  const minLon = Math.min(startLon, destLon) - 0.02
  const maxLon = Math.max(startLon, destLon) + 0.02

  const midLat = (startLat + destLat) / 2
  const midLon = (startLon + destLon) / 2

  // 1. Prefer verified civic infrastructure (police stations, hospitals) in between
  for (const f of VERIFIED_CIVIC_FEATURES) {
    if (f.lat >= minLat && f.lat <= maxLat && f.lon >= minLon && f.lon <= maxLon) {
      const dStart = Math.hypot(f.lat - startLat, f.lon - startLon)
      const dDest = Math.hypot(f.lat - destLat, f.lon - destLon)
      // Must be decently spaced from start and dest to create a meaningful alternative
      if (dStart > 0.005 && dDest > 0.005) {
        waypoints.push({ lat: f.lat, lon: f.lon, name: f.name || f.category })
      }
    }
  }

  // 2. Add orthogonal lateral waypoints along parallel arteries
  const dLat = destLat - startLat
  const dLon = (destLon - startLon) * Math.cos((midLat * Math.PI) / 180)
  const dist = Math.hypot(dLat, dLon)

  if (dist > 0.002) {
    const perpLat = -dLon / dist
    const perpLon = (dLat / dist) / Math.cos((midLat * Math.PI) / 180)
    const offset = Math.min(0.016, Math.max(0.006, dist * 0.28))

    waypoints.push({
      lat: Number((midLat + perpLat * offset).toFixed(5)),
      lon: Number((midLon + perpLon * offset).toFixed(5)),
      name: 'Main Arterial Avenue (East/North)',
    })
    waypoints.push({
      lat: Number((midLat - perpLat * offset).toFixed(5)),
      lon: Number((midLon - perpLon * offset).toFixed(5)),
      name: 'Main Arterial Avenue (West/South)',
    })
  }

  return waypoints
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const originParam = searchParams.get('origin')
    const destParam = searchParams.get('destination')
    const vehicle = searchParams.get('vehicle') || 'car'

    if (!originParam || !destParam) {
      return NextResponse.json(
        { error: 'Origin and destination parameters are required (format: lat,lon)' },
        { status: 400 },
      )
    }

    const [startLatStr, startLonStr] = originParam.split(',')
    const [destLatStr, destLonStr] = destParam.split(',')

    const startLat = parseFloat(startLatStr?.trim())
    const startLon = parseFloat(startLonStr?.trim())
    const destLat = parseFloat(destLatStr?.trim())
    const destLon = parseFloat(destLonStr?.trim())

    if (isNaN(startLat) || isNaN(startLon) || isNaN(destLat) || isNaN(destLon)) {
      return NextResponse.json(
        { error: 'Invalid origin or destination coordinates. Must be numeric lat,lon.' },
        { status: 400 },
      )
    }

    if (
      startLat < -90 ||
      startLat > 90 ||
      destLat < -90 ||
      destLat > 90 ||
      startLon < -180 ||
      startLon > 180 ||
      destLon < -180 ||
      destLon > 180
    ) {
      return NextResponse.json({ error: 'Coordinates out of geographical bounds' }, { status: 400 })
    }

    // Check if origin and destination are effectively the same location
    const dLat = Math.abs(startLat - destLat)
    const dLon = Math.abs(startLon - destLon)
    if (dLat < 0.0001 && dLon < 0.0001) {
      return NextResponse.json({
        routes: [
          {
            distance_m: 0,
            duration_s: 0,
            coordinates: [[startLon, startLat]],
            steps: [
              {
                instruction: 'You are at your destination',
                distance_m: 0,
                lat: startLat,
                lng: startLon,
              },
            ],
          },
        ],
        isSameLocation: true,
      })
    }

    const cacheKey = `${startLat.toFixed(4)},${startLon.toFixed(4)}_${destLat.toFixed(4)},${destLon.toFixed(4)}_${vehicle}`
    const cached = routesCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ routes: cached.routes, cached: true })
    }

    let lastError: string | undefined
    let rawRoutes: Array<{
      distance: number
      duration: number
      geometry: { coordinates: [number, number][] }
      legs: Array<{
        distance: number
        duration: number
        steps: Array<{
          distance: number
          duration: number
          name: string
          maneuver: { type: string; modifier?: string; location: [number, number] }
        }>
      }>
    }> | null = null

    // Attempt routing servers with strict timeout
    for (const server of ROUTING_SERVERS) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 6500)

        // Request driving corridors with real alternatives (up to 3 genuine alternatives)
        const url = `${server}/route/v1/driving/${startLon},${startLat};${destLon},${destLat}?overview=full&geometries=geojson&alternatives=3&steps=true`

        const res = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'SafeSafar-Civic-Navigation/1.0 (contact: support@safesafar.app)',
          },
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (!res.ok) {
          lastError = `Routing server ${server} returned HTTP ${res.status}`
          continue
        }

        const data = await res.json()
        if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
          rawRoutes = data.routes
          break
        } else {
          lastError = data.message || `Routing returned code: ${data.code}`
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err)
      }
    }

    if (!rawRoutes || rawRoutes.length === 0) {
      return NextResponse.json(
        {
          error:
            lastError ||
            'No drivable route found between these locations. Please check that roads connect both points.',
        },
        { status: 404 },
      )
    }

    // If routing engine only returned 1 route, query via verified civic landmarks / parallel corridors
    if (rawRoutes.length === 1) {
      const candidateWaypoints = findAlternativeWaypoints(startLat, startLon, destLat, destLon)
      const primaryDist = rawRoutes[0].distance

      for (const server of ROUTING_SERVERS) {
        if (rawRoutes.length >= 2) break

        for (const wp of candidateWaypoints) {
          if (rawRoutes.length >= 2) break
          try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 4500)
            const wpUrl = `${server}/route/v1/driving/${startLon},${startLat};${wp.lon},${wp.lat};${destLon},${destLat}?overview=full&geometries=geojson&steps=true`

            const res = await fetch(wpUrl, {
              headers: {
                Accept: 'application/json',
                'User-Agent': 'SafeSafar-Civic-Navigation/1.0 (contact: support@safesafar.app)',
              },
              signal: controller.signal,
            })
            clearTimeout(timeoutId)

            if (res.ok) {
              const wpData = await res.json()
              if (wpData.code === 'Ok' && Array.isArray(wpData.routes) && wpData.routes.length > 0) {
                const alt = wpData.routes[0]
                const distDiff = Math.abs(alt.distance - primaryDist)
                // Distinct alternative if distance differs by > 80m and duration within 2.2x
                if (distDiff > 80 && alt.duration < rawRoutes[0].duration * 2.2) {
                  rawRoutes.push(alt)
                }
              }
            }
          } catch {
            // Try next candidate
          }
        }
      }
    }

    // Map each real route returned by the routing engine
    const mappedRoutes: ApiRouteData[] = rawRoutes.map((r) => {
      const steps: ApiStep[] = (r.legs || []).flatMap((leg) =>
        (leg.steps || []).map((s) => ({
          instruction: formatManeuver(s),
          distance_m: Math.round(s.distance),
          lat: s.maneuver.location[1],
          lng: s.maneuver.location[0],
          road_name: s.name,
        })),
      )

      return {
        distance_m: Math.round(r.distance),
        duration_s: Math.round(r.duration),
        coordinates: r.geometry.coordinates,
        steps:
          steps.length > 0
            ? steps
            : [
                {
                  instruction: 'Head towards destination',
                  distance_m: Math.round(r.distance),
                  lat: startLat,
                  lng: startLon,
                },
                { instruction: 'Arrive at destination', distance_m: 0, lat: destLat, lng: destLon },
              ],
      }
    })

    routesCache.set(cacheKey, { routes: mappedRoutes, timestamp: Date.now() })

    return NextResponse.json({
      routes: mappedRoutes,
      count: mappedRoutes.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal routing engine error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

