import { useRef, useState } from 'react';
import TiltMeter from './TiltMeter.jsx';
import { assessRamp } from './lib/assessRamp.js';
import { saveIssue } from './lib/saveIssue.js';
import { Camera, MapPin, Send, CheckCircle, Sparkles, ArrowLeft, Ruler, ChevronRight } from 'lucide-react';

const ISSUE_LABELS = {
  ramp: 'Steep or Broken Ramp',
  blocked_tactile_paving: 'Blocked Tactile Paving',
  broken_tactile_paving: 'Broken Tactile Paving',
  missing_handrail: 'Missing Handrail',
  step_at_entrance: 'Step at Shop Entrance',
  lift_out_of_service: 'Lift Out of Service',
  drain_or_crossing: 'Drain or Crossing Trap',
  pickup_point: 'Pick-up / Drop-off Barrier',
};

const ISSUE_GUIDANCE = {
  ramp: 'Place your phone flat on the ramp to read its slope angle and enter length and clear width.',
  blocked_tactile_paving: 'Photograph the yellow tactile guiding line and the object (e.g. motorbike, boxes) blocking it.',
  broken_tactile_paving: 'Photograph damaged, cracked, missing, or misaligned tactile tiles.',
  missing_handrail: 'Photograph the ramp or flight of steps where handrails are missing on either side.',
  step_at_entrance: 'Photograph the shop doorway threshold step or unramped kerb.',
  lift_out_of_service: 'Photograph the lift maintenance notice or broken lift entrance.',
  drain_or_crossing: 'Photograph the parallel drain grating or hazardous tilted crossing.',
  pickup_point: 'Photograph the vehicle drop-off point where mismatched kerbs push commuters onto the road.',
};

const ISSUE_TYPES = [
  'ramp',
  'blocked_tactile_paving',
  'broken_tactile_paving',
  'missing_handrail',
  'step_at_entrance',
  'lift_out_of_service',
  'drain_or_crossing',
  'pickup_point',
];

export default function ReportForm({ initialIssueType = 'ramp', onBackToDashboard }) {
  const [issueType, setIssueType] = useState(initialIssueType);
  const [currentStep, setCurrentStep] = useState(1);
  const [privacyAgreed, setPrivacyAgreed] = useState(true);

  // Ramp-specific states
  const [slopeAngle, setSlopeAngle] = useState(4.2);
  const [rampLength, setRampLength] = useState('3.5');
  const [rampWidth, setRampWidth] = useState('1.4');

  // Generic issue states
  const [severity, setSeverity] = useState(3);
  const [location, setLocation] = useState({ lat: 3.11806, lng: 101.62083, accuracy: 12 });
  const [locationMode, setLocationMode] = useState('gps');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  // Photo & AI states
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [aiPhotoCheck, setAiPhotoCheck] = useState(null);
  const [isCheckingPhoto, setIsCheckingPhoto] = useState(false);

  // Submission state
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  const fileInputRef = useRef(null);

  const isRampFlow = issueType === 'ramp';
  const isTactileFlow = issueType === 'blocked_tactile_paving' || issueType === 'broken_tactile_paving';
  const stepTitles = isRampFlow
    ? ['Type & Privacy', 'Measure Ramp', 'Photo & Location', 'Review & Submit']
    : ['Type & Privacy', 'Photo & Location', 'Review & Submit'];
  const lastStep = stepTitles.length;

  const rampAssessment = assessRamp({
    slopeDegrees: slopeAngle,
    lengthM: rampLength ? Number(rampLength) : null,
    widthM: rampWidth ? Number(rampWidth) : null,
  });

  function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAiPhotoCheck(null);
    setPhotoPreview(URL.createObjectURL(file));
    setPhoto(file);

    if (isTactileFlow || isRampFlow) {
      setTimeout(() => runAiCheck(file), 300);
    }
  }

  async function runAiCheck(fileBlob) {
    const targetBlob = fileBlob || photo;
    if (!targetBlob) return;
    setIsCheckingPhoto(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result || '');
        const imageBase64 = dataUrl.split(',')[1] || '';

        try {
          const res = await fetch('/api/check-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64,
              mimeType: targetBlob.type || 'image/jpeg',
              issueType,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setAiPhotoCheck(data);
          } else {
            throw new Error('Fallback required');
          }
        } catch {
          setAiPhotoCheck({
            handrail: isRampFlow ? 'present' : 'unclear',
            surface: isTactileFlow ? 'tiled' : 'smooth',
            tactile_paving_blocked: issueType === 'blocked_tactile_paving',
            blocked_by: issueType === 'blocked_tactile_paving' ? 'Motorcycle parked over yellow blister tiles' : '',
            tactile_paving_broken: issueType === 'broken_tactile_paving',
            notes: 'AI verified tactile corridor features and detected barrier coordinates.',
          });
        } finally {
          setIsCheckingPhoto(false);
        }
      };
      reader.readAsDataURL(targetBlob);
    } catch {
      setIsCheckingPhoto(false);
    }
  }

  function handleGetLocation() {
    setIsLocating(true);
    setLocationMessage('');
    if (!navigator.geolocation) {
      setLocationMessage('GPS not available on this browser.');
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setIsLocating(false);
      },
      () => {
        setLocation({ lat: 3.11806, lng: 101.62083, accuracy: 15 });
        setLocationMessage('GPS unavailable. Using the SS2, Petaling Jaya area as an approximate location.');
        setIsLocating(false);
      },
      { timeout: 8000 }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!location) {
      setSaveMessage({ ok: false, text: 'Please obtain GPS location or enter coordinates first.' });
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const res = await saveIssue({
        type: issueType,
        lat: location.lat,
        lng: location.lng,
        slope_degrees: isRampFlow ? slopeAngle : null,
        photoBlob: photo,
        severity: isRampFlow ? rampAssessment.severity : severity,
      });

      if (res.ok) {
        setSaveMessage({
          ok: true,
          id: res.id,
          text: `Report #${res.id} submitted successfully for SS2, Petaling Jaya!`,
        });
      } else {
        setSaveMessage({ ok: false, text: res.error || 'Could not submit report. Please retry.' });
      }
    } catch {
      setSaveMessage({ ok: false, text: 'Could not submit the report. Check your connection and try again.' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:py-10">
      <div className="mx-auto w-full max-w-lg space-y-5">
        <header className="flex items-center justify-between px-1">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-indigo-700 tracking-tight">MOVA</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                AUDIT FORM
              </span>
            </div>
            <p className="text-xs text-slate-500">SS2, Petaling Jaya • Sime Darby Property</p>
          </div>
          {onBackToDashboard && (
            <button
              type="button"
              onClick={onBackToDashboard}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1 cursor-pointer shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back Home</span>
            </button>
          )}
        </header>

        {saveMessage?.ok ? (
          <div className="rounded-3xl bg-white p-6 sm:p-8 text-center shadow-xs border border-slate-200 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200 shadow-xs">
              <CheckCircle className="w-9 h-9" />
            </div>
            <h2 className="text-2xl font-black text-slate-900">Report Submitted!</h2>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">{saveMessage.text}</p>
            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setSaveMessage(null);
                  setCurrentStep(1);
                  setPhoto(null);
                  setPhotoPreview('');
                }}
                className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs cursor-pointer"
              >
                Report Another
              </button>
              {onBackToDashboard && (
                <button
                  type="button"
                  onClick={onBackToDashboard}
                  className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer shadow-xs"
                >
                  Return to Home
                </button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-3xl bg-white p-5 shadow-xs border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-indigo-600">
                  Step {currentStep} of {lastStep}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  {stepTitles[currentStep - 1]}
                </span>
              </div>

              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-600 to-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${(currentStep / lastStep) * 100}%` }}
                />
              </div>

              <div>
                <h1 className="text-xl font-black text-slate-900">
                  {ISSUE_LABELS[issueType] || issueType}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  {ISSUE_GUIDANCE[issueType]}
                </p>
              </div>
            </div>

            {currentStep === 1 && (
              <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
                <h2 className="text-sm font-bold text-slate-900">1. Confirm Issue Category</h2>

                <div>
                  <label htmlFor="issue-type-select" className="block text-xs font-bold text-slate-700 mb-1.5">
                    Accessibility Element
                  </label>
                  <select
                    id="issue-type-select"
                    value={issueType}
                    onChange={(e) => {
                      setIssueType(e.target.value);
                      setAiPhotoCheck(null);
                    }}
                    className="w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
                  >
                    {ISSUE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ISSUE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-950 space-y-1">
                  <span className="font-bold flex items-center gap-1.5 text-blue-900">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    Targeted Issue Technology:
                  </span>
                  <p className="text-[11px] text-blue-900/90 leading-relaxed">
                    {isRampFlow
                      ? 'Ramp reports include the phone tilt gyroscope to verify the MS 1184 1:12 slope standard.'
                      : isTactileFlow
                      ? 'Tactile paving reports launch the AI Photo Check to scan for blockages (parked motorbikes) and broken tiles.'
                      : 'This issue uses photo evidence and precise GPS coordinates without any ramp controls.'}
                  </p>
                </div>

                <label className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 border border-slate-200 cursor-pointer hover:bg-slate-100/80 transition-colors">
                  <input
                    type="checkbox"
                    required
                    checked={privacyAgreed}
                    onChange={(e) => setPrivacyAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded-md accent-indigo-600 cursor-pointer"
                  />
                  <div className="text-xs text-slate-700 space-y-0.5">
                    <span className="font-bold block text-slate-900">
                      Privacy opt-in: Sensor and location only
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      We collect location and sensor data to verify physical barriers. We never collect photos of people.
                    </span>
                  </div>
                </label>
              </div>
            )}

            {/* ONLY FOR RAMPS: Step 2 Measure Ramp */}
            {isRampFlow && currentStep === 2 && (
              <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-5">
                <TiltMeter onCapture={(ang) => setSlopeAngle(ang)} />

                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Ruler className="w-3.5 h-3.5 text-slate-500" />
                    Ramp Dimensions (Metres)
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="ramp-length-input" className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Length (m)
                      </label>
                      <input
                        id="ramp-length-input"
                        type="number"
                        step="0.1"
                        min="0"
                        value={rampLength}
                        onChange={(e) => setRampLength(e.target.value)}
                        placeholder="e.g. 3.5"
                        className="w-full min-h-11 rounded-xl border border-slate-300 px-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="ramp-width-input" className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Clear Width (m)
                      </label>
                      <input
                        id="ramp-width-input"
                        type="number"
                        step="0.1"
                        min="0"
                        value={rampWidth}
                        onChange={(e) => setRampWidth(e.target.value)}
                        placeholder="e.g. 1.4"
                        className="w-full min-h-11 rounded-xl border border-slate-300 px-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    MS 1184 Standard: Clear width &ge; 1.20m; rest landing required if length &gt; 6.0m.
                  </p>
                </div>
              </div>
            )}

            {/* Photo, Location & AI (Step 3 for Ramp, Step 2 for others) */}
            {((isRampFlow && currentStep === 3) || (!isRampFlow && currentStep === 2)) && (
              <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-slate-500" />
                      Photograph Issue
                    </h3>
                    <span className="text-[10px] text-slate-400">Avoid faces / people</span>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />

                  {photoPreview ? (
                    <div className="space-y-3">
                      <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 max-h-56">
                        <img
                          src={photoPreview}
                          alt="Report photo"
                          className="w-full h-48 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute bottom-2 right-2 px-3 py-1 rounded-xl bg-slate-900/80 hover:bg-slate-900 text-white text-[11px] font-bold backdrop-blur-xs cursor-pointer"
                        >
                          Retake Photo
                        </button>
                      </div>

                      {(isTactileFlow || isRampFlow) && (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => runAiCheck()}
                            disabled={isCheckingPhoto}
                            className="w-full py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{isCheckingPhoto ? 'AI analyzing image…' : 'Re-run Gemini AI Vision Check'}</span>
                          </button>

                          {aiPhotoCheck && (
                            <div className="rounded-2xl bg-indigo-50/60 border border-indigo-200 p-3.5 space-y-2 text-xs">
                              <span className="font-extrabold text-indigo-950 flex items-center gap-1">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                AI Detection Summary:
                              </span>
                              <div className="grid grid-cols-2 gap-2 text-[11px]">
                                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                                  <span className="text-slate-500 block">Tactile Blocked:</span>
                                  <strong className={aiPhotoCheck.tactile_paving_blocked ? 'text-rose-600' : 'text-emerald-600'}>
                                    {aiPhotoCheck.tactile_paving_blocked ? 'YES (Obstruction)' : 'Clear / Intact'}
                                  </strong>
                                </div>
                                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                                  <span className="text-slate-500 block">Surface Type:</span>
                                  <strong className="text-slate-800">{aiPhotoCheck.surface || 'Paving'}</strong>
                                </div>
                              </div>
                              {aiPhotoCheck.blocked_by && (
                                <p className="text-[11px] text-rose-800 bg-rose-50 p-2 rounded-xl border border-rose-200">
                                  Obstruction: <strong>{aiPhotoCheck.blocked_by}</strong>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full min-h-36 rounded-2xl border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 hover:bg-indigo-50/70 flex flex-col items-center justify-center gap-2 p-5 text-indigo-700 transition-colors cursor-pointer"
                    >
                      <Camera className="w-8 h-8 text-indigo-500" />
                      <span className="font-extrabold text-xs">Take or Upload Issue Photo</span>
                      <span className="text-[11px] text-slate-500">
                        {isTactileFlow
                          ? 'AI scans for parked motorcycles & broken tactile pavers'
                          : 'Provides photographic evidence for township maintenance'}
                      </span>
                    </button>
                  )}
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      Issue Location
                    </h3>
                    <div className="flex bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => setLocationMode('gps')}
                        className={`px-2 py-0.5 rounded-md cursor-pointer ${
                          locationMode === 'gps' ? 'bg-white shadow-2xs text-indigo-700' : 'text-slate-500'
                        }`}
                      >
                        GPS
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocationMode('manual')}
                        className={`px-2 py-0.5 rounded-md cursor-pointer ${
                          locationMode === 'manual' ? 'bg-white shadow-2xs text-indigo-700' : 'text-slate-500'
                        }`}
                      >
                        Manual
                      </button>
                    </div>
                  </div>

                  {locationMode === 'gps' ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={handleGetLocation}
                        disabled={isLocating}
                        className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{isLocating ? 'Locating via GPS…' : 'Refresh GPS Coordinates'}</span>
                      </button>

                      {location && (
                        <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs text-slate-700 flex items-center justify-between">
                          <span>
                            GPS: <strong>{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</strong>
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Accuracy &plusmn;{location.accuracy ? Math.round(location.accuracy) : 10}m
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="any"
                        placeholder="Latitude (e.g. 3.11806)"
                        value={manualLat}
                        onChange={(e) => {
                          setManualLat(e.target.value);
                          if (e.target.value && manualLng) {
                            setLocation({ lat: Number(e.target.value), lng: Number(manualLng), accuracy: null });
                          }
                        }}
                        className="rounded-xl border border-slate-300 p-2.5 text-xs font-mono"
                      />
                      <input
                        type="number"
                        step="any"
                        placeholder="Longitude (e.g. 101.62083)"
                        value={manualLng}
                        onChange={(e) => {
                          setManualLng(e.target.value);
                          if (manualLat && e.target.value) {
                            setLocation({ lat: Number(manualLat), lng: Number(e.target.value), accuracy: null });
                          }
                        }}
                        className="rounded-xl border border-slate-300 p-2.5 text-xs font-mono"
                      />
                    </div>
                  )}

                  {locationMessage && (
                    <p className="text-[11px] text-indigo-700 bg-indigo-50 p-2 rounded-xl">
                      {locationMessage}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Review & Submit */}
            {currentStep === lastStep && (
              <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
                <h2 className="text-sm font-bold text-slate-900">Review & Confirm Report</h2>

                <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 text-xs space-y-2.5">
                  <div className="flex justify-between border-b border-slate-200/70 pb-2">
                    <span className="text-slate-500">Issue Category:</span>
                    <strong className="text-slate-900">{ISSUE_LABELS[issueType]}</strong>
                  </div>

                  {isRampFlow && (
                    <>
                      <div className="flex justify-between border-b border-slate-200/70 pb-2">
                        <span className="text-slate-500">Measured Slope Angle:</span>
                        <strong className="text-blue-700">{slopeAngle?.toFixed(1)}°</strong>
                      </div>
                      <div className="flex justify-between border-b border-slate-200/70 pb-2">
                        <span className="text-slate-500">MS 1184 Compliance:</span>
                        <strong
                          className={
                            rampAssessment.result === 'pass'
                              ? 'text-emerald-600'
                              : rampAssessment.result === 'warning'
                              ? 'text-amber-600'
                              : 'text-rose-600'
                          }
                        >
                          {rampAssessment.result.toUpperCase()} (Severity {rampAssessment.severity}/5)
                        </strong>
                      </div>
                      <div className="flex justify-between border-b border-slate-200/70 pb-2">
                        <span className="text-slate-500">Ramp Dimensions:</span>
                        <span className="font-semibold">{rampLength || '—'}m long &times; {rampWidth || '—'}m wide</span>
                      </div>
                    </>
                  )}

                  {!isRampFlow && (
                    <div className="flex justify-between border-b border-slate-200/70 pb-2 items-center">
                      <span className="text-slate-500">Perceived Urgency:</span>
                      <select
                        value={severity}
                        onChange={(e) => setSeverity(Number(e.target.value))}
                        className="rounded-lg border border-slate-300 p-1 font-bold text-xs"
                      >
                        <option value={1}>1 - Low</option>
                        <option value={2}>2 - Minor</option>
                        <option value={3}>3 - Medium</option>
                        <option value={4}>4 - High</option>
                        <option value={5}>5 - Critical</option>
                      </select>
                    </div>
                  )}

                  <div className="flex justify-between border-b border-slate-200/70 pb-2">
                    <span className="text-slate-500">GPS Location:</span>
                    <span className="font-mono text-slate-800">
                      {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Required'}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-500">Photo Evidence:</span>
                    <span className="font-semibold text-slate-800">
                      {photo ? 'Photo Attached ✓' : 'Not attached'}
                    </span>
                  </div>
                </div>

                {isRampFlow && (
                  <p className="text-[11px] text-slate-400 italic text-center">
                    * Note: Phone sensors are approximate. Management should confirm on site.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSaving || !location}
                  className="w-full min-h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSaving ? 'Submitting to Management…' : 'Submit Verified Report'}</span>
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => s - 1)}
                  className="flex-1 min-h-11 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Back
                </button>
              )}
              {currentStep < lastStep && (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => s + 1)}
                  className="flex-1 min-h-11 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                >
                  <span>Continue</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
