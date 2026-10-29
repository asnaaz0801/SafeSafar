import { NextRequest, NextResponse } from 'next/server'

export interface GeocodePlace {
  display_name: string
  lat: string
  lon: string
  name?: string
  city?: string
  state?: string
  postcode?: string
  source?: 'curated' | 'nominatim' | 'photon'
}

// In-memory server cache
const geocodeCache = new Map<string, { places: GeocodePlace[]; timestamp: number }>()
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

// Curated high-accuracy landmarks for Nagpur, Pune, and major Maharashtra urban centers
const CURATED_PLACES: Array<{
  keywords: string[]
  display_name: string
  lat: string
  lon: string
  city: string
  state: string
}> = [
  // Nagpur Localities & Landmarks
  {
    keywords: ['jafar nagar', 'jaffar nagar', 'jafar nagar nagpur'],
    display_name: 'Jafar Nagar, Mankapur, Nagpur, Maharashtra, 440013, India',
    lat: '21.1837',
    lon: '79.0681',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['sitabuldi', 'sitabuldi nagpur', 'buldi'],
    display_name: 'Sitabuldi, Nagpur, Maharashtra, 440012, India',
    lat: '21.1444',
    lon: '79.0833',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['sadar', 'sadar nagpur', 'sadar bazar nagpur'],
    display_name: 'Sadar, Nagpur, Maharashtra, 440001, India',
    lat: '21.1610',
    lon: '79.0839',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['dharampeth', 'dharampeth nagpur'],
    display_name: 'Dharampeth, Nagpur, Maharashtra, 440010, India',
    lat: '21.1410',
    lon: '79.0624',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['vnit', 'vnit nagpur', 'visvesvaraya national institute of technology'],
    display_name: 'VNIT Nagpur, South Ambazari Road, Nagpur, Maharashtra, 440010, India',
    lat: '21.1255',
    lon: '79.0515',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['ramdaspeth', 'ramdaspeth nagpur'],
    display_name: 'Ramdaspeth, Nagpur, Maharashtra, 440010, India',
    lat: '21.1350',
    lon: '79.0720',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['civil lines', 'civil lines nagpur'],
    display_name: 'Civil Lines, Nagpur, Maharashtra, 440001, India',
    lat: '21.1550',
    lon: '79.0710',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['manish nagar', 'manish nagar nagpur'],
    display_name: 'Manish Nagar, Somalwada, Nagpur, Maharashtra, 440015, India',
    lat: '21.0920',
    lon: '79.0740',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['mankapur', 'mankapur nagpur', 'mankapur stadium'],
    display_name: 'Mankapur, Nagpur, Maharashtra, 440030, India',
    lat: '21.1920',
    lon: '79.0720',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['trimurti nagar', 'trimurti nagar nagpur'],
    display_name: 'Trimurti Nagar, Nagpur, Maharashtra, 440022, India',
    lat: '21.1150',
    lon: '79.0430',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['medical square', 'gmc nagpur', 'government medical college nagpur'],
    display_name: 'Medical Square, Hanuman Nagar, Nagpur, Maharashtra, 440009, India',
    lat: '21.1320',
    lon: '79.0980',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['nagpur railway station', 'nagpur junction', 'nagpur station'],
    display_name: 'Nagpur Junction Railway Station, Sitabuldi, Nagpur, Maharashtra, 440001, India',
    lat: '21.1524',
    lon: '79.0886',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['nagpur airport', 'dr babasaheb ambedkar international airport', 'nagpur aerodrome'],
    display_name: 'Dr. Babasaheb Ambedkar International Airport, Sonegaon, Nagpur, Maharashtra, 440005, India',
    lat: '21.0922',
    lon: '79.0472',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['wardha road', 'wardha road nagpur'],
    display_name: 'Wardha Road, Somalwada, Nagpur, Maharashtra, 440015, India',
    lat: '21.0850',
    lon: '79.0620',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['mahal', 'mahal nagpur'],
    display_name: 'Mahal, Nagpur, Maharashtra, 440032, India',
    lat: '21.1460',
    lon: '79.1120',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['gandhibagh', 'gandhibagh nagpur'],
    display_name: 'Gandhibagh, Nagpur, Maharashtra, 440002, India',
    lat: '21.1500',
    lon: '79.1050',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['seminary hills', 'seminary hills nagpur'],
    display_name: 'Seminary Hills, Nagpur, Maharashtra, 440006, India',
    lat: '21.1680',
    lon: '79.0550',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['it park nagpur', 'gayatri nagar nagpur'],
    display_name: 'IT Park, Gayatri Nagar, Nagpur, Maharashtra, 440022, India',
    lat: '21.1210',
    lon: '79.0490',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['bajaj nagar', 'bajaj nagar nagpur'],
    display_name: 'Bajaj Nagar, Nagpur, Maharashtra, 440010, India',
    lat: '21.1290',
    lon: '79.0640',
    city: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    keywords: ['dhantoli', 'dhantoli nagpur'],
    display_name: 'Dhantoli, Nagpur, Maharashtra, 440012, India',
    lat: '21.1350',
    lon: '79.0850',
    city: 'Nagpur',
    state: 'Maharashtra',
  },

  // Pune Localities & Landmarks
  {
    keywords: ['fc road', 'fergusson college road', 'fc road pune'],
    display_name: 'FC Road (Fergusson College Rd), Shivajinagar, Pune, Maharashtra, 411004, India',
    lat: '18.5204',
    lon: '73.8567',
    city: 'Pune',
    state: 'Maharashtra',
  },
  {
    keywords: ['deccan gymkhana', 'deccan', 'deccan pune'],
    display_name: 'Deccan Gymkhana, Pune, Maharashtra, 411004, India',
    lat: '18.5260',
    lon: '73.8650',
    city: 'Pune',
    state: 'Maharashtra',
  },
  {
    keywords: ['shivajinagar', 'shivajinagar pune'],
    display_name: 'Shivajinagar, Pune, Maharashtra, 411005, India',
    lat: '18.5314',
    lon: '73.8446',
    city: 'Pune',
    state: 'Maharashtra',
  },
  {
    keywords: ['kothrud', 'kothrud pune'],
    display_name: 'Kothrud, Pune, Maharashtra, 411038, India',
    lat: '18.5074',
    lon: '73.8077',
    city: 'Pune',
    state: 'Maharashtra',
  },
  {
    keywords: ['viman nagar', 'viman nagar pune'],
    display_name: 'Viman Nagar, Pune, Maharashtra, 411014, India',
    lat: '18.5679',
    lon: '73.9143',
    city: 'Pune',
    state: 'Maharashtra',
  },
  {
    keywords: ['hinjawadi', 'hinjewadi', 'hinjawadi pune'],
    display_name: 'Hinjawadi IT Park, Pune, Maharashtra, 411057, India',
    lat: '18.5913',
    lon: '73.7389',
    city: 'Pune',
    state: 'Maharashtra',
  },
  {
    keywords: ['baner', 'baner pune'],
    display_name: 'Baner, Pune, Maharashtra, 411045, India',
    lat: '18.5590',
    lon: '73.7868',
    city: 'Pune',
    state: 'Maharashtra',
  },
  {
    keywords: ['swargate', 'swargate pune'],
    display_name: 'Swargate, Pune, Maharashtra, 411042, India',
    lat: '18.5018',
    lon: '73.8586',
    city: 'Pune',
    state: 'Maharashtra',
  },
  {
    keywords: ['pune station', 'pune railway station', 'pune junction'],
    display_name: 'Pune Junction Railway Station, Agarkar Nagar, Pune, Maharashtra, 411001, India',
    lat: '18.5284',
    lon: '73.8744',
    city: 'Pune',
    state: 'Maharashtra',
  },
]

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')?.trim()
    const reverse = searchParams.get('reverse') === 'true'
    const latParam = searchParams.get('lat')
    const lonParam = searchParams.get('lon')

    // ── Reverse geocoding mode ───────────────────────────────────────────────
    if (reverse && latParam && lonParam) {
      const lat = parseFloat(latParam)
      const lon = parseFloat(lonParam)
      if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return NextResponse.json({ error: 'Invalid latitude or longitude coordinates' }, { status: 400 })
      }

      const reverseCacheKey = `rev_${lat.toFixed(4)}_${lon.toFixed(4)}`
      const cached = geocodeCache.get(reverseCacheKey)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return NextResponse.json({ places: cached.places })
      }

      // Check curated places nearest to coordinates
      for (const p of CURATED_PLACES) {
        const pLat = parseFloat(p.lat)
        const pLon = parseFloat(p.lon)
        const dLat = Math.abs(pLat - lat)
        const dLon = Math.abs(pLon - lon)
        if (dLat < 0.005 && dLon < 0.005) {
          const match: GeocodePlace = {
            display_name: p.display_name,
            lat: p.lat,
            lon: p.lon,
            city: p.city,
            state: p.state,
            source: 'curated',
          }
          return NextResponse.json({ places: [match] })
        }
      }

      // Query Nominatim reverse geocoder
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 4500)
        const nomRevUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`
        const nomRevRes = await fetch(nomRevUrl, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'SafeSafar-Civic-Navigation/1.0 (contact: support@safesafar.app)',
          },
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (nomRevRes.ok) {
          const data = await nomRevRes.json()
          if (data && data.display_name) {
            const place: GeocodePlace = {
              display_name: data.display_name,
              lat: String(lat),
              lon: String(lon),
              city: data.address?.city || data.address?.town || data.address?.suburb,
              state: data.address?.state,
              postcode: data.address?.postcode,
              source: 'nominatim',
            }
            geocodeCache.set(reverseCacheKey, { places: [place], timestamp: Date.now() })
            return NextResponse.json({ places: [place] })
          }
        }
      } catch {
        // Fallback to formatted coordinate representation
      }

      const fallbackPlace: GeocodePlace = {
        display_name: `Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
        lat: String(lat),
        lon: String(lon),
        source: 'curated',
      }
      return NextResponse.json({ places: [fallbackPlace] })
    }

    // ── Forward search mode ──────────────────────────────────────────────────
    if (!query || query.length < 2) {
      return NextResponse.json({ places: [] })
    }

    if (query.length > 200) {
      return NextResponse.json({ error: 'Search query too long' }, { status: 400 })
    }

    // Check direct coordinates (e.g., "21.1458, 79.0882")
    const coordMatch = query.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/)
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1])
      const lon = parseFloat(coordMatch[3])
      if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return NextResponse.json({
          places: [
            {
              display_name: `Coordinates (${lat.toFixed(5)}, ${lon.toFixed(5)})`,
              lat: String(lat),
              lon: String(lon),
              source: 'curated',
            },
          ],
        })
      }
    }

    const cacheKey = `search_${query.toLowerCase()}`
    const cached = geocodeCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ places: cached.places, cached: true })
    }

    const results: GeocodePlace[] = []
    const seen = new Set<string>()

    function addResult(place: GeocodePlace) {
      const latN = parseFloat(place.lat)
      const lonN = parseFloat(place.lon)
      if (isNaN(latN) || isNaN(lonN)) return
      const key = `${latN.toFixed(4)},${lonN.toFixed(4)}`
      if (!seen.has(key)) {
        seen.add(key)
        results.push(place)
      }
    }

    // 1. Curated local database matching (instant & 100% reliable for Nagpur & Pune)
    const lowerQuery = query.toLowerCase()
    for (const c of CURATED_PLACES) {
      const match = c.keywords.some(
        (kw) => lowerQuery.includes(kw) || kw.includes(lowerQuery) || lowerQuery.startsWith(kw),
      )
      if (match) {
        addResult({
          display_name: c.display_name,
          lat: c.lat,
          lon: c.lon,
          city: c.city,
          state: c.state,
          source: 'curated',
        })
      }
    }

    // 2. Query OpenStreetMap Nominatim with strict server User-Agent and timeout
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 4500)

      // If user typed a locality without city, search with India context
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query,
      )}&limit=8&countrycodes=in&addressdetails=1`

      const nomResponse = await fetch(nomUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SafeSafar-Civic-Navigation/1.0 (contact: support@safesafar.app)',
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (nomResponse.ok) {
        const items = await nomResponse.json()
        if (Array.isArray(items)) {
          for (const item of items) {
            addResult({
              display_name: item.display_name,
              lat: item.lat,
              lon: item.lon,
              city: item.address?.city || item.address?.town || item.address?.state_district,
              state: item.address?.state,
              postcode: item.address?.postcode,
              source: 'nominatim',
            })
          }
        }
      }
    } catch {
      // Continue to Photon fallback
    }

    // 3. Fallback to Komoot Photon (OSM Elasticsearch geocoder with India bias)
    if (results.length < 3) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 4000)

        // Photon query biased towards central India (Nagpur 21.1458, 79.0882)
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(
          query,
        )}&lat=21.1458&lon=79.0882&limit=8`

        const photonResponse = await fetch(photonUrl, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (photonResponse.ok) {
          const photonData = await photonResponse.json()
          if (photonData?.features && Array.isArray(photonData.features)) {
            for (const f of photonData.features) {
              const p = f.properties || {}
              const coords = f.geometry?.coordinates
              if (coords && coords.length >= 2) {
                // If country is specified, prefer India
                if (
                  p.country &&
                  p.country.toLowerCase() !== 'india' &&
                  p.countrycode &&
                  p.countrycode.toUpperCase() !== 'IN'
                ) {
                  continue
                }
                const parts = [p.name, p.street, p.district, p.city, p.state, p.postcode, p.country || 'India'].filter(
                  Boolean,
                )
                const fullAddress = parts.join(', ')
                addResult({
                  display_name: fullAddress,
                  lat: String(coords[1]),
                  lon: String(coords[0]),
                  city: p.city || p.district,
                  state: p.state,
                  postcode: p.postcode,
                  source: 'photon',
                })
              }
            }
          }
        }
      } catch {
        // Fallback complete
      }
    }

    // Save in cache
    geocodeCache.set(cacheKey, { places: results, timestamp: Date.now() })

    return NextResponse.json({ places: results })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal geocoding error'
    return NextResponse.json({ error: message, places: [] }, { status: 500 })
  }
}

