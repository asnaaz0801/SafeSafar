'use client'

import { safetyColor } from '@/lib/safety'

interface SafetyGaugeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: { container: 'size-12', text: 'text-sm', label: 'text-[8px]' },
  md: { container: 'size-16', text: 'text-lg', label: 'text-[9px]' },
  lg: { container: 'size-24', text: 'text-2xl', label: 'text-xs' },
}

// SVG circle: r=16, circumference = 2πr ≈ 100.53 — we use 100 for simplicity
export function SafetyGauge({ score, size = 'md' }: SafetyGaugeProps) {
  const color = safetyColor(score)
  const { container, text, label } = sizes[size]

  return (
    <div className={`relative ${container} shrink-0`} aria-label={`Safety score: ${score} out of 100`}>
      <svg viewBox="0 0 40 40" className="size-full -rotate-90">
        <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/60" />
        <circle
          cx="20" cy="20" r="16"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${score} 100`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-bold leading-none ${text}`} style={{ color }}>
          {score}
        </span>
        <span className={`text-muted-foreground ${label}`}>score</span>
      </div>
    </div>
  )
}
