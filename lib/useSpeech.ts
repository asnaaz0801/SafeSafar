'use client'
import { useEffect, useRef, useState } from 'react'

export function useSpeech() {
  const [supported, setSupported] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    setSupported('speechSynthesis' in window)
  }, [])

  function speak(text: string) {
    if (!supported || !text) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-IN'
    u.rate = 0.95
    u.pitch = 1
    utteranceRef.current = u
    window.speechSynthesis.speak(u)
  }

  function cancel() {
    if (supported) window.speechSynthesis.cancel()
  }

  return { speak, cancel, supported }
}
