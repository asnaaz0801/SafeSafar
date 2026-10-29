'use client'

import { useState, useCallback, useRef } from 'react'

export type GeoStatus = 'idle' | 'loading' | 'ok' | 'error'

export interface GeoLocationState {
  status: GeoStatus
  lat?: number
  lng?: number
  accuracy?: number
  errorMessage?: string
}

export function useGeolocation() {
  const [state, setState] = useState<GeoLocationState>({ status: 'idle' })
  const activeRequestRef = useRef(false)

  const clearError = useCallback(() => {
    setState((prev) => (prev.status === 'error' ? { status: 'idle' } : prev))
  }, [])

  const requestLocation = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setState({
        status: 'error',
        errorMessage: 'Geolocation is not supported by this browser.',
      })
      return
    }

    if (activeRequestRef.current) return
    activeRequestRef.current = true

    setState({ status: 'loading' })

    navigator.geolocation.getCurrentPosition(
      (pos: GeolocationPosition) => {
        activeRequestRef.current = false
        setState({
          status: 'ok',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
      },
      (err: GeolocationPositionError) => {
        activeRequestRef.current = false
        let msg: string
        switch (err.code) {
          case 1: // PERMISSION_DENIED
            msg =
              'Location permission denied. Please allow location access in your browser site settings. Note: Browsers require HTTPS or http://localhost, and device location services (GPS) must be turned on.'
            break
          case 2: // POSITION_UNAVAILABLE
            msg =
              'Current location is unavailable. Please check that your device GPS or Location Services are enabled and have a clear signal.'
            break
          case 3: // TIMEOUT
            msg =
              'Location request timed out. Please check your network and GPS connection and try again.'
            break
          default:
            msg = err.message || 'Unable to retrieve device location.'
            break
        }
        setState({
          status: 'error',
          errorMessage: msg,
        })
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      },
    )
  }, [])

  return {
    ...state,
    requestLocation,
    clearError,
  }
}
