'use client'

import { useState } from 'react'
import { Button } from './ui/button'
import { X, MapPin, CheckCircle2 } from 'lucide-react'
import { saveReport, type UnsafeReport } from '@/lib/api'

const REPORT_TYPES: { id: UnsafeReport['type']; label: string; emoji: string }[] = [
  { id: 'poor_lighting', label: 'Poor Lighting', emoji: '🌑' },
  { id: 'pothole', label: 'Pothole / Road Damage', emoji: '🕳️' },
  { id: 'suspicious_activity', label: 'Suspicious Activity', emoji: '👁️' },
  { id: 'harassment', label: 'Harassment', emoji: '🚨' },
  { id: 'other', label: 'Other Concern', emoji: '⚠️' },
]

interface UnsafeReportModalProps {
  lat: number
  lng: number
  onClose: () => void
}

export function UnsafeReportModal({ lat, lng, onClose }: UnsafeReportModalProps) {
  const [type, setType] = useState<UnsafeReport['type']>('poor_lighting')
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    saveReport({ lat, lng, type, note })
    setSubmitted(true)
  }

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Report unsafe location"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 bg-slate-950/70 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <MapPin className="size-5 text-primary" aria-hidden />
            <h2 className="font-semibold text-base">Report Unsafe Spot</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close report modal"
            className="rounded-full p-2 hover:bg-slate-100 transition"
          >
            <X className="size-4" />
          </button>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center py-10 px-6 gap-4 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="size-9 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold">Report Saved</h3>
            <p className="text-sm text-muted-foreground">
              Your report has been saved to your device. This simulated data helps improve route
              suggestions on this device only — it is not shared with any server.
            </p>
            <Button onClick={onClose} className="mt-2 w-full rounded-2xl h-11 bg-primary">
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
            <div className="text-xs text-muted-foreground rounded-xl bg-slate-50 p-3">
              <MapPin className="inline size-3 mr-1" />
              Simulated coords: {lat.toFixed(4)}, {lng.toFixed(4)} — not your real GPS position
            </div>

            <div>
              <p className="text-sm font-medium mb-2">What are you reporting?</p>
              <div className="grid grid-cols-2 gap-2">
                {REPORT_TYPES.map((rt) => (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() => setType(rt.id)}
                    className={`rounded-xl border px-3 py-2 text-sm text-left transition-all ${
                      type === rt.id
                        ? 'border-primary bg-primary/5 font-medium text-primary'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    {rt.emoji} {rt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="report-note" className="text-sm font-medium block mb-1">
                Additional details (optional)
              </label>
              <textarea
                id="report-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Describe what you observed..."
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-primary resize-none"
              />
            </div>

            <Button type="submit" className="h-12 w-full rounded-2xl bg-primary text-white font-semibold">
              Submit Report
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
