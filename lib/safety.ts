import type { SafetyFactor, ReasonType, ConfidenceLevel } from './api'
import { distanceToPolylineMetres, haversineMetres, formatDist } from './geo'

export type SafetyBand = 'safe' | 'caution' | 'high-risk'

export function safetyBand(score: number): SafetyBand {
  if (score >= 70) return 'safe'
  if (score >= 40) return 'caution'
  return 'high-risk'
}

export function safetyColor(score: number): string {
  if (score >= 70) return '#10B981' // Emerald
  if (score >= 45) return '#F59E0B' // Amber
  return '#EF4444' // Rose / Red
}

export function safetyLabel(score: number, confidence?: ConfidenceLevel): string {
  if (confidence === 'insufficient') return 'Data Insufficient'
  if (score >= 80) return 'Excellent'
  if (score >= 70) return 'Good'
  if (score >= 55) return 'Moderate'
  if (score >= 40) return 'Caution'
  return 'High Risk'
}

export type SafetyFeatureId =
  | 'lighting'
  | 'police'
  | 'hospital'
  | 'commercial'
  | 'reports'

export interface SafetyFeatureConfig {
  id: SafetyFeatureId
  label: string
  shortLabel: string
  emoji: string
  defaultWeight: number
  description: string
}

export const SAFETY_FEATURES: SafetyFeatureConfig[] = [
  {
    id: 'lighting',
    label: 'Street Lighting',
    shortLabel: 'Street Lighting',
    emoji: '💡',
    defaultWeight: 25,
    description: 'Mapped street lamps and illuminated roadway infrastructure',
  },
  {
    id: 'police',
    label: 'Police Station Proximity',
    shortLabel: 'Police Proximity',
    emoji: '🚔',
    defaultWeight: 20,
    description: 'Proximity to mapped police stations, beats, and civic outposts',
  },
  {
    id: 'hospital',
    label: 'Hospital Proximity',
    shortLabel: 'Emergency Care',
    emoji: '🏥',
    defaultWeight: 15,
    description: 'Proximity to mapped trauma hospitals, clinics, and emergency centers',
  },
  {
    id: 'commercial',
    label: 'Commercial Activity',
    shortLabel: 'Commercial Foot-Traffic',
    emoji: '🏪',
    defaultWeight: 25,
    description: 'Density of open storefronts, pharmacies, cafes, and fuel stations',
  },
  {
    id: 'reports',
    label: 'Community Caution Reports',
    shortLabel: 'Community Reports',
    emoji: '📍',
    defaultWeight: 15,
    description: 'User-submitted incident, hazard, and caution reports within 250m',
  },
]

export const FACTOR_META: Record<string, { emoji: string; description: string }> = {
  'Police Station Proximity': {
    emoji: '🚔',
    description: 'Distance to verified police stations along corridor',
  },
  'Police Proximity': {
    emoji: '🚔',
    description: 'Distance to verified police stations along corridor',
  },
  'Hospital Proximity': {
    emoji: '🏥',
    description: 'Proximity to trauma hospitals and emergency clinics',
  },
  'Emergency Care': {
    emoji: '🏥',
    description: 'Proximity to trauma hospitals and emergency clinics',
  },
  'Commercial Activity': {
    emoji: '🏪',
    description: 'Density of open businesses, pharmacies, fuel, and transit nodes',
  },
  'Commercial Foot-Traffic': {
    emoji: '🏪',
    description: 'Density of open businesses, pharmacies, fuel, and transit nodes',
  },
  'Street Lighting': {
    emoji: '💡',
    description: 'Mapped street lamps and lit roadway infrastructure',
  },
  'Community Caution Reports': {
    emoji: '📍',
    description: 'Verified incident & hazard reports within 250m of route',
  },
  'Community Reports': {
    emoji: '📍',
    description: 'Verified incident & hazard reports within 250m of route',
  },
}

export function computeWeightedScore(factors: SafetyFactor[]): number {
  const active = factors.filter((f) => f.status === 'active' && f.weight > 0)
  const totalWeight = active.reduce((s, f) => s + f.weight, 0)
  if (totalWeight === 0) return 50
  const weightedSum = active.reduce((s, f) => s + (f.score * f.weight) / 100, 0)
  return Math.round(weightedSum)
}

export interface RouteSafetyAssessment {
  safety_score: number
  confidence: ConfidenceLevel
  confidenceScore: number
  confidenceReason: string
  reasons: { type: ReasonType; text: string }[]
  segments: { coords: [number, number][]; score: number; reason: string }[]
  safetyFactors: SafetyFactor[]
  dataSources: string[]
  limitations: string[]
}

export interface OsmDataInput {
  features: Array<{
    id: string
    lat: number
    lon: number
    category: 'police' | 'hospital' | 'shop' | 'public_place' | 'street_lamp' | 'lit_way'
    name?: string
  }>
  status: 'ok' | 'cached' | 'fallback' | 'unavailable'
  totalMappedLighting: number
  dataSources?: string[]
  limitations?: string[]
}

/**
 * Samples evenly-spaced waypoints along a polyline to calculate average distance
 * across the entire length of the corridor, not just a single closest point.
 */
function sampleCorridorCoverage(
  features: Array<{ lat: number; lon: number; name?: string }>,
  polyline: [number, number][],
  sampleCount = 8,
): { minDist: number; avgDist: number; nearestName?: string } {
  if (polyline.length === 0 || features.length === 0) {
    return { minDist: Infinity, avgDist: Infinity }
  }

  let minDist = Infinity
  let nearestName: string | undefined

  for (const f of features) {
    const d = distanceToPolylineMetres(f.lat, f.lon, polyline)
    if (d < minDist) {
      minDist = d
      nearestName = f.name
    }
  }

  const step = Math.max(1, Math.floor(polyline.length / sampleCount))
  const sampleIndices: number[] = []
  for (let i = 0; i < polyline.length; i += step) {
    sampleIndices.push(i)
  }
  if (sampleIndices[sampleIndices.length - 1] !== polyline.length - 1) {
    sampleIndices.push(polyline.length - 1)
  }

  let totalSampleDist = 0
  for (const idx of sampleIndices) {
    const [lat, lon] = polyline[idx]
    let nearestDist = Infinity
    for (const f of features) {
      const d = haversineMetres(lat, lon, f.lat, f.lon)
      if (d < nearestDist) nearestDist = d
    }
    totalSampleDist += nearestDist
  }

  const avgDist = totalSampleDist / sampleIndices.length
  return { minDist, avgDist, nearestName }
}

/**
 * Evaluate safety for a route's Leaflet coordinates based on user-selected features
 * and real OpenStreetMap infrastructure.
 */
export function evaluateRouteSafety(
  coords: [number, number][],
  distance_km: number,
  osmData: OsmDataInput,
  reports: { lat: number; lng: number; type?: string; note?: string }[] = [],
  travelTime: Date = new Date(),
  selectedFeatureIds: SafetyFeatureId[] = ['lighting', 'police', 'hospital', 'commercial', 'reports'],
): RouteSafetyAssessment {
  const defaultSources = ['OpenStreetMap Contributors (ODbL)', 'SafeSafar Civic Infrastructure Registry']
  const defaultLimitations = [
    'Municipal real-time crime dispatch feeds are not publicly available.',
    'Street lighting is evaluated where tagged in OpenStreetMap; unmapped lighting is classified as unknown rather than penalized.',
  ]

  if (!coords.length) {
    return {
      safety_score: 50,
      confidence: 'insufficient',
      confidenceScore: 0,
      confidenceReason: 'No route coordinates available for spatial evaluation.',
      reasons: [{ type: 'caution', text: 'Route geometry unavailable for safety evaluation.' }],
      segments: [],
      safetyFactors: [],
      dataSources: defaultSources,
      limitations: defaultLimitations,
    }
  }

  const { features, status, totalMappedLighting } = osmData
  const dataSources = osmData.dataSources && osmData.dataSources.length ? osmData.dataSources : defaultSources
  const limitations = [
    ...(osmData.limitations && osmData.limitations.length ? osmData.limitations : defaultLimitations),
  ]

  // Edge Case: No safety features selected by user
  if (selectedFeatureIds.length === 0) {
    return {
      safety_score: 0,
      confidence: 'insufficient',
      confidenceScore: 0,
      confidenceReason: 'No safety features selected. Please select at least one feature in preferences.',
      reasons: [
        {
          type: 'caution',
          text: 'No safety factors selected. Select at least one factor above to compute your score.',
        },
      ],
      segments: [{ coords, score: 0, reason: 'No safety preferences selected' }],
      safetyFactors: SAFETY_FEATURES.map((f) => ({
        id: f.id,
        label: f.label,
        weight: 0,
        score: 0,
        description: 'Deselected by user',
        selected: false,
        status: 'deselected',
      })),
      dataSources,
      limitations,
    }
  }

  // 1. Police Station Coverage
  const policeFeatures = features.filter((f) => f.category === 'police')
  const { minDist: minPoliceDist, avgDist: avgPoliceDist, nearestName: nearestPoliceName } =
    sampleCorridorCoverage(policeFeatures, coords)

  const effectivePoliceDist =
    minPoliceDist === Infinity ? Infinity : Math.round(minPoliceDist * 0.4 + avgPoliceDist * 0.6)

  let policeScore: number
  let policeDesc: string

  if (policeFeatures.length === 0 || effectivePoliceDist === Infinity) {
    policeScore = 40
    policeDesc = 'No police facility mapped along immediate corridor'
  } else if (effectivePoliceDist <= 600) {
    policeScore = 95
    policeDesc = nearestPoliceName
      ? `Strong police presence: ${nearestPoliceName} within ${formatDist(minPoliceDist)} (avg corridor dist ${formatDist(avgPoliceDist)})`
      : `Police presence within ${formatDist(effectivePoliceDist)} of route`
  } else if (effectivePoliceDist <= 1200) {
    policeScore = 80
    policeDesc = nearestPoliceName
      ? `${nearestPoliceName} located ${formatDist(minPoliceDist)} from corridor`
      : `Nearest mapped police station is ${formatDist(minPoliceDist)} away`
  } else if (effectivePoliceDist <= 2200) {
    policeScore = 65
    policeDesc = nearestPoliceName
      ? `${nearestPoliceName} within ${formatDist(minPoliceDist)} (avg corridor dist ${formatDist(avgPoliceDist)})`
      : `Nearest police post within ${formatDist(effectivePoliceDist)}`
  } else if (effectivePoliceDist <= 3500) {
    policeScore = 48
    policeDesc = `Moderate police proximity (avg corridor dist ${formatDist(avgPoliceDist)})`
  } else {
    policeScore = 35
    policeDesc = `Distant police facilities (avg dist ${formatDist(avgPoliceDist)})`
  }

  // 2. Hospital & Emergency Healthcare Coverage
  const hospitalFeatures = features.filter((f) => f.category === 'hospital')
  const { minDist: minHospDist, avgDist: avgHospDist, nearestName: nearestHospName } =
    sampleCorridorCoverage(hospitalFeatures, coords)

  const effectiveHospDist =
    minHospDist === Infinity ? Infinity : Math.round(minHospDist * 0.4 + avgHospDist * 0.6)

  let hospitalScore: number
  let hospitalDesc: string

  if (hospitalFeatures.length === 0 || effectiveHospDist === Infinity) {
    hospitalScore = 40
    hospitalDesc = 'No emergency medical facilities mapped in this zone'
  } else if (effectiveHospDist <= 800) {
    hospitalScore = 92
    hospitalDesc = nearestHospName
      ? `Emergency healthcare: ${nearestHospName} within ${formatDist(minHospDist)} (avg dist ${formatDist(avgHospDist)})`
      : `Hospital within ${formatDist(effectiveHospDist)} of route`
  } else if (effectiveHospDist <= 1800) {
    hospitalScore = 75
    hospitalDesc = nearestHospName
      ? `${nearestHospName} is ${formatDist(minHospDist)} away`
      : `Emergency medical center within ${formatDist(effectiveHospDist)}`
  } else if (effectiveHospDist <= 3000) {
    hospitalScore = 55
    hospitalDesc = `Nearest hospital is ${formatDist(minHospDist)} away (avg dist ${formatDist(avgHospDist)})`
  } else {
    hospitalScore = 38
    hospitalDesc = `Emergency clinic is distant (avg dist ${formatDist(avgHospDist)})`
  }

  // 3. Commercial Foot-Traffic & Natural Surveillance (within ~300 m of corridor)
  const commercialFeatures = features.filter((f) => f.category === 'shop' || f.category === 'public_place')
  let nearbyCommercialCount = 0

  for (const cf of commercialFeatures) {
    if (distanceToPolylineMetres(cf.lat, cf.lon, coords) <= 300) {
      nearbyCommercialCount++
    }
  }

  const effectiveKm = Math.max(0.5, distance_km)
  const commercialDensityPerKm = nearbyCommercialCount / effectiveKm

  let commercialScore: number
  let commercialDesc: string

  if (commercialFeatures.length === 0 && (status === 'unavailable' || status === 'fallback')) {
    commercialScore = 55
    commercialDesc = 'Commercial foot-traffic is moderate for urban connecting road'
  } else if (commercialDensityPerKm >= 8) {
    commercialScore = 92
    commercialDesc = `High pedestrian and shop presence (${nearbyCommercialCount} active storefronts along corridor)`
  } else if (commercialDensityPerKm >= 4) {
    commercialScore = 80
    commercialDesc = `Moderate commercial activity (${nearbyCommercialCount} shops/services along corridor)`
  } else if (commercialDensityPerKm >= 1) {
    commercialScore = 62
    commercialDesc = `Light commercial presence (${nearbyCommercialCount} storefronts mapped along corridor)`
  } else {
    commercialScore = 40
    commercialDesc = `Quiet stretch (${nearbyCommercialCount} storefronts along ${distance_km} km)`
  }

  // 4. Street Lighting & Illumination (within ~300 m of corridor)
  const lightingFeatures = features.filter((f) => f.category === 'street_lamp' || f.category === 'lit_way')
  let nearbyLightingCount = 0

  for (const lf of lightingFeatures) {
    if (distanceToPolylineMetres(lf.lat, lf.lon, coords) <= 300) {
      nearbyLightingCount++
    }
  }

  let lightingScore = 0
  let isLightingUnmapped = false
  let lightingDesc = ''

  if (totalMappedLighting === 0) {
    // Unmapped: Redistribute weight honestly rather than penalizing or guessing
    isLightingUnmapped = true
    lightingScore = 0
    lightingDesc = 'Street lighting is unmapped in OpenStreetMap along this corridor (Unknown)'
  } else {
    const lightingDensityPerKm = nearbyLightingCount / effectiveKm
    if (lightingDensityPerKm >= 6) {
      lightingScore = 90
      lightingDesc = `Well-lit roadway with ${nearbyLightingCount} mapped street lamps or illuminated sections`
    } else if (lightingDensityPerKm >= 2) {
      lightingScore = 70
      lightingDesc = `Partially lit corridor (${nearbyLightingCount} mapped lighting points)`
    } else {
      lightingScore = 42
      lightingDesc = `Sparse mapped illumination (${nearbyLightingCount} lamps mapped along ${distance_km} km)`
    }
  }

  // 5. Community Caution Reports (within ~300 m of corridor)
  let nearbyReportsCount = 0
  for (const report of reports) {
    if (distanceToPolylineMetres(report.lat, report.lng, coords) <= 300) {
      nearbyReportsCount++
    }
  }

  let reportsScore: number
  let reportsDesc: string

  if (nearbyReportsCount === 0) {
    reportsScore = 65
    reportsDesc = '0 user incident reports logged nearby (absence of reports does not verify safety)'
  } else {
    reportsScore = Math.max(10, 65 - nearbyReportsCount * 25)
    reportsDesc = `${nearbyReportsCount} user caution report(s) noted within 300m of this route`
  }

  // 6. Build Raw Factors & Map to User Preferences
  const rawFactors: Array<{
    id: SafetyFeatureId
    label: string
    rawScore: number
    desc: string
    defaultWeight: number
    isUnmapped: boolean
  }> = [
    {
      id: 'lighting',
      label: 'Street Lighting',
      rawScore: lightingScore,
      desc: lightingDesc,
      defaultWeight: 25,
      isUnmapped: isLightingUnmapped,
    },
    {
      id: 'police',
      label: 'Police Station Proximity',
      rawScore: policeScore,
      desc: policeDesc,
      defaultWeight: 20,
      isUnmapped: false,
    },
    {
      id: 'hospital',
      label: 'Hospital Proximity',
      rawScore: hospitalScore,
      desc: hospitalDesc,
      defaultWeight: 15,
      isUnmapped: false,
    },
    {
      id: 'commercial',
      label: 'Commercial Activity',
      rawScore: commercialScore,
      desc: commercialDesc,
      defaultWeight: 25,
      isUnmapped: false,
    },
    {
      id: 'reports',
      label: 'Community Caution Reports',
      rawScore: reportsScore,
      desc: reportsDesc,
      defaultWeight: 15,
      isUnmapped: false,
    },
  ]

  const selectedSet = new Set(selectedFeatureIds)

  // Calculate sum of active weights for normalization
  let totalActiveBaseWeight = 0
  for (const f of rawFactors) {
    const isSelected = selectedSet.has(f.id)
    if (isSelected && !f.isUnmapped) {
      totalActiveBaseWeight += f.defaultWeight
    }
  }

  // Build normalized safety factors
  const safetyFactors: SafetyFactor[] = rawFactors.map((f) => {
    const isSelected = selectedSet.has(f.id)

    if (!isSelected) {
      return {
        id: f.id,
        label: f.label,
        weight: 0,
        score: f.rawScore,
        description: `${f.desc} (Deselected by user)`,
        selected: false,
        status: 'deselected',
      }
    }

    if (f.isUnmapped) {
      return {
        id: f.id,
        label: f.label,
        weight: 0,
        score: 0,
        description: f.desc,
        selected: true,
        status: 'unmapped',
      }
    }

    const normalizedWeight =
      totalActiveBaseWeight > 0 ? Math.round((f.defaultWeight / totalActiveBaseWeight) * 100) : 0

    return {
      id: f.id,
      label: f.label,
      weight: normalizedWeight,
      score: f.rawScore,
      description: f.desc,
      selected: true,
      status: 'active',
    }
  })

  // 7. Calculate Personalized Weighted Safety Score
  let overallScore = 50
  const activeFactors = safetyFactors.filter((f) => f.status === 'active')

  if (activeFactors.length > 0 && totalActiveBaseWeight > 0) {
    const weightedSum = activeFactors.reduce((sum, f) => {
      const baseWeight = rawFactors.find((r) => r.id === f.id)?.defaultWeight ?? 20
      return sum + (f.score * baseWeight)
    }, 0)
    overallScore = Math.round(weightedSum / totalActiveBaseWeight)
  }

  // Time of Day adjustment: night-time (21:00 - 05:00) slightly adjusts score if unlit
  const hour = travelTime.getHours()
  const isNight = hour >= 21 || hour < 5
  if (isNight && selectedSet.has('lighting') && (isLightingUnmapped || lightingScore < 50)) {
    overallScore = Math.max(20, overallScore - 4)
  }

  // 8. Calculate Data Confidence for Selected Features
  let confidenceScore = 0
  let confidence: ConfidenceLevel = 'insufficient'
  let confidenceReason = ''

  if (status === 'unavailable' || features.length === 0 || activeFactors.length === 0) {
    confidenceScore = 15
    confidence = 'insufficient'
    confidenceReason =
      'Safety data insufficient: Verified civic and lighting infrastructure could not be retrieved for your selected preferences.'
    overallScore = 50
  } else {
    let coverageEarned = 0
    let coveragePossible = 0

    if (selectedSet.has('police')) {
      coveragePossible += 25
      if (policeFeatures.length > 0) coverageEarned += 25
    }
    if (selectedSet.has('hospital')) {
      coveragePossible += 20
      if (hospitalFeatures.length > 0) coverageEarned += 20
    }
    if (selectedSet.has('commercial')) {
      coveragePossible += 25
      if (commercialFeatures.length > 0) coverageEarned += 25
    }
    if (selectedSet.has('lighting')) {
      coveragePossible += 20
      if (!isLightingUnmapped && nearbyLightingCount > 0) coverageEarned += 20
      else if (isLightingUnmapped) {
        limitations.push('Street lighting points are unmapped in OpenStreetMap along this stretch.')
      }
    }
    if (selectedSet.has('reports')) {
      coveragePossible += 10
      coverageEarned += 10
    }

    confidenceScore =
      coveragePossible > 0 ? Math.round((coverageEarned / coveragePossible) * 100) : 50

    if (confidenceScore >= 75) {
      confidence = 'high'
      confidenceReason = `High coverage (${confidenceScore}%): Verified infrastructure mapped for all active preferences.`
    } else if (confidenceScore >= 40) {
      confidence = 'moderate'
      confidenceReason = `Moderate coverage (${confidenceScore}%): Civic emergency facilities verified; some features (such as lighting) unmapped.`
    } else {
      confidence = 'low'
      confidenceReason = `Low coverage (${confidenceScore}%): Few mapped features for your selected preferences.`
    }
  }

  // 9. Spatial Segment Breakdown for Map View
  const segments: { coords: [number, number][]; score: number; reason: string }[] = []
  const n = coords.length

  if (n <= 3) {
    segments.push({
      coords,
      score: overallScore,
      reason: commercialDensityPerKm >= 4 ? 'Active commercial road' : 'Corridor path',
    })
  } else {
    const p1 = Math.floor(n * 0.38)
    const p2 = Math.floor(n * 0.72)

    const seg1 = coords.slice(0, p1 + 1)
    const seg2 = coords.slice(p1, p2 + 1)
    const seg3 = coords.slice(p2)

    const evaluateSubSegment = (segCoords: [number, number][]) => {
      let subComm = 0
      for (const cf of commercialFeatures) {
        if (distanceToPolylineMetres(cf.lat, cf.lon, segCoords) <= 80) subComm++
      }
      let subReports = 0
      for (const rep of reports) {
        if (distanceToPolylineMetres(rep.lat, rep.lng, segCoords) <= 200) subReports++
      }

      let delta = 0
      if (subComm >= 3) delta += 5
      if (subReports > 0) delta -= subReports * 15

      const segScore = Math.min(95, Math.max(20, overallScore + delta))
      const segReason =
        subReports > 0
          ? `${subReports} community caution report(s) near this stretch`
          : subComm >= 3
          ? 'Active commercial stretch with open storefronts'
          : minPoliceDist <= 800
          ? 'Patrolled sector within police proximity'
          : 'Connecting roadway stretch'

      return { score: segScore, reason: segReason }
    }

    const s1 = evaluateSubSegment(seg1)
    const s2 = evaluateSubSegment(seg2)
    const s3 = evaluateSubSegment(seg3)

    segments.push({ coords: seg1, score: s1.score, reason: s1.reason })
    segments.push({ coords: seg2, score: s2.score, reason: s2.reason })
    segments.push({ coords: seg3, score: s3.score, reason: s3.reason })
  }

  // 10. Generate Truthful Reasons Based on Selected Features
  const reasons: { type: ReasonType; text: string }[] = []

  if (confidence === 'insufficient') {
    reasons.push({
      type: 'caution',
      text: 'Safety data insufficient for selected preferences along this corridor.',
    })
  } else {
    if (selectedSet.has('police')) {
      if (effectivePoliceDist <= 1000) {
        reasons.push({
          type: 'positive',
          text: nearestPoliceName
            ? `Police coverage (${nearestPoliceName}) accessible within ${formatDist(minPoliceDist)}`
            : `Police station located within ${formatDist(effectivePoliceDist)} of route`,
        })
      } else if (effectivePoliceDist > 2500) {
        reasons.push({
          type: 'caution',
          text: `Longer distance to nearest police station (${formatDist(minPoliceDist)})`,
        })
      }
    }

    if (selectedSet.has('hospital')) {
      if (effectiveHospDist <= 1200) {
        reasons.push({
          type: 'positive',
          text: nearestHospName
            ? `Emergency healthcare (${nearestHospName}) within ${formatDist(minHospDist)}`
            : `Hospital/clinic accessible within ${formatDist(effectiveHospDist)}`,
        })
      }
    }

    if (selectedSet.has('commercial')) {
      if (commercialDensityPerKm >= 5) {
        reasons.push({
          type: 'positive',
          text: `Active commercial corridor (${nearbyCommercialCount} open storefronts/services)`,
        })
      } else if (commercialDensityPerKm < 2) {
        reasons.push({
          type: 'caution',
          text: 'Quiet roadway section with lower commercial foot-traffic',
        })
      }
    }

    if (selectedSet.has('lighting')) {
      if (isLightingUnmapped) {
        reasons.push({
          type: 'caution',
          text: 'Street lighting unmapped in OpenStreetMap for this corridor',
        })
      } else if (nearbyLightingCount > 0) {
        reasons.push({
          type: 'positive',
          text: `${nearbyLightingCount} mapped street lamps or illuminated road stretches`,
        })
      }
    }

    if (selectedSet.has('reports') && nearbyReportsCount > 0) {
      reasons.push({
        type: 'negative',
        text: `${nearbyReportsCount} user caution report(s) noted along route`,
      })
    }

    if (reasons.length === 0) {
      reasons.push({
        type: 'caution',
        text: 'Standard urban road conditions based on selected preferences',
      })
    }
  }

  return {
    safety_score: overallScore,
    confidence,
    confidenceScore,
    confidenceReason,
    reasons,
    segments,
    safetyFactors,
    dataSources,
    limitations,
  }
}
