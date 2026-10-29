/** Haversine distance between two lat/lng points in metres */
export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Compass bearing from point A to point B in degrees (0 = North) */
export function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** Format metres as readable distance */
export function formatDist(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`
}

/** Convert OSRM GeoJSON [longitude, latitude] coordinates to Leaflet [latitude, longitude] */
export function osrmToLeafletCoords(coords: [number, number][]): [number, number][] {
  return coords.map(([lon, lat]) => [lat, lon])
}

/** Convert metres to kilometres with 1 decimal place */
export function osrmDistanceToKm(metres: number): number {
  return Number((metres / 1000).toFixed(1))
}

/** Convert seconds to rounded minutes (minimum 1 min) */
export function osrmDurationToMin(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60))
}

/**
 * Shortest distance in metres from a point (pLat, pLng) to a line segment (aLat, aLng) -> (bLat, bLng).
 * Uses equirectangular projection for fast segment projection, then Haversine for exact distance.
 */
export function pointToSegmentDistanceMetres(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = bLat - aLat
  const cosMean = Math.cos(((aLat + bLat) * Math.PI) / 360)
  const dLng = (bLng - aLng) * cosMean

  const segLenSq = dLat * dLat + dLng * dLng
  if (segLenSq === 0) {
    return haversineMetres(pLat, pLng, aLat, aLng)
  }

  const pDLat = pLat - aLat
  const pDLng = (pLng - aLng) * cosMean

  const t = Math.max(0, Math.min(1, (pDLat * dLat + pDLng * dLng) / segLenSq))
  const projLat = aLat + t * dLat
  const projLng = aLng + t * (bLng - aLng)

  return haversineMetres(pLat, pLng, projLat, projLng)
}

/**
 * Shortest distance in metres from a point (pLat, pLng) to any segment of a polyline.
 */
export function distanceToPolylineMetres(
  pLat: number,
  pLng: number,
  polyline: [number, number][],
): number {
  if (polyline.length === 0) return Infinity
  if (polyline.length === 1) return haversineMetres(pLat, pLng, polyline[0][0], polyline[0][1])

  let minDistance = Infinity
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = pointToSegmentDistanceMetres(
      pLat,
      pLng,
      polyline[i][0],
      polyline[i][1],
      polyline[i + 1][0],
      polyline[i + 1][1],
    )
    if (d < minDistance) {
      minDistance = d
      if (minDistance < 2) break
    }
  }
  return minDistance
}

export interface BoundingBox {
  south: number
  west: number
  north: number
  east: number
}

/**
 * Compute bounding box enclosing an array of polylines plus a buffer (in degrees, ~0.007 ≈ 750m).
 */
export function computeBoundingBox(
  routesCoords: [number, number][][],
  bufferDegrees = 0.007,
): BoundingBox {
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity

  for (const coords of routesCoords) {
    for (const [lat, lng] of coords) {
      if (lat < south) south = lat
      if (lat > north) north = lat
      if (lng < west) west = lng
      if (lng > east) east = lng
    }
  }

  if (south === Infinity) {
    return { south: 18.51, west: 73.84, north: 18.53, east: 73.87 }
  }

  return {
    south: Number((south - bufferDegrees).toFixed(5)),
    west: Number((west - bufferDegrees).toFixed(5)),
    north: Number((north + bufferDegrees).toFixed(5)),
    east: Number((east + bufferDegrees).toFixed(5)),
  }
}


