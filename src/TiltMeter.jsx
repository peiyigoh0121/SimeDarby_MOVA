import { useEffect, useRef, useState } from 'react'

// TODO: Verify this placeholder against the Malaysian accessibility standard.
const MAX_SLOPE_DEGREES = 4.8

function TiltMeter({ onCapture }) {
  // These values keep the latest reading, the saved reading, and sensor status.
  const [liveAngle, setLiveAngle] = useState(null)
  const [capturedAngle, setCapturedAngle] = useState(null)
  const [manualAngle, setManualAngle] = useState('')
  const [sensorUnavailable, setSensorUnavailable] = useState(false)
  const [message, setMessage] = useState('')
  const timerRef = useRef(null)
  const listenerRef = useRef(null)
  const startAttemptRef = useRef(0)
  const startingRef = useRef(false)
  const mountedRef = useRef(false)

  // Stop the timer and sensor listener when this component goes away.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      startAttemptRef.current += 1
      startingRef.current = false
      window.clearTimeout(timerRef.current)
      if (listenerRef.current) window.removeEventListener('deviceorientation', listenerRef.current)
      listenerRef.current = null
    }
  }, [])

  // Ask iPhone browsers for permission, then listen for the phone's tilt.
  async function startSensor() {
    if (startingRef.current) return
    startingRef.current = true
    const attempt = ++startAttemptRef.current
    setMessage('')
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setSensorUnavailable(true)
      setMessage('This device does not provide an orientation sensor.')
      startingRef.current = false
      return
    }

    try {
      window.clearTimeout(timerRef.current)
      if (listenerRef.current) window.removeEventListener('deviceorientation', listenerRef.current)
      listenerRef.current = null
      const orientation = window.DeviceOrientationEvent
      // iOS Safari requires this permission request to happen after the button tap.
      if (typeof orientation?.requestPermission === 'function') {
        const permission = await orientation.requestPermission()
        if (permission !== 'granted') throw new Error('Permission was not granted.')
      }
      if (!mountedRef.current || attempt !== startAttemptRef.current) return

      // beta and gamma are degrees from the device; convert them to radians for cosine.
      function handleOrientation(event) {
        if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return
        const beta = (event.beta * Math.PI) / 180
        const gamma = (event.gamma * Math.PI) / 180
        const cosine = Math.max(-1, Math.min(1, Math.cos(beta) * Math.cos(gamma)))
        const tilt = (Math.acos(cosine) * 180) / Math.PI
        setLiveAngle(tilt)
        setSensorUnavailable(false)
        window.clearTimeout(timerRef.current)
      }

      listenerRef.current = handleOrientation
      window.addEventListener('deviceorientation', handleOrientation)
      // If no sensor reading arrives, show the manual angle option.
      timerRef.current = window.setTimeout(() => {
        if (!mountedRef.current || attempt !== startAttemptRef.current) return
        if (listenerRef.current) window.removeEventListener('deviceorientation', listenerRef.current)
        listenerRef.current = null
        setSensorUnavailable(true)
        setMessage('No sensor reading was received. Enter the angle manually.')
      }, 2500)
    } catch {
      if (!mountedRef.current || attempt !== startAttemptRef.current) return
      if (listenerRef.current) window.removeEventListener('deviceorientation', listenerRef.current)
      listenerRef.current = null
      setSensorUnavailable(true)
      setMessage('Sensor permission is unavailable. Enter the angle manually.')
    } finally {
      if (attempt === startAttemptRef.current) startingRef.current = false
    }
  }

  // Show the slope as a rise of 1 unit for the matching horizontal distance.
  function formatRatio(angle) {
    if (angle === null || angle <= 0) return '1:∞'
    const distance = Math.round(1 / Math.tan((angle * Math.PI) / 180))
    return `1:${Math.max(1, distance)}`
  }

  // Save the live reading, or the typed value when the sensor cannot be used.
  function captureMeasurement() {
    const value = sensorUnavailable && manualAngle !== '' ? Number(manualAngle) : liveAngle
    if (value !== null && Number.isFinite(value)) {
      setCapturedAngle(value)
      // Send the captured angle to the parent form when it provides a callback.
      if (typeof onCapture === 'function') onCapture(value)
    }
  }

  const shownAngle = sensorUnavailable && manualAngle !== '' ? Number(manualAngle) : liveAngle
  const passed = capturedAngle !== null && capturedAngle <= MAX_SLOPE_DEGREES

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8 text-left text-slate-900 sm:px-6">
      <div className="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-slate-200 sm:p-8">
        <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">Slope meter</h1>
        <p className="mb-6 text-sm text-slate-600">Measure a ramp slope with your phone.</p>

        <button type="button" aria-label="Start the phone tilt sensor" onClick={startSensor} className="min-h-12 w-full rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300">
          Start sensor
        </button>

        <section aria-live="polite" className="my-6 rounded-xl bg-slate-50 p-5 text-center">
          <p className="text-sm font-medium text-slate-600">Live slope</p>
          <p className="my-2 text-5xl font-bold tabular-nums text-slate-950 sm:text-6xl">
            {shownAngle === null ? '—' : `${shownAngle.toFixed(1)}°`}
          </p>
          <p className="text-slate-700">Ratio: {formatRatio(shownAngle)}</p>
        </section>

        {sensorUnavailable && (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="mb-3 text-sm text-amber-950">{message || 'Sensor unavailable. Enter the angle manually.'}</p>
            <label htmlFor="manual-angle" className="mb-1 block text-sm font-medium">Angle in degrees</label>
            <input id="manual-angle" aria-label="Enter the slope angle in degrees" type="number" min="0" max="90" step="0.1" value={manualAngle} onChange={(event) => setManualAngle(event.target.value)} className="min-h-12 w-full rounded-lg border border-slate-300 px-3 text-lg focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
        )}

        {message && !sensorUnavailable && <p role="status" className="mb-4 text-sm text-amber-800">{message}</p>}

        <button type="button" aria-label="Capture the current slope measurement" onClick={captureMeasurement} disabled={sensorUnavailable ? manualAngle === '' : liveAngle === null} className="min-h-12 w-full rounded-xl border-2 border-blue-700 px-5 py-3 font-semibold text-blue-800 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
          Capture measurement
        </button>

        {capturedAngle !== null && (
          <section className="mt-5 rounded-xl border border-slate-200 p-4" aria-live="polite">
            <p className="text-sm text-slate-600">Captured slope</p>
            <p className="text-xl font-bold">{capturedAngle.toFixed(1)}° <span className="text-base font-medium">({formatRatio(capturedAngle)})</span></p>
            <p className={`mt-2 text-lg font-bold ${passed ? 'text-green-700' : 'text-red-700'}`}>{passed ? 'PASS' : 'FAIL'}</p>
            <p className="text-sm text-slate-600">Maximum: {MAX_SLOPE_DEGREES}°</p>
          </section>
        )}

        <p className="mt-6 text-sm leading-relaxed text-slate-600">Phone sensors are approximate. Management should confirm on site.</p>
      </div>
    </main>
  )
}

export default TiltMeter
