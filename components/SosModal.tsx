'use client'

import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { X, ShieldAlert, Share2, Copy, Check } from 'lucide-react'
import { useSosCountdown } from '@/lib/useSosCountdown'

interface SosModalProps {
  onClose: () => void
}

export function SosModal({ onClose }: SosModalProps) {
  const [phase, setPhase] = useState<'countdown' | 'ready'>('countdown')
  const [trackingLink] = useState(() => {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    return `https://safesafar.app/track/${code}`
  })
  const [copied, setCopied] = useState(false)

  const { count, reset } = useSosCountdown(phase === 'countdown', 5, () => {
    setPhase('ready')
  })

  function handleCancel() {
    reset()
    setPhase('countdown')
    onClose()
  }

  function handleCopy() {
    navigator.clipboard.writeText(trackingLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({ title: 'SafeSafar — Live Tracking', url: trackingLink })
    } else {
      handleCopy()
    }
  }

  // Lock scroll while modal open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="SOS emergency modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-red-950/97 p-6 text-white"
    >
      <button
        onClick={handleCancel}
        aria-label="Cancel and close SOS"
        className="absolute right-5 top-5 rounded-full p-3 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="size-5" />
      </button>

      <div className="flex max-w-sm w-full flex-col items-center text-center gap-6">
        {phase === 'countdown' ? (
          <>
            {/* Countdown ring */}
            <div className="relative flex size-44 items-center justify-center">
              <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="6" />
                <circle
                  cx="50" cy="50" r="44" fill="none"
                  stroke="#EF4444"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${(count / 5) * 276.5} 276.5`}
                  className="transition-all duration-1000"
                />
              </svg>
              <span className="text-7xl font-bold tabular-nums">{count}</span>
            </div>

            <ShieldAlert className="size-10 text-red-400" aria-hidden />

            <div>
              <h2 className="text-2xl font-bold">SOS Mode</h2>
              <p className="mt-2 text-base text-red-200">
                A shareable tracking link will be generated in{' '}
                <span className="font-semibold text-white">{count}</span> second{count !== 1 ? 's' : ''}.
              </p>
              <p className="mt-1 text-sm text-red-300">
                No messages are sent automatically. You will share the link manually.
              </p>
            </div>

            <Button
              onClick={handleCancel}
              variant="outline"
              className="h-14 w-full rounded-2xl border-white/40 bg-white/10 text-white hover:bg-white/20 text-base font-semibold"
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            {/* Success state */}
            <div className="flex size-20 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="size-10" aria-hidden />
            </div>

            <div>
              <h2 className="text-2xl font-bold">Tracking Link Ready</h2>
              <p className="mt-2 text-red-200">
                Your tracking link has been generated. Share it with trusted contacts so they can follow your location.
              </p>
            </div>

            {/* Link display */}
            <div className="w-full rounded-2xl bg-white/10 border border-white/20 p-4">
              <p className="text-xs text-red-300 mb-2 text-left font-medium uppercase tracking-wider">Your tracking link</p>
              <p className="text-sm font-mono text-white break-all">{trackingLink}</p>
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-red-300 leading-relaxed">
              ⚠️ This is a <strong className="text-white">demo link</strong> — no actual location data is transmitted and
              no emergency contacts were notified. In a real emergency, call <strong className="text-white">112</strong>.
            </p>

            <div className="flex gap-3 w-full">
              <Button
                onClick={handleCopy}
                variant="outline"
                className="flex-1 h-12 rounded-2xl border-white/40 bg-white/10 text-white hover:bg-white/20 gap-2"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied!' : 'Copy link'}
              </Button>
              <Button
                onClick={handleShare}
                className="flex-1 h-12 rounded-2xl bg-emerald-500 text-white hover:bg-emerald-400 gap-2 font-semibold"
              >
                <Share2 className="size-4" />
                Share
              </Button>
            </div>

            <Button
              onClick={onClose}
              variant="outline"
              className="w-full h-12 rounded-2xl border-white/20 bg-transparent text-red-300 hover:bg-white/10"
            >
              Close
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
