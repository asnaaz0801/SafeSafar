'use client'
import { useEffect, useState } from 'react'

export function useSosCountdown(active: boolean, seconds = 5, onComplete?: () => void) {
  const [count, setCount] = useState(seconds)

  useEffect(() => {
    if (!active) {
      setCount(seconds)
      return
    }
    if (count === 0) {
      onComplete?.()
      return
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [active, count, seconds, onComplete])

  function reset() {
    setCount(seconds)
  }

  return { count, reset }
}
