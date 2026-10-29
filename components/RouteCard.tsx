'use client'

import type { Route } from '@/lib/api'
import { safetyColor, safetyLabel, FACTOR_META } from '@/lib/safety'
import { SafetyGauge } from './SafetyGauge'
import { ReasonList } from './ReasonList'
import { Badge } from './ui/badge'
import {
  ChevronDown,
  ChevronUp,
  Info,
  Database,
  AlertCircle,
  Zap,
  ShieldCheck,
  MapPin,
  Check,
  Layers,
  Sparkles,
  Navigation,
} from 'lucide-react'
import { useState } from 'react'

interface RouteCardProps {
  route: Route
  selected: boolean
  onSelect: () => void
  onStartNavigation?: () => void
  petrolPrice: number
  mileage: number
  cardRole?: 'fastest' | 'safest' | 'alternative'
  isRecommended?: boolean
  isSharedCorridor?: boolean
  tradeOffNote?: string
}

const vehicleMileage: Record<string, number> = {
  car: 15,
  bike: 45,
  walk: 0,
  cycle: 0,
}

export function RouteCard({
  route,
  selected,
  onSelect,
  onStartNavigation,
  petrolPrice,
  mileage,
  cardRole,
  isRecommended: isRecommendedProp,
  isSharedCorridor,
  tradeOffNote,
}: RouteCardProps) {
  const [showFactors, setShowFactors] = useState(false)

  const eta = new Date(Date.now() + route.duration_min * 60000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  const effectiveMileage = route.vehicle === 'bike' ? vehicleMileage.bike : mileage
  const hasFuelCost = route.vehicle === 'car' || route.vehicle === 'bike'
  const fuelLitres = hasFuelCost ? route.distance_km / effectiveMileage : 0
  const fuelCost = Math.round(fuelLitres * petrolPrice)

  // Card Role Title & Icon
  const role = cardRole || route.label
  const isFastestRole = role === 'fastest'
  const isSafestRole = role === 'safest'

  const title =
    isFastestRole
      ? 'Fastest Route'
      : isSafestRole
      ? 'Safest Route'
      : 'Alternative Route'

  const RoleIcon = isFastestRole ? Zap : isSafestRole ? ShieldCheck : MapPin

  const isRecommended =
    isRecommendedProp ??
    (isSafestRole && route.isMeaningfulComparison !== false)

  // Check active features
  const activeFeatures = route.safetyFactors.filter((f) => f.status === 'active')
  const noFeaturesActive = activeFeatures.length === 0

  const isInsufficient = route.confidence === 'insufficient' || noFeaturesActive
  const color = isInsufficient ? '#94A3B8' : safetyColor(route.safety_score)
  const label = noFeaturesActive
    ? 'No Factors'
    : safetyLabel(route.safety_score, route.confidence)

  const tradeOff =
    tradeOffNote ??
    route.comparisonNote ??
    (isFastestRole
      ? '⚡ Lowest travel duration'
      : isSafestRole
      ? '🛡️ Verified highest safety score'
      : 'Alternative route')

  const confidenceBadge = noFeaturesActive
    ? { text: 'No Factors Selected', bg: 'bg-slate-100 text-slate-700 border-slate-200' }
    : route.confidence === 'high'
    ? { text: 'High Coverage', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : route.confidence === 'moderate'
    ? { text: 'Moderate Coverage', bg: 'bg-blue-50 text-blue-700 border-blue-200' }
    : route.confidence === 'insufficient'
    ? { text: 'Safety Data Insufficient', bg: 'bg-amber-50 text-amber-800 border-amber-300 font-semibold' }
    : { text: 'Limited OSM Data', bg: 'bg-slate-100 text-slate-700 border-slate-200' }

  // Extract via-road: pick the step with the longest distance that has a named road
  const majorRoadStep = [...route.steps]
    .filter((s) => s.road_name && s.road_name.trim().length > 0)
    .sort((a, b) => b.distance_m - a.distance_m)[0]

  const routeIdentifier = majorRoadStep?.road_name
    ? `via ${majorRoadStep.road_name}`
    : route.steps.find((s) => s.road_name)?.road_name
    ? `via ${route.steps.find((s) => s.road_name)?.road_name}`
    : `Corridor ${route.id.replace('r_candidate_', '#')}`

  return (
    <div
      className={`w-full rounded-2xl border text-left transition-all flex flex-col justify-between ${
        selected
          ? 'border-primary ring-2 ring-primary/25 shadow-md bg-white'
          : 'border-border hover:border-primary/40 bg-white/95 shadow-sm'
      }`}
    >
      {/* Clickable Card Body */}
      <div
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
        className="p-4 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl flex-1 flex flex-col justify-between"
      >
        <div>
          {/* Top Header Row: Icon, Title, Badges, Score */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div
                className={`flex size-8 items-center justify-center rounded-xl shrink-0 ${
                  isSafestRole
                    ? 'bg-emerald-100 text-emerald-700'
                    : isFastestRole
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                <RoleIcon className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-bold text-base text-slate-900 leading-tight">{title}</h3>
                  {isRecommended && (
                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px] rounded-full px-2 py-0.5">
                      Recommended
                    </Badge>
                  )}
                  {isSharedCorridor && (
                    <Badge variant="outline" className="bg-slate-100 text-slate-700 text-[10px] rounded-full px-2 py-0.5 border flex items-center gap-1">
                      <Layers className="size-2.5" />
                      Shared Corridor
                    </Badge>
                  )}
                </div>
                {/* Route Identifier for Fastest/Alternative */}
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {routeIdentifier}
                </p>
              </div>
            </div>

            {/* Score & Gauge */}
            <div className="shrink-0 flex items-center gap-2">
              <div className="text-right">
                <span
                  className="inline-block text-[11px] font-bold rounded-full px-2 py-0.5"
                  style={{ backgroundColor: color + '20', color }}
                >
                  {label}
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                  {noFeaturesActive ? '— / 100' : isInsufficient ? 'Data Low' : `${route.safety_score}/100`}
                </p>
              </div>
              {!isInsufficient && !noFeaturesActive && <SafetyGauge score={route.safety_score} size="sm" />}
            </div>
          </div>

          {/* Metrics Row: Time, Distance, Fuel Cost */}
          <div className="mt-2 rounded-xl bg-slate-50 p-2.5 border border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-800 font-semibold">
              <span>{route.duration_min} mins · {route.distance_km} km</span>
              <span className="text-primary font-bold">ETA {eta}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {hasFuelCost
                  ? `~${fuelLitres.toFixed(1)} L fuel · est. ₹${fuelCost}`
                  : 'Zero fuel cost (Eco-friendly)'}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${confidenceBadge.bg}`}>
                {confidenceBadge.text}
              </span>
            </div>
          </div>

          {/* Safety Features Evaluated */}
          {activeFeatures.length > 0 && (
            <div className="mt-2.5">
              <div className="flex items-center gap-1 mb-1">
                <Sparkles className={`size-3 ${isFastestRole ? 'text-blue-600' : 'text-emerald-600'}`} />
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Safety Features Evaluated ({activeFeatures.length}):
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {activeFeatures.map((f) => (
                  <span
                    key={f.id}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium border ${
                      isFastestRole
                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    <span>{FACTOR_META[f.label]?.emoji || '📍'}</span>
                    <span>{f.label}</span>
                    <span className={isFastestRole ? 'text-blue-700 font-bold' : 'text-emerald-700 font-bold'}>
                      {f.weight}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Zero Selected Features Notice */}
          {noFeaturesActive && isSafestRole && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600" />
              <span>
                <strong>No safety features selected:</strong> Select at least one safety feature above to calculate your personalized safety score.
              </span>
            </div>
          )}

          {/* Insufficient Safety Data Banner */}
          {isInsufficient && !noFeaturesActive && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600" />
              <span>
                <strong>Safety data insufficient:</strong> Verified civic emergency infrastructure and lighting points are not sufficiently mapped along this corridor.
              </span>
            </div>
          )}

          {/* Shared Corridor Notice (shown ONLY when corridor is genuinely shared/single) */}
          {isSharedCorridor && (
            <p className="mt-2 text-[11px] text-slate-600 bg-blue-50/60 rounded-lg p-2 border border-blue-100">
              ℹ️ Both Fastest and Safest options share this single road corridor. The score reflects verifiable infrastructure along this path.
            </p>
          )}

          {/* Top Safety Reasons / Factors */}
          <div className="mt-3">
            <ReasonList reasons={route.reasons.slice(0, 3)} />
          </div>
        </div>

        {/* Footer Row: Trade-off Note + Action Buttons */}
        <div className="mt-4 flex items-center justify-between border-t pt-3 gap-2 flex-wrap sm:flex-nowrap">
          <p className="text-xs font-medium text-slate-700 truncate" title={tradeOff}>
            {tradeOff}
          </p>

          <div className="flex items-center gap-2 shrink-0">
            {/* Start Navigation Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSelect()
                onStartNavigation?.()
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 shadow-sm text-white ${
                isFastestRole
                  ? 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                  : isSafestRole
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'
                  : 'bg-primary hover:bg-primary/90 active:scale-95'
              }`}
            >
              <Navigation className="size-3.5 fill-current" />
              <span>Start Navigation</span>
            </button>

            {/* Select Route Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSelect()
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all shrink-0 flex items-center gap-1 ${
                selected
                  ? 'bg-primary text-white shadow-sm ring-2 ring-primary/20'
                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {selected ? (
                <>
                  <Check className="size-3.5" />
                  <span>Active</span>
                </>
              ) : (
                <span>Select</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Safety Score Breakdown & Transparent Methodology Toggle */}
      <div className="border-t px-4 pb-1 bg-slate-50/50 rounded-b-2xl">
        <button
          onClick={() => setShowFactors((v) => !v)}
          className="flex w-full items-center justify-between py-2 text-xs text-muted-foreground hover:text-primary transition-colors focus:outline-none"
          aria-expanded={showFactors}
        >
          <span className="flex items-center gap-1 font-medium text-[11px]">
            <Info className="size-3.5" aria-hidden />
            View Factor Breakdown & Data Sources
          </span>
          {showFactors ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>

        {showFactors && (
          <div className="pb-3 pt-1 space-y-2.5">
            {/* Confidence & Assessment Details */}
            <div className="rounded-xl bg-white p-2.5 text-xs border space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-800">
                  Data Confidence:{' '}
                  <span className="capitalize font-bold text-slate-900">
                    {route.confidence === 'insufficient' ? 'Insufficient' : route.confidence ?? 'Moderate'}
                  </span>
                </p>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {route.confidenceScore ?? 50}% Coverage
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {route.confidenceReason ?? 'Calculated from OpenStreetMap civic infrastructure features.'}
              </p>

              {/* Data Sources */}
              {route.dataSources && route.dataSources.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-700 flex items-center gap-1">
                    <Database className="size-3 text-slate-500" />
                    Data Sources:
                  </p>
                  <ul className="text-[10px] text-slate-600 list-disc list-inside mt-0.5 space-y-0.5">
                    {route.dataSources.map((src, i) => (
                      <li key={i}>{src}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Limitations */}
              {route.limitations && route.limitations.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-700">Limitations & Disclaimers:</p>
                  <ul className="text-[10px] text-slate-500 list-disc list-inside mt-0.5 space-y-0.5">
                    {route.limitations.map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Individual Modular Safety Factors */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-800">Factor-wise Score Breakdown:</p>
              {route.safetyFactors.map((factor) => {
                const meta = FACTOR_META[factor.label]
                const isDeselected = factor.status === 'deselected'
                const isUnmapped = factor.status === 'unmapped'
                const barColor = isDeselected ? '#cbd5e1' : isUnmapped ? '#94a3b8' : safetyColor(factor.score)

                return (
                  <div key={factor.id} className="rounded-lg bg-white p-2 border border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-slate-800 text-[11px] flex items-center gap-1">
                        <span>{meta?.emoji ?? '📍'}</span>
                        <span className={isDeselected ? 'line-through text-slate-400' : ''}>
                          {factor.label}
                        </span>
                        {isDeselected && (
                          <span className="text-[9px] text-slate-400">(Excluded)</span>
                        )}
                        {factor.status === 'active' && (
                          <span className="text-[9px] text-emerald-700 font-semibold bg-emerald-50 px-1 rounded">
                            {factor.weight}%
                          </span>
                        )}
                      </span>
                      <span className="font-semibold text-xs" style={{ color: barColor }}>
                        {isDeselected ? 'Excluded' : isUnmapped ? 'Unmapped' : `${factor.score}/100`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: isDeselected || isUnmapped ? '0%' : `${factor.score}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                      {factor.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
