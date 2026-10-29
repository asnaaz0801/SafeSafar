'use client'

import { useEffect, useRef, useState } from 'react'
import type { Route } from '@/lib/api'
import { useSpeech } from '@/lib/useSpeech'
import { formatDist } from '@/lib/geo'
import { safetyColor } from '@/lib/safety'
import { Button } from './ui/button'
import { Volume2, VolumeX, ChevronRight, Navigation, CheckCircle2, X } from 'lucide-react'

interface NavigationPanelProps {
  route: Route
  onStop: () => void
}

export function NavigationPanel({ route, onStop }: NavigationPanelProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [arrived, setArrived] = useState(false)
  const { speak, cancel, supported } = useSpeech()
  const spokenRef = useRef<Set<number>>(new Set())

  const steps = route.steps
  const currentStep = steps[stepIndex]
  const nextStep = steps[stepIndex + 1]

  // Announce step via speech
  useEffect(() => {
    if (!audioEnabled || !currentStep || spokenRef.current.has(stepIndex)) return
    speak(currentStep.instruction)
    spokenRef.current.add(stepIndex)
  }, [stepIndex, audioEnabled, currentStep, speak])

  function handleNext() {
    const next = stepIndex + 1
    if (next >= steps.length - 1) {
      setArrived(true)
      if (audioEnabled) speak('You have arrived at your destination.')
      return
    }
    setStepIndex(next)
  }

  function handleStop() {
    cancel()
    onStop()
  }

  const progress = arrived ? 100 : Math.round((stepIndex / (steps.length - 1)) * 100)
  const segmentScore = route.segments[Math.min(stepIndex, route.segments.length - 1)]?.score ?? 80
  const color = safetyColor(segmentScore)

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 sm:bottom-6 sm:left-6 sm:right-auto sm:max-w-sm">
      <div className="rounded-none sm:rounded-3xl bg-slate-900 text-white shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-slate-700 w-full">
          <div
            className="h-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%`, backgroundColor: color }}
          />
        </div>

        <div className="p-5">
          {arrived ? (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <CheckCircle2 className="size-12 text-emerald-400" />
              <div>
                <p className="text-lg font-bold">You&apos;ve arrived!</p>
                <p className="text-sm text-slate-400 mt-1">
                  {route.label} route — {route.distance_km} km
                </p>
              </div>
              <Button
                onClick={handleStop}
                className="w-full rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold mt-1"
              >
                End Navigation
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="flex size-10 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: color + '30', color }}
                  >
                    <Navigation className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Now</p>
                    <p className="font-semibold text-base leading-tight">{currentStep?.instruction}</p>
                    {currentStep && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        in {formatDist(currentStep.distance_m)}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleStop}
                  aria-label="Stop navigation"
                  className="rounded-full p-2 hover:bg-white/10 transition shrink-0"
                >
                  <X className="size-4 text-slate-400" />
                </button>
              </div>

              {nextStep && (
                <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 mb-4">
                  <ChevronRight className="size-4 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-400">Then</p>
                    <p className="text-sm text-slate-300">{nextStep.instruction}</p>
                  </div>
                </div>
              )}

              {/* Safety band indicator */}
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-1.5 mb-4 text-xs font-medium"
                style={{ backgroundColor: color + '20', color }}
              >
                <span>Current segment safety: {segmentScore}/100</span>
              </div>

              <div className="flex gap-3">
                {supported && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAudioEnabled((v) => !v)
                      if (audioEnabled) cancel()
                    }}
                    className="h-11 rounded-2xl border-white/20 bg-white/5 text-white hover:bg-white/10 gap-2"
                    aria-label={audioEnabled ? 'Mute audio guidance' : 'Unmute audio guidance'}
                  >
                    {audioEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                  </Button>
                )}
                <Button
                  onClick={handleNext}
                  className="flex-1 h-11 rounded-2xl bg-primary hover:bg-primary/90 text-white font-semibold"
                >
                  Next step
                </Button>
              </div>

              <p className="mt-3 text-center text-xs text-slate-500">
                Step {stepIndex + 1} of {steps.length} · Simulated navigation
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
