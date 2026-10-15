import { useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from './lib/supabaseClient.js'

const SAMPLE_INTERVAL_MS = 2000
const BUMPINESS_THRESHOLD_MPS2 = 1.5
const STEEP_THRESHOLD_DEGREES = 4.8
const VISIBLE_SIGNAL_COUNT = 8
const MAX_STORED_SIGNALS = 500

// Measure changes in acceleration magnitude during one two-second window.
function standardDeviation(samples) {
  if (samples.length < 2) return null
  const mean = samples.reduce((total, sample) => total + sample, 0) / samples.length
  const variance = samples.reduce((total, sample) => total + ((sample - mean) ** 2), 0) / samples.length
  return Math.sqrt(variance)
}

// Try the shared Supabase client and quietly ignore missing-table or network errors.
async function saveSignalsIfTableExists(newSignals) {
  try {
    const supabase = getSupabaseClient()
    await supabase.from('signals').insert(newSignals)
  } catch {
    // Local signals and the JSON download remain available if saving does not work.
  }
}

function MotionLogger() {
  // Keep sharing off until the person actively turns on the opt-in switch.
  const [sharing, setSharing] = useState(false)
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)
  const [signals, setSignals] = useState([])
  const [statusMessage, setStatusMessage] = useState('Motion and location are off.')
  const [currentBumpiness, setCurrentBumpiness] = useState(null)
  const [currentTilt, setCurrentTilt] = useState(null)
  const samplesRef = useRef([])
  const locationRef = useRef(null)
  const tiltRef = useRef(null)
  const permissionRequestRef = useRef(0)
  const permissionPendingRef = useRef(false)

  // Ignore a permission prompt result if the component closes while it is open.
  useEffect(() => () => {
    permissionRequestRef.current += 1
    permissionPendingRef.current = false
  }, [])

  // Request iPhone sensor permission from the person's switch tap when required.
  async function handleSharingChange(event) {
    if (!event.target.checked) {
      permissionRequestRef.current += 1
      permissionPendingRef.current = false
      setIsRequestingPermission(false)
      setSharing(false)
      setStatusMessage('Motion and location are off.')
      return
    }

    if (permissionPendingRef.current) return
    permissionPendingRef.current = true
    setIsRequestingPermission(true)
    const requestId = ++permissionRequestRef.current

    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      permissionPendingRef.current = false
      setIsRequestingPermission(false)
      setStatusMessage('Motion sensors are not available on this device.')
      return
    }

    try {
      const motionEvent = window.DeviceMotionEvent
      if (typeof motionEvent.requestPermission === 'function') {
        const permission = await motionEvent.requestPermission()
        if (permission !== 'granted') {
          if (requestId === permissionRequestRef.current) setStatusMessage('Motion permission was not granted. Nothing is being recorded.')
          return
        }
      }
      if (requestId !== permissionRequestRef.current) return
      samplesRef.current = []
      locationRef.current = null
      tiltRef.current = null
      setCurrentBumpiness(null)
      setCurrentTilt(null)
      setStatusMessage('Starting motion and location sensors…')
      setSharing(true)
    } catch {
      if (requestId === permissionRequestRef.current) setStatusMessage('Motion permission could not be requested. Nothing is being recorded.')
    } finally {
      if (requestId === permissionRequestRef.current) {
        permissionPendingRef.current = false
        setIsRequestingPermission(false)
      }
    }
  }

  // Start sensors only while the opt-in switch is on, and stop them when it turns off.
  useEffect(() => {
    if (!sharing) return undefined

    function handleMotion(event) {
      const acceleration = event.acceleration || event.accelerationIncludingGravity
      if (!acceleration || !Number.isFinite(acceleration.x) || !Number.isFinite(acceleration.y) || !Number.isFinite(acceleration.z)) return
      const magnitude = Math.sqrt((acceleration.x ** 2) + (acceleration.y ** 2) + (acceleration.z ** 2))
      if (Number.isFinite(magnitude)) samplesRef.current.push(magnitude)
    }

    function handleOrientation(event) {
      if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return
      const beta = (event.beta * Math.PI) / 180
      const gamma = (event.gamma * Math.PI) / 180
      const cosine = Math.max(-1, Math.min(1, Math.cos(beta) * Math.cos(gamma)))
      tiltRef.current = (Math.acos(cosine) * 180) / Math.PI
    }

    window.addEventListener('devicemotion', handleMotion)
    window.addEventListener('deviceorientation', handleOrientation)

    let watchId
    let startupMessageTimer
    let active = true
    if (navigator.geolocation) {
      try {
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            if (!active) return
            locationRef.current = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }
            setStatusMessage('Sharing motion and location while this switch is on.')
          },
          (error) => {
            if (!active) return
            if (error.code === error.PERMISSION_DENIED) {
              setStatusMessage('Location permission was not granted. Turn sharing off to stop sensor listening.')
            } else {
              setStatusMessage('Waiting for a GPS position. Signals need a location to be saved.')
            }
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
        )
      } catch {
        // Defer this synchronous API error to the next browser turn.
        startupMessageTimer = window.setTimeout(() => {
          if (active) setStatusMessage('Location could not be started. Check that this page uses a secure connection.')
        }, 0)
      }
    }

    const intervalId = window.setInterval(() => {
      if (!active) return
      const samples = samplesRef.current
      samplesRef.current = []
      const bumpiness = standardDeviation(samples)
      const tilt = tiltRef.current
      setCurrentBumpiness(bumpiness)
      setCurrentTilt(tilt)

      const position = locationRef.current
      if (!position) {
        if (bumpiness !== null && bumpiness > BUMPINESS_THRESHOLD_MPS2) {
          setStatusMessage('A bumpy signal was noticed; waiting for GPS before recording it.')
        }
        return
      }

      const timestamp = new Date().toISOString()
      const newSignals = []
      if (bumpiness !== null && bumpiness > BUMPINESS_THRESHOLD_MPS2) {
        newSignals.push({ type: 'bumpy', value: Number(bumpiness.toFixed(2)), ...position, timestamp })
      }
      if (tilt !== null && tilt > STEEP_THRESHOLD_DEGREES) {
        newSignals.push({ type: 'steep', value: Number(tilt.toFixed(1)), ...position, timestamp })
      }

      if (newSignals.length > 0) {
        setSignals((previousSignals) => [...newSignals, ...previousSignals].slice(0, MAX_STORED_SIGNALS))
        // The signals list and download keep working even when this table is absent.
        void saveSignalsIfTableExists(newSignals)
      }
    }, SAMPLE_INTERVAL_MS)

    return () => {
      active = false
      window.clearTimeout(startupMessageTimer)
      window.removeEventListener('devicemotion', handleMotion)
      window.removeEventListener('deviceorientation', handleOrientation)
      window.clearInterval(intervalId)
      if (watchId !== undefined && navigator.geolocation) navigator.geolocation.clearWatch(watchId)
    }
  }, [sharing])

  // Download every signal collected in this session as a JSON file.
  function downloadSignals() {
    const blob = new Blob([JSON.stringify(signals, null, 2)], { type: 'application/json' })
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = 'motion-signals.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
  }

  const visibleSignals = signals.slice(0, VISIBLE_SIGNAL_COUNT)
  const visibleStatusMessage = typeof navigator !== 'undefined' && !navigator.geolocation
    ? 'Location is not available, so no signals can be recorded.'
    : statusMessage

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 text-left text-slate-900 sm:px-6" aria-labelledby="motion-logger-title">
      <div className="space-y-5 rounded-2xl bg-white p-5 shadow-lg ring-1 ring-slate-200 sm:p-8">
        <div>
          <h2 id="motion-logger-title" className="text-xl font-bold sm:text-2xl">Optional motion signals</h2>
          <p className="mt-2 text-sm text-slate-600">This feature listens only while you opt in. It uses location and sensor data only, with no photos.</p>
        </div>

        <label className="flex min-h-12 items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm leading-relaxed">
          <input type="checkbox" aria-label="Share motion and location data while moving" checked={sharing || isRequestingPermission} onChange={handleSharingChange} className="mt-1 h-5 w-5 shrink-0 accent-blue-700" />
          <span>Share motion data while I move (location and sensor data only, no photos)</span>
        </label>

        <p role="status" aria-live="polite" className="text-sm text-slate-600">{visibleStatusMessage}</p>

        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-center">
          <div>
            <p className="text-xs font-medium text-slate-500">Bumpiness (m/s²)</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{currentBumpiness === null ? '—' : currentBumpiness.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Current tilt</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{currentTilt === null ? '—' : `${currentTilt.toFixed(1)}°`}</p>
          </div>
        </div>
        <p className="text-xs text-slate-500">Signals are created when bumpiness exceeds {BUMPINESS_THRESHOLD_MPS2} m/s² or tilt exceeds {STEEP_THRESHOLD_DEGREES}°.</p>

        <div>
          <h3 className="mb-2 font-semibold">Recent signals</h3>
          {visibleSignals.length === 0 ? (
            <p className="text-sm text-slate-500">No signals recorded in this session yet.</p>
          ) : (
            <ul className="space-y-2">
              {visibleSignals.map((signal, index) => (
                <li key={`${signal.timestamp}-${signal.type}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                  <span className={`rounded-full px-3 py-1 font-semibold ${signal.type === 'bumpy' ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-900'}`}>{signal.type}</span>
                  <span className="font-medium">{signal.value}{signal.type === 'bumpy' ? ' m/s²' : '°'}</span>
                  <time className="text-xs text-slate-500" dateTime={signal.timestamp}>{new Date(signal.timestamp).toLocaleTimeString()}</time>
                  <span className="w-full text-xs text-slate-500">{signal.lat.toFixed(5)}, {signal.lng.toFixed(5)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button type="button" onClick={downloadSignals} disabled={signals.length === 0} className="min-h-12 w-full rounded-xl border-2 border-blue-700 px-5 py-3 font-semibold text-blue-800 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
          Download signals as JSON
        </button>
      </div>
    </section>
  )
}

export default MotionLogger
