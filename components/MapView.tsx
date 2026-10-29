'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Circle, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { Route } from '@/lib/api'
import { safetyColor } from '@/lib/safety'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet's default icon path issue in Next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const createMarkerIcon = (color: string, label: string) =>
  L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;">
      <div style="background:${color};width:24px;height:24px;border:3px solid #ffffff;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:11px;">
        ${label}
      </div>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })

const originPin = createMarkerIcon('#0F766E', 'A')
const destPin = createMarkerIcon('#DC2626', 'B')

const userLocationIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
    <div style="position:absolute;inset:0;background:#2563eb;border-radius:50%;opacity:0.35;animation:pulse 2s infinite;"></div>
    <div style="width:14px;height:14px;background:#1d4ed8;border:3px solid #ffffff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

// Auto-fit bounds to selected route
function FitBounds({
  route,
  currentLocation,
}: {
  route?: Route
  currentLocation?: { lat: number; lng: number } | null
}) {
  const map = useMap()
  useEffect(() => {
    if (route?.segments.length) {
      const allCoords = route.segments.flatMap((s) => s.coords) as [number, number][]
      if (allCoords.length >= 2) {
        map.fitBounds(L.latLngBounds(allCoords), { padding: [50, 50], maxZoom: 16 })
        return
      }
    }
    if (currentLocation) {
      map.setView([currentLocation.lat, currentLocation.lng], 15)
    }
  }, [route, currentLocation, map])
  return null
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

interface MapViewProps {
  routes: Route[]
  selectedId: string
  onSelectRoute?: (id: string) => void
  onReport: (lat: number, lng: number) => void
  currentLocation?: { lat: number; lng: number; accuracy?: number } | null
  fromLabel?: string
  toLabel?: string
}

export default function MapView({
  routes,
  selectedId,
  onSelectRoute,
  onReport,
  currentLocation,
  fromLabel = 'Origin',
  toLabel = 'Destination',
}: MapViewProps) {
  const selected = routes.find((r) => r.id === selectedId) ?? routes[0]
  const [reportPending, setReportPending] = useState<{ lat: number; lng: number } | null>(null)

  // Start & Destination coordinates from selected route geometry
  const startCoord: [number, number] = selected?.segments[0]?.coords[0] ?? (
    currentLocation ? [currentLocation.lat, currentLocation.lng] : [21.1837, 79.0681]
  )
  const lastSeg = selected?.segments[selected.segments.length - 1]
  const destCoord: [number, number] = lastSeg?.coords[lastSeg.coords.length - 1] ?? [21.1444, 79.0833]

  const isSingleCorridor = routes.length <= 1

  return (
    <>
      <MapContainer center={startCoord} zoom={13} zoomControl={false} className="h-full w-full">
        <MapClickHandler onMapClick={(lat, lng) => setReportPending({ lat, lng })} />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* 1. Render unselected alternative routes in background with their own distinct colors */}
        {routes
          .filter((r) => r.id !== selectedId)
          .map((route) => {
            const isFastest = route.label === 'fastest'
            const isSafest = route.label === 'safest'
            const routeBgColor = isFastest ? '#3B82F6' : isSafest ? '#10B981' : '#8B5CF6'
            const labelText = isFastest ? '⚡ Fastest Route' : isSafest ? '🛡️ Safest Route' : 'Alternative Route'

            return route.segments.map((seg, i) => (
              <Polyline
                key={`bg-${route.id}-${i}`}
                positions={seg.coords}
                pathOptions={{
                  color: routeBgColor,
                  weight: 5,
                  opacity: 0.75,
                  dashArray: '6, 6',
                }}
                eventHandlers={{
                  click: () => onSelectRoute?.(route.id),
                }}
              >
                <Tooltip sticky>
                  <span className="text-xs font-semibold">
                    {labelText} ({route.duration_min} min, {route.distance_km} km) · Click to switch route
                  </span>
                </Tooltip>
              </Polyline>
            ))
          })}

        {/* 2. Render selected active route on top with prominent color and weight */}
        {selected?.segments.map((seg, i) => {
          const isFastest = selected.label === 'fastest'
          const isSafest = selected.label === 'safest'
          // Different distinct color per route
          const routeColor = isFastest ? '#2563EB' : isSafest ? '#059669' : '#7C3AED'
          const title = isSingleCorridor
            ? 'Single Available Route Corridor'
            : isFastest
            ? '⚡ Fastest Route (Active)'
            : isSafest
            ? '🛡️ Safest Route (Active)'
            : 'Alternative Route (Active)'

          return (
            <Polyline
              key={`selected-${selected.id}-${i}`}
              positions={seg.coords}
              pathOptions={{
                color: routeColor,
                weight: 7.5,
                opacity: 0.95,
              }}
            >
              <Tooltip sticky>
                <span className="text-xs font-semibold">
                  {title} · {seg.reason}
                </span>
              </Tooltip>
              <Popup>
                <div className="text-xs">
                  <strong className="text-sm">{title}</strong>
                  <br />
                  <span>Stretch: {seg.reason}</span>
                  <br />
                  <span className="font-semibold" style={{ color: routeColor }}>
                    Safety Score: {seg.score}/100
                  </span>
                  <br />
                  <span className="text-[10px] text-muted-foreground">
                    {selected.duration_min} min · {selected.distance_km} km
                  </span>
                </div>
              </Popup>
            </Polyline>
          )
        })}

        {/* Origin Marker (A) */}
        <Marker position={startCoord} icon={originPin}>
          <Popup>
            <div className="text-xs">
              <strong className="text-emerald-700">Origin (A)</strong>
              <br />
              <span>{fromLabel}</span>
              <br />
              <span className="text-muted-foreground text-[10px]">
                {startCoord[0].toFixed(4)}, {startCoord[1].toFixed(4)}
              </span>
            </div>
          </Popup>
        </Marker>

        {/* Destination Marker (B) */}
        <Marker position={destCoord} icon={destPin}>
          <Popup>
            <div className="text-xs">
              <strong className="text-red-700">Destination (B)</strong>
              <br />
              <span>{toLabel}</span>
              <br />
              <span className="text-muted-foreground text-[10px]">
                {destCoord[0].toFixed(4)}, {destCoord[1].toFixed(4)}
              </span>
            </div>
          </Popup>
        </Marker>

        {/* Real Live Current Device Location Indicator */}
        {currentLocation && (
          <>
            <Marker position={[currentLocation.lat, currentLocation.lng]} icon={userLocationIcon}>
              <Popup>
                <div className="text-xs">
                  <strong className="text-blue-700">Your Current Device Location</strong>
                  <br />
                  <span>GPS Accuracy: ±{Math.round(currentLocation.accuracy ?? 20)} m</span>
                </div>
              </Popup>
            </Marker>
            <Circle
              center={[currentLocation.lat, currentLocation.lng]}
              radius={Math.max(25, Math.min(150, currentLocation.accuracy ?? 35))}
              pathOptions={{
                color: '#2563eb',
                fillColor: '#3b82f6',
                fillOpacity: 0.15,
                weight: 1.5,
              }}
            />
          </>
        )}

        <FitBounds route={selected} currentLocation={currentLocation} />
      </MapContainer>

      {/* Floating Route Legend & Quick Switcher */}
      {routes.length > 1 && (
        <div className="absolute top-20 left-4 z-20 flex flex-col gap-1.5 rounded-2xl bg-white/95 backdrop-blur-sm p-2.5 shadow-lg border text-xs max-w-[240px]">
          <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
            Route Legend & Switcher
          </span>
          <div className="flex flex-col gap-1">
            {routes.map((r) => {
              const isSelected = r.id === selectedId
              const isFastest = r.label === 'fastest'
              const isSafest = r.label === 'safest'
              const color = isFastest ? '#2563EB' : isSafest ? '#059669' : '#7C3AED'
              const label = isFastest ? '⚡ Fastest' : isSafest ? '🛡️ Safest' : 'Alternative'

              return (
                <button
                  key={r.id}
                  onClick={() => onSelectRoute?.(r.id)}
                  className={`flex items-center justify-between gap-2 px-2 py-1 rounded-xl border text-left transition ${
                    isSelected
                      ? 'bg-slate-100 font-bold border-slate-300 shadow-2xs'
                      : 'hover:bg-slate-50 border-transparent text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs">{label}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {r.duration_min}m · {r.safety_score}/100
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Report confirmation overlay */}
      {reportPending && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-2xl bg-white px-5 py-3 shadow-xl border">
          <span className="text-sm font-medium">📍 Report caution/unsafe spot at this point?</span>
          <button
            onClick={() => {
              onReport(reportPending.lat, reportPending.lng)
              setReportPending(null)
            }}
            className="rounded-full bg-primary px-3.5 py-1 text-xs font-semibold text-white hover:bg-primary/90 transition"
          >
            Yes
          </button>
          <button
            onClick={() => setReportPending(null)}
            className="rounded-full border px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
          >
            No
          </button>
        </div>
      )}
    </>
  )
}
