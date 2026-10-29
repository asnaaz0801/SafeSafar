'use client'
import { useEffect, useRef, useState } from 'react'

export type NavState = 'idle' | 'navigating' | 'arrived'

export function useNavigation() {
  const [navState, setNavState] = useState<NavState>('idle')
  const [stepIndex, setStepIndex] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const totalStepsRef = useRef(0)

  function startNavigation(totalSteps: number) {
    totalStepsRef.current = totalSteps
    setStepIndex(0)
    setNavState('navigating')
  }

  function advanceStep() {
    setStepIndex((prev) => {
      const next = prev + 1
      if (next >= totalStepsRef.current - 1) {
        setNavState('arrived')
        return totalStepsRef.current - 1
      }
      return next
    })
  }

  function stopNavigation() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setNavState('idle')
    setStepIndex(0)
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return { navState, stepIndex, startNavigation, advanceStep, stopNavigation }
}
