import { useEffect, useRef, useState } from 'react'
import TiltMeter from './TiltMeter.jsx'
import { assessRamp } from './lib/assessRamp.js'
import { saveIssue } from './lib/saveIssue.js'

const ISSUE_TYPES = [
  'ramp',
  'blocked_tactile_paving',
  'broken_tactile_paving',
  'missing_handrail',
  'step_at_entrance',
  'lift_out_of_service',
  'drain_or_crossing',
  'pickup_point',
]

// Resize the image in the browser and return a smaller JPEG file.
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const temporaryUrl = URL.createObjectURL(file)
    const image = new Image()
    let urlReleased = false
    const releaseTemporaryUrl = () => {
      if (urlReleased) return
      urlReleased = true
      URL.revokeObjectURL(temporaryUrl)
    }
    image.onload = () => {
      releaseTemporaryUrl()
      try {
        const scale = Math.min(1, 1280 / image.naturalWidth)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.naturalWidth * scale)
        canvas.height = Math.round(image.naturalHeight * scale)
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('This browser could not prepare the photo.'))
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => {
          if (blob) resolve(blob)
          else reject(new Error('This browser could not compress the photo.'))
        }, 'image/jpeg', 0.82)
      } catch {
        reject(new Error('This browser could not prepare the photo.'))
      }
    }
    image.onerror = () => {
      releaseTemporaryUrl()
      reject(new Error('This photo could not be opened.'))
    }
    image.src = temporaryUrl
  })
}

// Turn the already-compressed photo into the text format sent to our server.
function photoToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1)
      if (base64Data) resolve(base64Data)
      else reject(new Error('The photo could not be read.'))
    }
    reader.onerror = () => reject(new Error('The photo could not be read.'))
    reader.readAsDataURL(blob)
  })
}

function displayPhotoAnswer(value) {
  if (value === null) return 'unclear'
  if (value === true) return 'yes'
  if (value === false) return 'no'
  return value
}

function ReportForm() {
  // Keep each answer in React state so the form can be connected to saving later.
  const [issueType, setIssueType] = useState('ramp')
  const [rampLength, setRampLength] = useState('')
  const [rampWidth, setRampWidth] = useState('')
  const [slopeAngle, setSlopeAngle] = useState(null)
  const [severity, setSeverity] = useState(3)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoMessage, setPhotoMessage] = useState('')
  const [aiPhotoCheck, setAiPhotoCheck] = useState(null)
  const [isCheckingPhoto, setIsCheckingPhoto] = useState(false)
  const [manualPhotoAnswers, setManualPhotoAnswers] = useState({
    handrail: 'unclear',
    surface: 'unclear',
    tactile_paving_blocked: 'unclear',
    blocked_by: '',
    tactile_paving_broken: 'unclear',
  })
  const [location, setLocation] = useState(null)
  const [locationMessage, setLocationMessage] = useState('')
  const [isLocating, setIsLocating] = useState(false)
  const [startedAt] = useState(() => new Date())
  const [currentStep, setCurrentStep] = useState(1)
  const photoInputRef = useRef(null)
  const savingRef = useRef(false)
  const checkingPhotoRef = useRef(false)
  const photoCheckRequestRef = useRef(0)
  const photoRequestRef = useRef(0)
  const locationRequestRef = useRef(0)
  const locationPendingRef = useRef(false)
  const mountedRef = useRef(false)
  const rampAssessment = assessRamp({
    slopeDegrees: slopeAngle,
    lengthM: rampLength === '' ? null : Number(rampLength),
    widthM: rampWidth === '' ? null : Number(rampWidth),
  })
  const stepTitles = ['Choose type and privacy', 'Measure', 'Photo and location', 'Review and submit']
  // Each step stays locked until its required information has been entered.
  function currentStepIsValid(step) {
    if (step === 1) return Boolean(issueType && privacyAgreed)
    if (step === 2) {
      return issueType !== 'ramp' || (
        slopeAngle !== null
        && Number.isFinite(slopeAngle)
        && Number(rampLength) > 0
        && Number(rampWidth) > 0
      )
    }
    if (step === 3) return Boolean(location) && (!photo || Boolean(aiPhotoCheck))
    return Boolean(privacyAgreed && location)
  }

  // Release old preview URLs, and invalidate pending work when the form closes.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      photoRequestRef.current += 1
      photoCheckRequestRef.current += 1
      locationRequestRef.current += 1
      locationPendingRef.current = false
    }
  }, [])

  useEffect(() => () => {
    photoRequestRef.current += 1
    if (photoPreview) URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  // Compress the chosen photo before keeping it in React state.
  async function handlePhotoChange(event) {
    const selectedFile = event.target.files?.[0]
    const requestId = ++photoRequestRef.current
    photoCheckRequestRef.current += 1
    if (!selectedFile) {
      setPhotoMessage('No photo was selected. If camera access was denied, allow it in your browser settings and try again.')
      return
    }
    setPhotoMessage('')
    setAiPhotoCheck(null)
    try {
      const compressedPhoto = await compressImage(selectedFile)
      if (!mountedRef.current || requestId !== photoRequestRef.current) return
      setPhoto(compressedPhoto)
      setPhotoPreview(URL.createObjectURL(compressedPhoto))
      setAiPhotoCheck(null)
    } catch (error) {
      if (!mountedRef.current || requestId !== photoRequestRef.current) return
      setPhoto(null)
      setPhotoMessage(error.message || 'The photo could not be prepared. Please try another photo.')
    }
    // Clear the picker so choosing the same photo again also triggers the change event.
    event.target.value = ''
  }

  // Send the compressed photo to our own server route, which keeps the Gemini key private.
  async function checkPhotoWithAI() {
    if (!photo || checkingPhotoRef.current) return
    checkingPhotoRef.current = true
    const requestId = ++photoCheckRequestRef.current
    setIsCheckingPhoto(true)
    setAiPhotoCheck(null)
    try {
      const imageBase64 = await photoToBase64(photo)
      const response = await fetch('/api/check-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType: photo.type || 'image/jpeg', issueType }),
      })
      if (!response.ok) throw new Error('The AI photo check could not be completed.')
      const result = await response.json()
      if (!result || typeof result !== 'object') throw new Error('The AI returned an invalid photo check.')
      if (mountedRef.current && requestId === photoCheckRequestRef.current) setAiPhotoCheck(result)
    } catch {
      if (mountedRef.current && requestId === photoCheckRequestRef.current) {
        setAiPhotoCheck({ error: 'The AI photo check failed. Please enter the details manually.' })
      }
    } finally {
      checkingPhotoRef.current = false
      if (mountedRef.current) setIsCheckingPhoto(false)
    }
  }

  const needsManualPhotoAnswers = Boolean(aiPhotoCheck?.error)
    || aiPhotoCheck?.handrail === 'unclear'
    || aiPhotoCheck?.surface === 'unclear'
    || aiPhotoCheck?.tactile_paving_blocked === null
    || aiPhotoCheck?.tactile_paving_broken === null

  // Ask the browser for a precise location and keep the result on this device.
  function getLocation() {
    if (locationPendingRef.current) return
    const requestId = ++locationRequestRef.current
    setLocationMessage('')
    if (!navigator.geolocation) {
      setLocationMessage('Location is not available in this browser.')
      return
    }
    locationPendingRef.current = true
    setIsLocating(true)
    try {
      navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mountedRef.current || requestId !== locationRequestRef.current) return
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
        locationPendingRef.current = false
        setIsLocating(false)
      },
      (error) => {
        if (!mountedRef.current || requestId !== locationRequestRef.current) return
        if (error.code === error.PERMISSION_DENIED) {
          setLocationMessage('Location permission was denied. Allow location access in your browser settings and try again.')
        } else if (error.code === error.TIMEOUT) {
          setLocationMessage('Finding your location took too long. Please try again.')
        } else {
          setLocationMessage('Your location could not be found. Check your GPS and try again.')
        }
        locationPendingRef.current = false
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      )
    } catch {
      if (mountedRef.current && requestId === locationRequestRef.current) {
        setLocationMessage('Your location could not be requested. Check your browser permissions and try again.')
        locationPendingRef.current = false
        setIsLocating(false)
      }
    }
  }

  // Send the report only after the person agrees and has a location reading.
  async function handleSubmit(event) {
    event.preventDefault()
    if (savingRef.current) return
    if (!location) {
      setSaveMessage({ ok: false, text: 'Get your location before submitting the report.' })
      return
    }

    savingRef.current = true
    setIsSaving(true)
    setSaveMessage(null)
    try {
      const result = await saveIssue({
        type: issueType,
        lat: location.lat,
        lng: location.lng,
        slope_degrees: slopeAngle,
        photoBlob: photo,
        severity: issueType === 'ramp' ? rampAssessment.severity : severity,
      })
      if (mountedRef.current) {
        setSaveMessage(result.ok
          ? { ok: true, text: `Report submitted successfully. Reference: ${result.id}` }
          : { ok: false, text: `Could not submit the report: ${result.error}` })
      }
    } catch {
      if (mountedRef.current) setSaveMessage({ ok: false, text: 'Could not submit the report. Please try again.' })
    } finally {
      savingRef.current = false
      if (mountedRef.current) setIsSaving(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 text-left text-slate-900 sm:px-6">
      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl bg-white p-5 shadow-lg ring-1 ring-slate-200 sm:p-8">
        <header>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Report an accessibility issue</h1>
          <p className="mt-2 text-sm text-slate-600">Record one issue at this location.</p>
          <p className="mt-2 text-xs text-slate-500">Report started: {startedAt.toLocaleString()}</p>
        </header>

        {/* This bar shows where the person is in the four-step report. */}
        <section aria-label="Report steps">
          <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium text-slate-700">
            <span>Step {currentStep} of 4: {stepTitles[currentStep - 1]}</span>
            <span>{Math.round((currentStep / 4) * 100)}%</span>
          </div>
          <div role="progressbar" aria-label="Report progress" aria-valuemin={1} aria-valuemax={4} aria-valuenow={currentStep} className="h-3 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${(currentStep / 4) * 100}%` }} />
          </div>
        </section>

        {currentStep === 1 && <section className="space-y-5" aria-labelledby="step-one-title">
          <h2 id="step-one-title" className="text-xl font-bold">Choose type and privacy</h2>
          <div>
            <label htmlFor="issue-type" className="mb-2 block text-sm font-semibold">Issue type</label>
            <select id="issue-type" aria-label="Issue type" value={issueType} onChange={(event) => { photoCheckRequestRef.current += 1; setIssueType(event.target.value); setAiPhotoCheck(null) }} className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200">
              {ISSUE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            {(issueType === 'ramp' || issueType.includes('tactile_paving')) && (
              <p className="mt-2 text-xs text-slate-500">Ramp and tactile paving reports are supported in this demo. Other types are listed for later.</p>
            )}
          </div>
          <label className="flex min-h-12 items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm leading-relaxed">
            <input type="checkbox" aria-label="Agree to share location and sensor data, with no photos of people" required checked={privacyAgreed} onChange={(event) => setPrivacyAgreed(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-blue-700" />
            <span>I agree to share my location and sensor data. No photos of people.</span>
          </label>
        </section>}

        {currentStep === 2 && <section className="space-y-5" aria-labelledby="step-two-title">
          <h2 id="step-two-title" className="text-xl font-bold">Measure</h2>
          <section className="rounded-xl border border-slate-200 p-4 sm:p-5" aria-label="Ramp slope measurement">
            <h3 className="mb-1 text-lg font-semibold">Ramp slope measurement</h3>
            <p className="mb-4 text-sm text-slate-600">Start the sensor and capture a reading. The captured angle will be included with this form.</p>
            <TiltMeter onCapture={setSlopeAngle} />
            <p className="mt-3 text-sm font-medium text-slate-700" aria-live="polite">
              {slopeAngle === null ? 'No angle captured yet.' : `Captured angle for this report: ${slopeAngle.toFixed(1)}°`}
            </p>
          </section>
          {issueType === 'ramp' && (
            <section className="grid gap-4 sm:grid-cols-2" aria-label="Ramp measurements">
              <div>
                <label htmlFor="ramp-length" className="mb-2 block text-sm font-semibold">Ramp length (metres)</label>
                <input id="ramp-length" aria-label="Ramp length in metres" type="number" min="0" step="0.01" inputMode="decimal" value={rampLength} onChange={(event) => setRampLength(event.target.value)} className="min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
              <div>
                <label htmlFor="ramp-width" className="mb-2 block text-sm font-semibold">Ramp width (metres)</label>
                <input id="ramp-width" aria-label="Ramp width in metres" type="number" min="0" step="0.01" inputMode="decimal" value={rampWidth} onChange={(event) => setRampWidth(event.target.value)} className="min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
            </section>
          )}
        </section>}

        {currentStep === 3 && <section className="space-y-5" aria-labelledby="step-three-title">
          <h2 id="step-three-title" className="text-xl font-bold">Photo, location and AI check</h2>
        <section className="space-y-3" aria-label="Photo evidence">
          <h2 className="text-lg font-semibold">Photo (optional)</h2>
          <input ref={photoInputRef} aria-label="Choose or take an issue photo" type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} onCancel={() => setPhotoMessage('Camera or photo access was not completed. Allow camera access in your browser settings and try again.')} className="sr-only" />
          <button type="button" aria-label="Take photo of the accessibility issue" onClick={() => photoInputRef.current?.click()} className="min-h-12 w-full rounded-xl border-2 border-blue-700 px-5 py-3 font-semibold text-blue-800 hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-200">
            Take photo
          </button>
          {photoMessage && <p role="status" className="text-sm text-red-700">{photoMessage}</p>}
          {photo && photoPreview && (
            <div className="space-y-2">
              <img src={photoPreview} alt="Preview of the compressed report photo" className="max-h-72 w-full rounded-xl object-contain ring-1 ring-slate-200" />
              <p className="text-xs text-slate-500">Photo ready on this device ({Math.round(photo.size / 1024)} KB, max width 1280 px).</p>
              <button type="button" aria-label="Check the photo with AI" onClick={checkPhotoWithAI} disabled={isCheckingPhoto} className="min-h-12 w-full rounded-xl border-2 border-indigo-700 px-5 py-3 font-semibold text-indigo-800 hover:bg-indigo-50 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-wait disabled:opacity-50">
                {isCheckingPhoto ? 'Checking photo…' : 'Check photo with AI'}
              </button>
            </div>
          )}
          {aiPhotoCheck?.error && <p role="alert" className="text-sm text-amber-800">{aiPhotoCheck.error}</p>}
          {aiPhotoCheck && !aiPhotoCheck.error && (
            <div className="space-y-2 rounded-lg bg-indigo-50 p-3 text-sm" aria-live="polite">
              <p className="font-semibold text-indigo-950">AI photo observations (please check them):</p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1">Handrail: {aiPhotoCheck.handrail}</span>
                <span className="rounded-full bg-white px-3 py-1">Surface: {aiPhotoCheck.surface}</span>
                <span className="rounded-full bg-white px-3 py-1">Tactile blocked: {displayPhotoAnswer(aiPhotoCheck.tactile_paving_blocked)}</span>
                <span className="rounded-full bg-white px-3 py-1">Tactile broken: {displayPhotoAnswer(aiPhotoCheck.tactile_paving_broken)}</span>
              </div>
              {aiPhotoCheck.blocked_by && <p>Visible obstruction: {aiPhotoCheck.blocked_by}</p>}
              {aiPhotoCheck.notes && <p>{aiPhotoCheck.notes}</p>}
            </div>
          )}
          {needsManualPhotoAnswers && (
            <fieldset className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <legend className="px-1 text-sm font-semibold text-amber-950">Set unclear answers manually</legend>
              <div>
                <label htmlFor="manual-handrail" className="mb-1 block text-sm font-medium">Handrail</label>
                <select id="manual-handrail" aria-label="Set the handrail photo answer" value={manualPhotoAnswers.handrail} onChange={(event) => setManualPhotoAnswers({ ...manualPhotoAnswers, handrail: event.target.value })} className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3">
                  <option value="unclear">Unclear</option><option value="present">Present</option><option value="absent">Absent</option>
                </select>
              </div>
              <div>
                <label htmlFor="manual-surface" className="mb-1 block text-sm font-medium">Surface</label>
                <select id="manual-surface" aria-label="Set the surface photo answer" value={manualPhotoAnswers.surface} onChange={(event) => setManualPhotoAnswers({ ...manualPhotoAnswers, surface: event.target.value })} className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3">
                  <option value="unclear">Unclear</option><option value="rough">Rough</option><option value="smooth">Smooth</option><option value="tiled">Tiled</option>
                </select>
              </div>
              <div>
                <label htmlFor="manual-tactile-blocked" className="mb-1 block text-sm font-medium">Tactile paving blocked</label>
                <select id="manual-tactile-blocked" aria-label="Set whether tactile paving is blocked" value={manualPhotoAnswers.tactile_paving_blocked} onChange={(event) => setManualPhotoAnswers({ ...manualPhotoAnswers, tactile_paving_blocked: event.target.value })} className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3">
                  <option value="unclear">Unclear</option><option value="true">Yes</option><option value="false">No</option>
                </select>
              </div>
              <div>
                <label htmlFor="manual-blocked-by" className="mb-1 block text-sm font-medium">Blocked by (if known)</label>
                <input id="manual-blocked-by" aria-label="Describe what blocks the tactile paving, if known" value={manualPhotoAnswers.blocked_by} onChange={(event) => setManualPhotoAnswers({ ...manualPhotoAnswers, blocked_by: event.target.value })} className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3" />
              </div>
              <div>
                <label htmlFor="manual-tactile-broken" className="mb-1 block text-sm font-medium">Tactile paving broken</label>
                <select id="manual-tactile-broken" aria-label="Set whether tactile paving is broken" value={manualPhotoAnswers.tactile_paving_broken} onChange={(event) => setManualPhotoAnswers({ ...manualPhotoAnswers, tactile_paving_broken: event.target.value })} className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3">
                  <option value="unclear">Unclear</option><option value="true">Yes</option><option value="false">No</option>
                </select>
              </div>
            </fieldset>
          )}
        </section>

        <section className="space-y-3" aria-label="Location">
          <div>
            <h2 className="text-lg font-semibold">Location</h2>
            <p className="text-sm text-slate-600">Your location stays on this device for now.</p>
          </div>
          <button type="button" aria-label="Get current location" onClick={getLocation} disabled={isLocating} className="min-h-12 w-full rounded-xl border-2 border-blue-700 px-5 py-3 font-semibold text-blue-800 hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:opacity-50">
            {isLocating ? 'Getting location…' : 'Get location'}
          </button>
          {locationMessage && <p role="alert" className="text-sm text-red-700">{locationMessage}</p>}
          {location && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm" aria-live="polite">
              <p>Latitude: {location.lat.toFixed(6)}</p>
              <p>Longitude: {location.lng.toFixed(6)}</p>
              <p>Accuracy: {Math.round(location.accuracy)} metres</p>
              {location.accuracy > 50 && <p className="mt-2 font-medium text-amber-800">GPS accuracy is worse than 50 metres. Try again somewhere with a clearer view of the sky.</p>}
            </div>
          )}
        </section>
        </section>}

        {currentStep === 4 && <section className="space-y-5" aria-labelledby="step-four-title">
          <h2 id="step-four-title" className="text-xl font-bold">Review result and submit</h2>
          <section className="rounded-xl bg-slate-50 p-4 text-sm" aria-label="Report summary">
            <p><strong>Issue type:</strong> {issueType}</p>
            {slopeAngle !== null && <p><strong>Captured slope:</strong> {slopeAngle.toFixed(1)}°</p>}
            {issueType === 'ramp' && <p><strong>Ramp size:</strong> {rampLength || '—'} m long × {rampWidth || '—'} m wide</p>}
            <p><strong>Photo:</strong> {photo ? 'Attached' : 'Not added (optional)'}</p>
            <p><strong>Location:</strong> {location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} (±${Math.round(location.accuracy)} m)` : 'Not added'}</p>
          </section>
          {issueType !== 'ramp' && <div>
            <label htmlFor="issue-severity" className="mb-2 block text-sm font-semibold">Severity</label>
            <select id="issue-severity" aria-label="Issue severity" value={severity} onChange={(event) => setSeverity(Number(event.target.value))} className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value={1}>1 - Low</option><option value={2}>2</option><option value={3}>3 - Medium</option><option value={4}>4</option><option value={5}>5 - High</option>
            </select>
          </div>}
          {issueType === 'ramp' && <section aria-live="polite" className={`rounded-xl border p-4 ${rampAssessment.result === 'pass' ? 'border-green-200 bg-green-50' : rampAssessment.result === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
            <h3 className="text-lg font-semibold">Ramp assessment: <span className="capitalize">{rampAssessment.result}</span></h3>
            <p className="mt-1 text-sm font-medium">Severity: {rampAssessment.severity} / 5</p>
            {rampAssessment.reasons.length > 0 && <ul className="mt-2 list-inside list-disc space-y-1 text-sm">{rampAssessment.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
            <p className="mt-3 text-sm">Phone sensors are approximate. Management should confirm on site.</p>
          </section>}
          <button type="submit" aria-label="Submit accessibility issue report" disabled={!currentStepIsValid(4) || isSaving} className="min-h-12 w-full rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50">
            {isSaving ? 'Submitting report…' : 'Submit report'}
          </button>
          {saveMessage && <p role="status" className={`rounded-lg p-3 text-sm font-medium ${saveMessage.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{saveMessage.text}</p>}
        </section>}

        <nav className="flex gap-3" aria-label="Report navigation">
          {currentStep > 1 && <button type="button" aria-label="Go to the previous report step" onClick={() => setCurrentStep((step) => step - 1)} className="min-h-12 flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200">Back</button>}
          {currentStep < 4 && <button type="button" aria-label="Continue to the next report step" onClick={() => setCurrentStep((step) => step + 1)} disabled={!currentStepIsValid(currentStep)} className="min-h-12 flex-1 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50">Next</button>}
        </nav>
      </form>
    </main>
  )
}

export default ReportForm
