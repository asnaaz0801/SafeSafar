'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState, useRef } from 'react'
import {
  getRoutes,
  searchPlaces,
  reverseGeocode,
  resolveCoordinates,
  type Route,
  type Vehicle,
  type Place,
} from '@/lib/api'
import { useGeolocation } from '@/lib/useGeolocation'
import { RouteCard } from '@/components/RouteCard'
import { SosModal } from '@/components/SosModal'
import { SafetyGauge } from '@/components/SafetyGauge'
import { UnsafeReportModal } from '@/components/UnsafeReportModal'
import { NavigationPanel } from '@/components/NavigationPanel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Activity,
  AlertTriangle,
  Bell,
  Car,
  Map,
  MapPin,
  Navigation,
  Bike,
  ShieldCheck,
  Siren,
  Footprints,
  RotateCcw,
  Settings2,
  ChevronDown,
  X,
  Clock,
  Info,
  LocateFixed,
  Loader2,
  Search,
  Sparkles,
  Zap,
  Check,
  SlidersHorizontal,
  Layers,
} from 'lucide-react'
import { safetyLabel, SAFETY_FEATURES, type SafetyFeatureId } from '@/lib/safety'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

type AppView = 'dashboard' | 'map'

const vehicles: { id: Vehicle; label: string; icon: typeof Car }[] = [
  { id: 'walk', label: 'Walk', icon: Footprints },
  { id: 'cycle', label: 'Cycle', icon: Bike },
  { id: 'bike', label: 'Bike', icon: Bike },
  { id: 'car', label: 'Car', icon: Car },
]

// ── Helper Sub-Components ────────────────────────────────────────────────────

function PlaceField({
  label,
  value,
  onChange,
  onFocus,
  onKeyDown,
  icon: Icon = MapPin,
  actionButton,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onFocus: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  icon?: typeof MapPin
  actionButton?: React.ReactNode
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        {actionButton}
      </div>
      <div className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 transition-all">
        <Icon className="size-4 text-primary shrink-0" aria-hidden />
        <input
          aria-label={label}
          value={value}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-muted-foreground"
          placeholder={placeholder ?? `Enter ${label.toLowerCase()}…`}
        />
      </div>
    </label>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof ShieldCheck
  label: string
  value: string
  note: string
  tone?: 'green' | 'amber' | 'red'
}) {
  const iconColor =
    tone === 'amber'
      ? 'text-amber-500'
      : tone === 'green'
      ? 'text-emerald-500'
      : tone === 'red'
      ? 'text-red-500'
      : 'text-primary'
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className={`size-5 ${iconColor}`} aria-hidden />
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  )
}

function ActivityRow({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof MapPin
  title: string
  detail: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 shrink-0">
        <Icon className="size-4" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

// ── Main Page Component ──────────────────────────────────────────────────────

export default function Page() {
  // Device Geolocation Hook
  const {
    status: geoStatus,
    lat: geoLat,
    lng: geoLng,
    accuracy: geoAccuracy,
    errorMessage: geoError,
    requestLocation,
    clearError: clearGeoError,
  } = useGeolocation()

  // Location search inputs & validated coordinates (Default to Nagpur: Jafar Nagar -> Sitabuldi)
  const [fromInput, setFromInput] = useState('Jafar Nagar, Nagpur')
  const [toInput, setToInput] = useState('Sitabuldi, Nagpur')

  const [activeOrigin, setActiveOrigin] = useState<{
    label: string
    coords: { lat: number; lon: number }
  }>({
    label: 'Jafar Nagar, Nagpur',
    coords: { lat: 21.1837, lon: 79.0681 },
  })

  const [activeDest, setActiveDest] = useState<{
    label: string
    coords: { lat: number; lon: number }
  }>({
    label: 'Sitabuldi, Nagpur',
    coords: { lat: 21.1444, lon: 79.0833 },
  })

  // Autocomplete suggestions state
  const [suggestions, setSuggestions] = useState<Place[]>([])
  const [activeField, setActiveField] = useState<'from' | 'to' | null>(null)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [noSuggestionsFound, setNoSuggestionsFound] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Routes state
  const [routes, setRoutes] = useState<Route[]>([])
  const [selected, setSelected] = useState<string>('')
  const [vehicle, setVehicle] = useState<Vehicle>('car')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // User-selected safety priorities for personalized scoring
  const [selectedFeatures, setSelectedFeatures] = useState<SafetyFeatureId[]>([
    'lighting',
    'police',
    'hospital',
    'commercial',
    'reports',
  ])

  // Trip settings
  const [showSettings, setShowSettings] = useState(false)
  const [mileage, setMileage] = useState(15)
  const [petrolPrice, setPetrolPrice] = useState(105)

  // UI views / modals
  const [view, setView] = useState<AppView>('dashboard')
  const [showSos, setShowSos] = useState(false)
  const [showAllRoutes, setShowAllRoutes] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [showDemoDisclaimer, setShowDemoDisclaimer] = useState(true)

  // Navigation & Reports
  const [pendingReport, setPendingReport] = useState<{ lat: number; lng: number } | null>(null)
  const [navigating, setNavigating] = useState(false)

  // Reverse geocode current location when GPS succeeds
  useEffect(() => {
    if (geoStatus === 'ok' && geoLat !== undefined && geoLng !== undefined) {
      const coords = { lat: geoLat, lon: geoLng }
      reverseGeocode(geoLat, geoLng).then((addr) => {
        setFromInput(addr)
        setActiveOrigin({ label: addr, coords })
      })
    }
  }, [geoStatus, geoLat, geoLng])

  // Debounced Autocomplete for From / To inputs
  useEffect(() => {
    if (!activeField) {
      setSuggestions([])
      setNoSuggestionsFound(false)
      return
    }

    const currentQuery = activeField === 'from' ? fromInput : toInput
    const trimmed = currentQuery.trim()

    if (trimmed.length < 2) {
      setSuggestions([])
      setNoSuggestionsFound(false)
      return
    }

    setSuggestionsLoading(true)
    setNoSuggestionsFound(false)

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

    searchTimeoutRef.current = setTimeout(() => {
      searchPlaces(trimmed)
        .then((places) => {
          setSuggestions(places)
          setNoSuggestionsFound(places.length === 0)
        })
        .catch(() => {
          setSuggestions([])
          setNoSuggestionsFound(true)
        })
        .finally(() => {
          setSuggestionsLoading(false)
        })
    }, 300)

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [fromInput, toInput, activeField])

  // Fetch Routes whenever committed origin, destination, vehicle, or safety preferences change
  useEffect(() => {
    if (!activeOrigin.coords || !activeDest.coords) return

    setLoading(true)
    setError(null)

    getRoutes(activeOrigin.coords, activeDest.coords, vehicle, new Date(), selectedFeatures)
      .then((loadedRoutes) => {
        setRoutes(loadedRoutes)
        // If user has active safety priorities, default selection to safest route; otherwise fastest
        if (selectedFeatures.length > 0) {
          const safest = [...loadedRoutes].reduce((best, curr) =>
            curr.safety_score > best.safety_score ? curr : best,
            loadedRoutes[0],
          )
          if (safest) setSelected(safest.id)
        } else if (loadedRoutes.length > 0) {
          const fastest = [...loadedRoutes].reduce((best, curr) =>
            curr.duration_min < best.duration_min ? curr : best,
            loadedRoutes[0],
          )
          if (fastest) setSelected(fastest.id)
        }
      })
      .catch((err) => {
        setRoutes([])
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to calculate driving routes. Please check your network connection.',
        )
      })
      .finally(() => setLoading(false))
  }, [activeOrigin, activeDest, vehicle, selectedFeatures])

  // Derived Route Calculations
  const fastestRoute = useMemo(() => {
    if (!routes.length) return null
    return [...routes].reduce((best, curr) =>
      curr.duration_min < best.duration_min ? curr : best,
    )
  }, [routes])

  const safestRoute = useMemo(() => {
    if (!routes.length || selectedFeatures.length === 0 || !fastestRoute) return null
    // If only one route exists, do not duplicate into safestRoute
    if (routes.length === 1) return null

    // Sort by safety score descending, with lower duration as tiebreaker
    const sorted = [...routes].sort((a, b) => {
      if (b.safety_score !== a.safety_score) return b.safety_score - a.safety_score
      return a.duration_min - b.duration_min
    })

    // If top safety route is distinct from fastest, return it
    if (sorted[0].id !== fastestRoute.id) {
      return sorted[0]
    }

    // If the fastest route also had the top safety score, pick the next-best alternative
    const nextBest = sorted.find((r) => r.id !== fastestRoute.id)
    return nextBest || null
  }, [routes, selectedFeatures, fastestRoute])

  const isFastestAndSafestSame = false

  const selectedRoute = useMemo(
    () => routes.find((r) => r.id === selected) ?? safestRoute ?? fastestRoute ?? routes[0],
    [routes, selected, safestRoute, fastestRoute],
  )

  const avgSafety =
    routes.length && selectedFeatures.length > 0
      ? Math.round(routes.reduce((sum, r) => sum + r.safety_score, 0) / routes.length)
      : 0

  function toggleFeature(id: SafetyFeatureId) {
    setSelectedFeatures((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    )
  }

  // ── Actions & Handlers ─────────────────────────────────────────────────────

  function swap() {
    const prevFromInput = fromInput
    const prevOrigin = activeOrigin
    setFromInput(toInput)
    setActiveOrigin(activeDest)
    setToInput(prevFromInput)
    setActiveDest(prevOrigin)
    setSuggestions([])
    setActiveField(null)
  }

  function chooseSuggestion(place: Place) {
    const coords = { lat: parseFloat(place.lat), lon: parseFloat(place.lon) }
    if (activeField === 'from') {
      setFromInput(place.display_name)
      setActiveOrigin({ label: place.display_name, coords })
    } else {
      setToInput(place.display_name)
      setActiveDest({ label: place.display_name, coords })
    }
    setSuggestions([])
    setNoSuggestionsFound(false)
    setActiveField(null)
  }

  async function handleManualSearch() {
    setSuggestions([])
    setActiveField(null)
    setLoading(true)
    setError(null)

    try {
      const [resolvedFrom, resolvedTo] = await Promise.all([
        resolveCoordinates(fromInput),
        resolveCoordinates(toInput),
      ])
      setActiveOrigin({ label: fromInput, coords: resolvedFrom })
      setActiveDest({ label: toInput, coords: resolvedTo })
    } catch (err) {
      setLoading(false)
      setError(
        err instanceof Error
          ? err.message
          : 'Could not resolve one of the entered locations. Please select from search suggestions.',
      )
    }
  }

  function closeSuggestions() {
    setSuggestions([])
    setNoSuggestionsFound(false)
    setActiveField(null)
  }

  function handleReport(lat: number, lng: number) {
    setPendingReport({ lat, lng })
  }

  // ── Full-Screen Interactive Map View ───────────────────────────────────────
  if (view === 'map') {
    return (
      <main className="relative h-dvh overflow-hidden bg-background">
        {/* Map Container */}
        <div className="absolute inset-0">
          <MapView
            routes={routes}
            selectedId={selected}
            onReport={handleReport}
            currentLocation={
              geoLat !== undefined && geoLng !== undefined
                ? { lat: geoLat, lng: geoLng, accuracy: geoAccuracy }
                : null
            }
          />
        </div>

        {/* Top Control Bar */}
        <div className="absolute left-4 right-4 top-4 z-10 mx-auto flex max-w-lg items-center justify-between gap-3">
          <Button
            variant="secondary"
            className="rounded-full bg-white shadow-lg hover:bg-slate-50 font-semibold gap-2 border text-slate-800"
            onClick={() => setView('dashboard')}
          >
            <ShieldCheck className="size-4 text-primary" />
            Dashboard
          </Button>
          <div className="flex items-center gap-2">
            <Button
              className="rounded-full bg-red-600 text-white hover:bg-red-700 shadow-lg gap-2 font-semibold"
              onClick={() => setShowSos(true)}
            >
              <Siren className="size-4" />
              SOS
            </Button>
          </div>
        </div>

        {/* Route Selector Pills */}
        {routes.length > 0 && (
          <div className="absolute left-4 right-4 top-16 z-10 mx-auto flex max-w-lg gap-2 overflow-x-auto pb-1 no-scrollbar">
            {routes.map((r) => {
              const isActive = r.id === selected
              const isFastest = r.id === fastestRoute?.id
              const isSafest = r.id === safestRoute?.id

              return (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold shadow transition-all ${
                    isActive
                      ? 'bg-primary text-white ring-2 ring-primary/30'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border'
                  }`}
                >
                  {isSafest && isFastest
                    ? '⚡🛡️ Fastest & Safest'
                    : isSafest
                    ? '🛡️ Safest'
                    : isFastest
                    ? '⚡ Fastest'
                    : 'Alternative'}{' '}
                  · {r.duration_min} min · {r.safety_score}/100
                </button>
              )
            })}
          </div>
        )}

        {/* Turn-by-Turn Navigation Panel */}
        {navigating && selectedRoute && (
          <NavigationPanel route={selectedRoute} onStop={() => setNavigating(false)} />
        )}

        {/* Start Navigation Action Button */}
        {!navigating && selectedRoute && (
          <div className="absolute bottom-6 left-4 right-4 z-10 flex justify-center">
            <Button
              onClick={() => setNavigating(true)}
              className="h-14 w-full max-w-sm rounded-2xl bg-primary text-white shadow-2xl font-bold text-base gap-2 hover:bg-primary/95"
            >
              <Navigation className="size-5" />
              Start Navigation ({selectedRoute.duration_min} min)
            </Button>
          </div>
        )}

        {/* Attribution & Data Notice */}
        <div className="absolute right-4 bottom-24 z-10 pointer-events-none">
          <div className="rounded-xl bg-slate-900/80 px-3 py-1.5 text-[10px] text-white/90 backdrop-blur">
            Live OSRM Geometry · OpenStreetMap Safety Verification
          </div>
        </div>

        {showSos && <SosModal onClose={() => setShowSos(false)} />}
        {pendingReport && (
          <UnsafeReportModal
            lat={pendingReport.lat}
            lng={pendingReport.lng}
            onClose={() => setPendingReport(null)}
          />
        )}
      </main>
    )
  }

  // ── Main Dashboard View ────────────────────────────────────────────────────
  return (
    <main className="min-h-dvh bg-background text-foreground">
      {/* ── App Header ────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight leading-tight">
                Safe<span className="text-primary">Safar</span>
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Safety-first commute & navigation
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="relative flex items-center gap-2">
            <Button
              variant="outline"
              className="hidden rounded-full sm:flex gap-2 font-semibold"
              onClick={() => setView('map')}
            >
              <Map className="size-4" />
              Interactive Map
            </Button>

            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              onClick={() => setNotificationsOpen((o) => !o)}
            >
              <Bell className="size-5" />
            </Button>

            <Button
              className="rounded-full bg-red-600 text-white hover:bg-red-700 font-semibold gap-1.5 h-9 px-4"
              onClick={() => setShowSos(true)}
            >
              <Siren className="size-4" />
              <span className="hidden sm:inline">SOS</span>
            </Button>

            {/* Notifications Dropdown */}
            {notificationsOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setNotificationsOpen(false)} />
                <div className="absolute right-0 top-12 z-30 w-80 rounded-2xl border bg-white p-4 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-sm">Notifications</p>
                    <button
                      onClick={() => setNotificationsOpen(false)}
                      className="rounded-full p-1 hover:bg-slate-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 p-3 text-xs border border-amber-200">
                    <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-900">Community Caution</p>
                      <p className="text-amber-800 mt-0.5">
                        Street light outage noted near Sitabuldi Main Road 30 mins ago.
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] text-center text-muted-foreground italic">
                    [Simulated Alerts for Demonstration]
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* ── System Status & Methodology Disclaimer ────────────── */}
        {showDemoDisclaimer && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
            <Sparkles className="size-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden />
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-900">
                Live Routing & Verifiable OpenStreetMap Safety Engine
              </p>
              <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                SafeSafar calculates real road geometry, live distances, and directions using OSRM. Safety scores are modularly evaluated against verified civic emergency infrastructure (police stations, hospitals, lighting, and commercial density). Where data is missing, it is explicitly disclosed.
              </p>
            </div>
            <button
              onClick={() => setShowDemoDisclaimer(false)}
              className="rounded-full p-1 hover:bg-emerald-100 transition shrink-0"
              aria-label="Dismiss banner"
            >
              <X className="size-4 text-emerald-700" />
            </button>
          </div>
        )}

        {/* ── Geolocation Error Alert ──────────────────────────── */}
        {geoError && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="size-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-red-900">Location Access Notice</p>
                <p className="mt-1 text-red-700 leading-relaxed">{geoError}</p>
              </div>
            </div>
            <button
              onClick={clearGeoError}
              className="rounded-full p-1 hover:bg-red-100 text-red-600 transition shrink-0"
              aria-label="Dismiss error"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* ── Hero Heading ─────────────────────────────────────── */}
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <Badge variant="secondary" className="mb-3 rounded-full bg-emerald-100 text-emerald-800 text-xs">
              Live Safety Routing
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl text-slate-900">
              Plan a safer commute.
            </h1>
            <p className="mt-2 text-muted-foreground text-sm">
              Evaluate real driving corridors by safety, travel time, and fuel cost before departure.
            </p>
          </div>
          <Button
            className="rounded-full bg-primary gap-2 font-semibold h-11 px-6 self-start sm:self-auto shadow-sm"
            onClick={() => setView('map')}
          >
            <Navigation className="size-4" />
            View Live Map
          </Button>
        </div>

        {/* ── Search & Route Configurator ──────────────────────── */}
        <section className="relative rounded-3xl border bg-white p-5 shadow-sm mb-6">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto]">
            {/* From Input */}
            <PlaceField
              label="From (Origin)"
              value={fromInput}
              placeholder="e.g. Jafar Nagar, Nagpur or Sadar"
              onChange={(val) => {
                setFromInput(val)
                setActiveField('from')
              }}
              onFocus={() => setActiveField('from')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleManualSearch()
              }}
              actionButton={
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    requestLocation()
                  }}
                  disabled={geoStatus === 'loading'}
                  className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition disabled:opacity-50"
                  title="Detect device GPS location"
                >
                  {geoStatus === 'loading' ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      <span>Locating…</span>
                    </>
                  ) : (
                    <>
                      <LocateFixed className="size-3" />
                      <span>Use current location</span>
                    </>
                  )}
                </button>
              }
            />

            {/* Swap Button */}
            <div className="flex items-end justify-center">
              <Button
                variant="outline"
                size="icon"
                className="rounded-full mb-0.5"
                aria-label="Swap from and to"
                onClick={swap}
                title="Swap departure and arrival"
              >
                <RotateCcw className="size-4" />
              </Button>
            </div>

            {/* To Input */}
            <PlaceField
              label="To (Destination)"
              value={toInput}
              placeholder="e.g. Sitabuldi, Nagpur or VNIT"
              onChange={(val) => {
                setToInput(val)
                setActiveField('to')
              }}
              onFocus={() => setActiveField('to')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleManualSearch()
              }}
            />

            {/* Search Route Button */}
            <div className="flex items-end justify-center">
              <Button
                className="h-11 rounded-xl px-5 font-semibold gap-1.5 bg-primary text-white hover:bg-primary/90"
                onClick={handleManualSearch}
                disabled={loading}
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                <span>Find</span>
              </Button>
            </div>
          </div>

          {/* Autocomplete Suggestions Dropdown */}
          {(suggestions.length > 0 || suggestionsLoading || noSuggestionsFound) && activeField && (
            <div className="absolute left-5 right-5 top-24 z-20 rounded-2xl border bg-white p-2 shadow-2xl sm:top-20 max-h-72 overflow-y-auto">
              {suggestionsLoading && (
                <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>Searching locations across Nagpur and India…</span>
                </div>
              )}

              {noSuggestionsFound && !suggestionsLoading && (
                <div className="px-3 py-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">No matching place found</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Try entering a locality name (e.g. Sitabuldi, Sadar, Dharampeth, Jafar Nagar, VNIT) or press Find.
                  </p>
                </div>
              )}

              {suggestions.map((place) => (
                <button
                  key={`${place.lat}-${place.lon}-${place.display_name}`}
                  className="flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left text-sm hover:bg-emerald-50/60 transition border-b border-slate-50 last:border-none"
                  onClick={() => chooseSuggestion(place)}
                >
                  <MapPin className="size-4 shrink-0 text-primary mt-0.5" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-xs leading-relaxed text-slate-800 font-medium">
                      {place.display_name}
                    </span>
                    {place.city && (
                      <span className="text-[10px] text-muted-foreground">
                        {place.city}, {place.state || 'India'}
                      </span>
                    )}
                  </div>
                </button>
              ))}

              <button
                onClick={closeSuggestions}
                className="mt-1 w-full rounded-xl p-2 text-center text-xs text-muted-foreground hover:bg-slate-50 transition"
              >
                Close suggestions
              </button>
            </div>
          )}

          {/* Vehicle Mode Selector */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium text-slate-700">Travel mode:</span>
            {vehicles.map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                variant={vehicle === id ? 'default' : 'outline'}
                className={`rounded-full gap-1.5 h-9 ${
                  vehicle === id ? 'bg-primary text-white shadow-sm' : 'text-slate-700'
                }`}
                onClick={() => setVehicle(id)}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Button>
            ))}

            <Button
              variant="ghost"
              className="ml-auto rounded-full gap-1.5 h-9 text-slate-600 hover:text-slate-900"
              onClick={() => setShowSettings((o) => !o)}
            >
              <Settings2 className="size-4" />
              Settings
            </Button>
          </div>

          {/* Trip Settings Panel */}
          {showSettings && (
            <div className="mt-4 flex flex-wrap items-end gap-5 rounded-2xl bg-slate-50 p-4 border border-dashed border-slate-200">
              <label className="text-sm font-medium text-slate-700">
                Car mileage (km/L)
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={mileage}
                  onChange={(e) => setMileage(Number(e.target.value))}
                  className="mt-1 block w-28 rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Fuel price (₹/L)
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={petrolPrice}
                  onChange={(e) => setPetrolPrice(Number(e.target.value))}
                  className="mt-1 block w-28 rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
            </div>
          )}
        </section>

        {/* ── Personalized Safety Priorities Toolbar ───────────── */}
        <section className="mb-6 rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 shrink-0">
                <SlidersHorizontal className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Personalized Safety Priorities</h3>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                      selectedFeatures.length === 0
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {selectedFeatures.length} of 5 active ({selectedFeatures.length === 0 ? '0%' : '100% normalized'})
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Customize which factors determine your safest route. Active weights dynamically normalize to 100%.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              {selectedFeatures.length < 5 ? (
                <button
                  type="button"
                  onClick={() => setSelectedFeatures(['lighting', 'police', 'hospital', 'commercial', 'reports'])}
                  className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition"
                >
                  Select All
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedFeatures([])}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-muted-foreground hover:bg-slate-100 hover:text-slate-800 transition"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Feature Toggle Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {SAFETY_FEATURES.map((feat) => {
              const isSelected = selectedFeatures.includes(feat.id)
              const totalActiveBase = SAFETY_FEATURES
                .filter((f) => selectedFeatures.includes(f.id))
                .reduce((acc, f) => acc + f.defaultWeight, 0)
              const normalizedWeight =
                isSelected && totalActiveBase > 0
                  ? Math.round((feat.defaultWeight / totalActiveBase) * 100)
                  : 0

              return (
                <button
                  key={feat.id}
                  type="button"
                  onClick={() => toggleFeature(feat.id)}
                  aria-pressed={isSelected}
                  className={`flex flex-col justify-between rounded-2xl p-3 text-left border transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/70 text-slate-900 shadow-sm ring-1 ring-emerald-500/30'
                      : 'border-slate-200 bg-slate-50/60 text-slate-400 hover:border-slate-300 hover:bg-slate-100/50'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1.5">
                    <span className="text-xl" role="img" aria-label={feat.label}>
                      {feat.emoji}
                    </span>
                    <span
                      className={`size-4 rounded-full flex items-center justify-center text-[10px] ${
                        isSelected
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'border border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected ? <Check className="size-2.5 stroke-[3]" /> : null}
                    </span>
                  </div>
                  <div>
                    <p
                      className={`text-xs font-semibold leading-snug ${
                        isSelected ? 'text-slate-900' : 'text-slate-500 line-through opacity-75'
                      }`}
                    >
                      {feat.label}
                    </p>
                    <p className="text-[10px] mt-0.5 text-muted-foreground font-mono">
                      {isSelected ? `${normalizedWeight}% weight` : 'Excluded (0%)'}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Notice when 0 features are selected */}
          {selectedFeatures.length === 0 && (
            <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200">
              <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">No safety priorities selected.</span>{' '}
                Please select at least one factor above to calculate your personalized safety recommendation.
              </div>
              <button
                type="button"
                onClick={() => setSelectedFeatures(['lighting', 'police', 'hospital', 'commercial', 'reports'])}
                className="text-xs font-bold text-amber-800 underline hover:text-amber-950 shrink-0"
              >
                Enable all factors
              </button>
            </div>
          )}
        </section>

        {/* ── Error Banner ─────────────────────────────────────── */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2.5">
            <AlertTriangle className="size-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Route Finding Error</p>
              <p className="mt-0.5 text-xs text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* ── Key Metrics Overview Cards ───────────────────────── */}
        <section className="mb-6 grid gap-4 grid-cols-2 lg:grid-cols-4" aria-label="Safety statistics">
          <StatCard
            icon={ShieldCheck}
            label="Safest candidate score"
            value={loading ? '…' : String(safestRoute?.safety_score ?? '—')}
            note={
              safestRoute
                ? safetyLabel(safestRoute.safety_score, safestRoute.confidence)
                : '—'
            }
            tone={
              safestRoute?.safety_score && safestRoute.safety_score >= 70
                ? 'green'
                : safestRoute?.safety_score && safestRoute.safety_score >= 45
                ? 'amber'
                : 'red'
            }
          />
          <StatCard
            icon={Activity}
            label="Corridors evaluated"
            value={loading ? '…' : String(routes.length || '—')}
            note={
              routes.length === 1
                ? '1 genuine corridor found'
                : routes.length > 1
                ? `${routes.length} corridors compared`
                : 'Between your endpoints'
            }
          />
          <StatCard
            icon={Clock}
            label="Average corridor score"
            value={loading ? '…' : String(avgSafety || '—')}
            note="Across evaluated options"
            tone={avgSafety >= 70 ? 'green' : avgSafety >= 45 ? 'amber' : 'red'}
          />
          <StatCard
            icon={AlertTriangle}
            label="Active cautions"
            value="1"
            note="Logged nearby [Simulated]"
            tone="amber"
          />
        </section>

        {/* ── Main Content Grid ────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          {/* Left Column: Route Comparison & Detail Cards */}
          <section className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Route Comparison</h2>
                <p className="text-sm text-muted-foreground">
                  Comparing verified corridors between{' '}
                  <span className="font-semibold text-slate-800">{activeOrigin.label.split(',')[0]}</span> and{' '}
                  <span className="font-semibold text-slate-800">{activeDest.label.split(',')[0]}</span>.
                </p>
              </div>
              {!loading && routes.length > 0 && <SafetyGauge score={avgSafety} size="md" />}
            </div>

            {/* Single Route Scenario Banner (Honest Explanation) */}
            {!loading && routes.length === 1 && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900">
                <Info className="size-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm text-blue-950">Single Drivable Corridor Available</p>
                  <p className="mt-1 leading-relaxed text-blue-800">
                    The routing engine identified 1 road route connecting these exact endpoints. In this urban road network, alternative routes do not exist without significant detours. Both Fastest and Safest Route cards below reflect this verified corridor.
                  </p>
                </div>
              </div>
            )}

            {/* Inconclusive Safety Comparison Banner */}
            {!loading &&
              routes.length > 1 &&
              routes.every((r) => r.isMeaningfulComparison === false) && (
                <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
                  <Info className="size-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-amber-950">Comparable Safety Profiles</p>
                    <p className="mt-1 leading-relaxed text-amber-800">
                      The evaluated routes have safety scores within ±2 points. Based on current civic infrastructure mapping, neither route presents an overwhelming safety difference.
                    </p>
                  </div>
                </div>
              )}

            {/* Loading State Skeleton */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-64 animate-pulse rounded-2xl bg-slate-100 border" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* ── Side-by-Side Comparison Grid on Desktop, Stacked on Mobile ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: Fastest Route Card */}
                  {fastestRoute && (
                    <div className="flex flex-col">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1">
                          <Zap className="size-3.5 text-blue-600" />
                          Fastest Route
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {routes.length === 1 ? 'Direct corridor' : 'Lowest travel duration'}
                        </span>
                      </div>
                      <RouteCard
                        cardRole="fastest"
                        route={fastestRoute}
                        selected={selected === fastestRoute.id}
                        onSelect={() => setSelected(fastestRoute.id)}
                        onStartNavigation={() => {
                          setSelected(fastestRoute.id)
                          setView('map')
                          setNavigating(true)
                        }}
                        petrolPrice={petrolPrice}
                        mileage={mileage}
                        isRecommended={routes.length === 1}
                        isSharedCorridor={false}
                        tradeOffNote={
                          routes.length === 1
                            ? '⚡ Direct available road corridor'
                            : '⚡ Lowest travel duration to destination'
                        }
                      />
                    </div>
                  )}

                  {/* Right: Safest Route Card OR "Only one route available" banner */}
                  {safestRoute ? (
                    <div className="flex flex-col">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                          <ShieldCheck className="size-3.5 text-emerald-600" />
                          Safest Route
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Highest verifiable safety
                        </span>
                      </div>
                      <RouteCard
                        cardRole="safest"
                        route={safestRoute}
                        selected={selected === safestRoute.id}
                        onSelect={() => setSelected(safestRoute.id)}
                        onStartNavigation={() => {
                          setSelected(safestRoute.id)
                          setView('map')
                          setNavigating(true)
                        }}
                        petrolPrice={petrolPrice}
                        mileage={mileage}
                        isRecommended={true}
                        isSharedCorridor={false}
                        tradeOffNote={
                          fastestRoute
                            ? `+${safestRoute.duration_min - fastestRoute.duration_min} min, safety ${safestRoute.safety_score >= fastestRoute.safety_score ? '+' : ''}${safestRoute.safety_score - fastestRoute.safety_score} pts`
                            : '🛡️ Highest safety score'
                        }
                      />
                    </div>
                  ) : routes.length === 1 ? (
                    <div className="flex flex-col">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                          <Layers className="size-3.5 text-slate-500" />
                          Alternative Routes
                        </span>
                        <span className="text-[11px] text-muted-foreground font-medium">Single corridor</span>
                      </div>
                      <div className="flex flex-col justify-center items-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-6 text-center h-full min-h-[260px]">
                        <div className="flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 mb-3 shadow-sm border border-slate-200">
                          <Info className="size-5" />
                        </div>
                        <p className="font-bold text-base text-slate-900">Only one route available</p>
                        <p className="text-xs text-slate-600 mt-2 max-w-xs leading-relaxed">
                          Only one drivable road corridor connects these locations. Alternative road paths or bypasses are not available for this journey.
                        </p>
                        <div className="mt-4 rounded-xl bg-white px-3.5 py-2 border text-[11px] text-slate-500 shadow-xs">
                          No duplicate cards or estimated scores shown.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
                          <AlertTriangle className="size-3.5 text-amber-600" />
                          Safest Route
                        </span>
                        <span className="text-[11px] text-amber-700 font-medium">Selection required</span>
                      </div>
                      <div className="flex flex-col justify-center items-center rounded-3xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-6 text-center h-full min-h-[220px]">
                        <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-800 mb-2.5 shadow-sm">
                          <AlertTriangle className="size-5" />
                        </div>
                        <p className="font-bold text-sm text-amber-950">Safety Feature Selection Required</p>
                        <p className="text-xs text-amber-800 mt-1.5 max-w-xs leading-relaxed">
                          Please select at least one factor from Personalized Safety Priorities above to evaluate and rank the Safest Route.
                        </p>
                        <Button
                          size="sm"
                          className="mt-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm"
                          onClick={() => setSelectedFeatures(['lighting', 'police', 'hospital', 'commercial', 'reports'])}
                        >
                          Enable All Safety Priorities
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Additional Alternatives if 3 or more corridors exist */}
                {routes.length > 2 && (
                  <div className="mt-4 space-y-3">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Additional Alternative Corridors
                    </span>
                    {routes
                      .filter((r) => r.id !== safestRoute?.id && r.id !== fastestRoute?.id)
                      .slice(0, showAllRoutes ? undefined : 2)
                      .map((altRoute) => (
                        <RouteCard
                          key={altRoute.id}
                          cardRole="alternative"
                          route={altRoute}
                          selected={altRoute.id === selected}
                          onSelect={() => setSelected(altRoute.id)}
                          onStartNavigation={() => {
                            setSelected(altRoute.id)
                            setView('map')
                            setNavigating(true)
                          }}
                          petrolPrice={petrolPrice}
                          mileage={mileage}
                        />
                      ))}
                  </div>
                )}
              </div>
            )}

            {routes.length > 4 && (
              <Button
                variant="ghost"
                className="mt-3 w-full rounded-full text-primary gap-1.5"
                onClick={() => setShowAllRoutes((o) => !o)}
              >
                {showAllRoutes ? 'Show fewer' : `Show all ${routes.length} corridors`}
                <ChevronDown
                  className={`size-4 transition-transform ${showAllRoutes ? 'rotate-180' : ''}`}
                />
              </Button>
            )}

            {/* Vehicle Mode Comparison Matrix */}
            <div className="mt-6 overflow-hidden rounded-2xl border">
              <div className="grid grid-cols-3 bg-slate-50 px-4 py-3 text-xs font-semibold text-muted-foreground">
                <span>Travel Mode</span>
                <span>Est. Duration</span>
                <span>Est. Fuel Cost</span>
              </div>
              {vehicles.map(({ id, label }) => {
                const baseRoute = safestRoute ?? routes[0]
                const dist = baseRoute?.distance_km ?? 5.0
                let time = 15
                switch (id) {
                  case 'walk':
                    time = Math.max(1, Math.round((dist / 4.5) * 60))
                    break
                  case 'cycle':
                    time = Math.max(1, Math.round((dist / 15) * 60))
                    break
                  case 'bike':
                    time = Math.max(1, Math.round((baseRoute?.duration_min ?? 15) * 0.85))
                    break
                  case 'car':
                  default:
                    time = baseRoute?.duration_min ?? 15
                    break
                }
                const cost =
                  id === 'car'
                    ? Math.round((dist / mileage) * petrolPrice)
                    : id === 'bike'
                    ? Math.round((dist / 45) * petrolPrice)
                    : 0
                return (
                  <div
                    key={id}
                    className={`grid grid-cols-3 border-t px-4 py-3 text-sm ${
                      id === vehicle ? 'bg-primary/5 font-semibold text-primary' : ''
                    }`}
                  >
                    <span>{label}</span>
                    <span>~{time} min</span>
                    <span>{cost ? `₹${cost}` : 'Free'}</span>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              ℹ️ Durations use vehicle speed models. Fuel estimates use configured mileage ({mileage} km/L) and petrol price (₹{petrolPrice}/L).
            </p>
          </section>

          {/* Right Column: Selected Route Highlight & Simulated Activity */}
          <aside className="flex flex-col gap-5">
            {/* Highlight Card */}
            <section className="rounded-3xl border bg-slate-900 p-6 text-white shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-300">
                    {selectedRoute?.id === safestRoute?.id
                      ? 'Safest Corridor Selected'
                      : selectedRoute?.id === fastestRoute?.id
                      ? 'Fastest Corridor Selected'
                      : 'Route Highlights'}
                  </p>
                  <h2 className="mt-1 text-2xl font-bold">
                    {selectedRoute?.id === safestRoute?.id
                      ? 'Safest Commute'
                      : selectedRoute?.id === fastestRoute?.id
                      ? 'Fastest Commute'
                      : 'Selected Route'}
                  </h2>
                </div>
                <ShieldCheck className="size-7 text-emerald-400 shrink-0" />
              </div>

              {selectedRoute ? (
                <>
                  <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/10 p-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-emerald-500 text-slate-950 shrink-0 font-bold">
                      <ShieldCheck className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">
                        {selectedRoute.id === fastestRoute?.id && selectedRoute.id === safestRoute?.id
                          ? 'Fastest & Safest Route'
                          : selectedRoute.id === fastestRoute?.id
                          ? 'Fastest Route'
                          : selectedRoute.id === safestRoute?.id
                          ? 'Safest Route'
                          : 'Alternative Route'}
                      </p>
                      <p className="text-xs text-slate-300">
                        {selectedFeatures.length === 0 ? (
                          'Safety evaluation disabled (no priorities selected)'
                        ) : (
                          <>
                            Safety Score {selectedRoute.safety_score}/100 ·{' '}
                            <span>{safetyLabel(selectedRoute.safety_score, selectedRoute.confidence)}</span>
                            {selectedRoute.confidence && (
                              <span className="ml-1 text-[11px] text-slate-400">
                                ({selectedRoute.confidence} data confidence)
                              </span>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-slate-300">
                    {selectedRoute.reasons[0]?.text ??
                      'Road infrastructure and emergency care verified via OpenStreetMap.'}
                  </p>

                  <div className="mt-5 space-y-2">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Safety score index</span>
                      <span className="font-semibold text-emerald-400">
                        {selectedRoute.safety_score}/100
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                        style={{ width: `${selectedRoute.safety_score}%` }}
                      />
                    </div>
                  </div>

                  <Button
                    className="mt-6 w-full rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300 font-semibold gap-2"
                    onClick={() => setView('map')}
                  >
                    <Navigation className="size-4" />
                    Open Live Interactive Map
                  </Button>
                </>
              ) : (
                <p className="mt-5 text-sm text-slate-400">Calculating driving routes…</p>
              )}
            </section>

            {/* Safety Activity Feed (Clearly Labeled Simulated) */}
            <section className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-900">Safety Activity</h2>
                <Badge variant="secondary" className="text-xs rounded-full bg-slate-100 text-slate-600 border">
                  Simulated
                </Badge>
              </div>
              <div className="flex flex-col gap-4">
                <ActivityRow icon={MapPin} title="Nagpur Route Analyzed" detail="2 minutes ago" />
                <ActivityRow
                  icon={ShieldCheck}
                  title="Police Proximity Checked"
                  detail="Sadar / Sitabuldi precinct · 5 min ago"
                />
                <ActivityRow
                  icon={AlertTriangle}
                  title="Community Caution Alert"
                  detail="Near Station Road · Verified"
                />
              </div>
              <p className="mt-4 text-[11px] text-muted-foreground italic">
                Activity feed shows simulated community reports for demonstration purposes.
              </p>
            </section>
          </aside>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────── */}
      {showSos && <SosModal onClose={() => setShowSos(false)} />}
      {pendingReport && (
        <UnsafeReportModal
          lat={pendingReport.lat}
          lng={pendingReport.lng}
          onClose={() => setPendingReport(null)}
        />
      )}
    </main>
  )
}
