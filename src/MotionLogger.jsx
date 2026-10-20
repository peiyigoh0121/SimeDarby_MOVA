import { useEffect, useRef, useState } from 'react';
import { Activity, CheckCircle2, ArrowLeft, LogOut, Zap, MapPin, Download } from 'lucide-react';

const BUMPINESS_THRESHOLD_MPS2 = 1.5;
const SS2_FALLBACK = { lat: 3.11806, lng: 101.62083 };

export default function MotionLogger({ onBackToHome, onLogout }) {
  const [sharing, setSharing] = useState(false);
  const [hasEndedSession, setHasEndedSession] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [signals, setSignals] = useState([]);
  const [acknowledgedSignals, setAcknowledgedSignals] = useState([]);
  const [statusMessage, setStatusMessage] = useState('Motion and location sensors are idle.');
  const [currentBumpiness, setCurrentBumpiness] = useState(null);
  const [currentTilt, setCurrentTilt] = useState(null);

  const locationRef = useRef(SS2_FALLBACK);
  const motionListenerRef = useRef(null);
  const orientationListenerRef = useRef(null);
  const locationWatchRef = useRef(null);
  const sensorWatchdogRef = useRef(null);
  const startAttemptRef = useRef(0);
  const hasMotionRef = useRef(false);
  const hasOrientationRef = useRef(false);
  const sensorStatusAnnouncedRef = useRef(false);
  const gravityRef = useRef(null);
  const lastBumpAtRef = useRef(0);
  const lastSteepAtRef = useRef(0);

  function stopSensors() {
    if (sensorWatchdogRef.current) {
      window.clearTimeout(sensorWatchdogRef.current);
      sensorWatchdogRef.current = null;
    }
    if (motionListenerRef.current) {
      window.removeEventListener('devicemotion', motionListenerRef.current);
      motionListenerRef.current = null;
    }
    if (orientationListenerRef.current) {
      window.removeEventListener('deviceorientation', orientationListenerRef.current);
      orientationListenerRef.current = null;
    }
    if (locationWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
  }

  useEffect(() => () => stopSensors(), []);

  function recordSignal(type, value) {
    const loc = locationRef.current;
    const signal = {
      type,
      value: Number(value.toFixed(2)),
      lat: loc.lat,
      lng: loc.lng,
      timestamp: new Date().toISOString(),
    };
    setSignals((previous) => [signal, ...previous]);
  }

  async function handleSharingChange(e) {
    const isChecked = e.target.checked;
    if (!isChecked) {
      startAttemptRef.current += 1;
      stopSensors();
      setSharing(false);
      setIsRequestingPermission(false);
      setHasEndedSession(true);
      setStatusMessage('Passive detection stopped. Review your journey summary below.');
      return;
    }

    setIsRequestingPermission(true);
    const attempt = ++startAttemptRef.current;
    if (!window.isSecureContext) {
      setStatusMessage('Phone sensors need an HTTPS page. Open the deployed Vercel link, then try again.');
      setIsRequestingPermission(false);
      return;
    }

    setStatusMessage('Requesting access to phone motion, tilt, and location…');

    try {
      if (!window.DeviceMotionEvent) throw new Error('This browser does not provide motion sensor data.');
      if (!window.DeviceOrientationEvent) throw new Error('This browser does not provide tilt sensor data.');

      // iOS Safari requires these permission calls to start directly from the checkbox tap.
      const permissionRequests = [];
      if (typeof window.DeviceMotionEvent.requestPermission === 'function') {
        permissionRequests.push(window.DeviceMotionEvent.requestPermission());
      }
      if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
        permissionRequests.push(window.DeviceOrientationEvent.requestPermission());
      }
      const permissions = await Promise.all(permissionRequests);
      if (permissions.some((permission) => permission !== 'granted')) {
        throw new Error('Motion or tilt permission was denied. Allow sensor access in the browser and try again.');
      }
      if (attempt !== startAttemptRef.current) return;

      gravityRef.current = null;
      hasMotionRef.current = false;
      hasOrientationRef.current = false;
      sensorStatusAnnouncedRef.current = false;
      lastBumpAtRef.current = 0;
      lastSteepAtRef.current = 0;
      motionListenerRef.current = (event) => {
        let x; let y; let z;
        const linear = event.acceleration;
        if ([linear?.x, linear?.y, linear?.z].every(Number.isFinite)) {
          ({ x, y, z } = linear);
        } else {
          const total = event.accelerationIncludingGravity;
          if (![total?.x, total?.y, total?.z].every(Number.isFinite)) return;
          const previousGravity = gravityRef.current ?? { x: total.x, y: total.y, z: total.z };
          const gravity = {
            x: previousGravity.x * 0.9 + total.x * 0.1,
            y: previousGravity.y * 0.9 + total.y * 0.1,
            z: previousGravity.z * 0.9 + total.z * 0.1,
          };
          gravityRef.current = gravity;
          x = total.x - gravity.x;
          y = total.y - gravity.y;
          z = total.z - gravity.z;
        }

        const acceleration = Math.sqrt(x * x + y * y + z * z);
        hasMotionRef.current = true;
        if (hasMotionRef.current && hasOrientationRef.current && !sensorStatusAnnouncedRef.current) {
          if (sensorWatchdogRef.current) window.clearTimeout(sensorWatchdogRef.current);
          sensorWatchdogRef.current = null;
          sensorStatusAnnouncedRef.current = true;
          setStatusMessage('Phone motion and tilt sensors are active. Keep this page open while rolling.');
        }
        setCurrentBumpiness(acceleration);
        const now = Date.now();
        if (acceleration >= BUMPINESS_THRESHOLD_MPS2 && now - lastBumpAtRef.current > 1500) {
          lastBumpAtRef.current = now;
          recordSignal('bumpy', acceleration);
        }
      };
      orientationListenerRef.current = (event) => {
        if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
        hasOrientationRef.current = true;
        if (hasMotionRef.current && hasOrientationRef.current && !sensorStatusAnnouncedRef.current) {
          if (sensorWatchdogRef.current) window.clearTimeout(sensorWatchdogRef.current);
          sensorWatchdogRef.current = null;
          sensorStatusAnnouncedRef.current = true;
          setStatusMessage('Phone motion and tilt sensors are active. Keep this page open while rolling.');
        }
        const beta = event.beta * Math.PI / 180;
        const gamma = event.gamma * Math.PI / 180;
        const cosine = Math.max(-1, Math.min(1, Math.cos(beta) * Math.cos(gamma)));
        const tilt = Math.acos(cosine) * 180 / Math.PI;
        setCurrentTilt(tilt);
        const now = Date.now();
        if (tilt >= 4.8 && now - lastSteepAtRef.current > 10000) {
          lastSteepAtRef.current = now;
          recordSignal('steep', tilt);
        }
      };
      setStatusMessage('Sensors are active while this page stays open. Keep the phone awake and allow location for signal coordinates.');
      window.addEventListener('devicemotion', motionListenerRef.current);
      window.addEventListener('deviceorientation', orientationListenerRef.current);
      sensorWatchdogRef.current = window.setTimeout(() => {
        sensorWatchdogRef.current = null;
        if (!sensorStatusAnnouncedRef.current) {
          setStatusMessage('No complete phone sensor readings received. Check browser motion permission and keep the page open.');
        }
      }, 5000);

      if (navigator.geolocation) {
        locationWatchRef.current = navigator.geolocation.watchPosition(
          (position) => {
            locationRef.current = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
          },
          () => setStatusMessage('Motion and tilt are active. Location permission is off; signals use the SS2 area fallback.'),
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
        );
      }

      setHasEndedSession(false);
      setSharing(true);
      setSignals([]);
      setAcknowledgedSignals([]);
    } catch (error) {
      if (attempt !== startAttemptRef.current) return;
      stopSensors();
      setSharing(false);
      setStatusMessage(error?.message || 'Could not start phone sensors. Use the simulation buttons below.');
    } finally {
      if (attempt === startAttemptRef.current) setIsRequestingPermission(false);
    }
  }

  function simulateSignal(type) {
    const value = type === 'bumpy' ? Number((1.8 + Math.random() * 1.5).toFixed(2)) : Number((5.5 + Math.random() * 3).toFixed(1));
    recordSignal(type, value);
    if (type === 'bumpy') setCurrentBumpiness(value);
    else setCurrentTilt(value);
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(signals, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mova-motion-signals.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:py-10">
      <div className="mx-auto w-full max-w-lg space-y-5">
        <header className="flex items-center justify-between px-1">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-indigo-700 tracking-tight">MOVA</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                PASSIVE LOGGER
              </span>
            </div>
            <p className="text-xs text-slate-500">Wheelchair Ride Roughness & Incline Telemetry</p>
          </div>
          <div className="flex items-center gap-2">
            {onBackToHome && (
              <button
                type="button"
                onClick={onBackToHome}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Home</span>
              </button>
            )}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log out</span>
              </button>
            )}
          </div>
        </header>

        <div className="space-y-5 rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200">
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600" />
              Wheelchair Ride Roughness Logger
            </h1>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Enable this mode during your trip. Your phone automatically flags jarring potholes, abrupt curb lips, and unramped thresholds without you having to stop.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-2xl bg-indigo-50/70 p-4 border border-indigo-100 cursor-pointer transition-colors hover:bg-indigo-50">
            <input
              type="checkbox"
              checked={sharing || isRequestingPermission}
              onChange={handleSharingChange}
              className="mt-0.5 h-5 w-5 rounded-md accent-indigo-600 cursor-pointer"
            />
            <div className="space-y-0.5 text-xs text-indigo-950">
              <span className="font-extrabold block">
                Enable passive detection while moving
              </span>
              <span className="text-slate-600 text-[11px] block">
                Collects sensor acceleration and GPS coordinates only. Never takes photos or accesses personal media.
              </span>
            </div>
          </label>

          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 flex items-center justify-between border border-slate-100">
            <span className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  sharing ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                }`}
              />
              <span className="font-medium">{statusMessage}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4 text-center border border-slate-200/80">
              <p className="text-xs font-semibold text-slate-500">Vertical Vibration (Jerk)</p>
              <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums">
                {currentBumpiness === null ? '—' : currentBumpiness.toFixed(2)}
              </p>
              <p className="text-[11px] text-slate-400">m/s² (pothole threshold: &gt; 1.5)</p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-center border border-slate-200/80">
              <p className="text-xs font-semibold text-slate-500">Live Tilt Incline</p>
              <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums">
                {currentTilt === null ? '—' : `${currentTilt.toFixed(1)}°`}
              </p>
              <p className="text-[11px] text-slate-400">degrees (steep threshold: &gt; 4.8°)</p>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-100/70 p-3 space-y-2 border border-slate-200">
            <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Demo Simulation Actions (Test in browser)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => simulateSignal('bumpy')}
                className="py-2 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800 transition-colors shadow-2xs cursor-pointer"
              >
                + Simulate Pothole / Bump
              </button>
              <button
                type="button"
                onClick={() => simulateSignal('steep')}
                className="py-2 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800 transition-colors shadow-2xs cursor-pointer"
              >
                + Simulate Steep Slope
              </button>
            </div>
          </div>

          {hasEndedSession && (
            <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/60 p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-extrabold text-emerald-950">
                  Journey Completed: Summary & Confirmation
                </h3>
              </div>
              <p className="text-xs text-emerald-900 leading-relaxed">
                Your passive session recorded <strong>{signals.length} anomaly signal(s)</strong>.
                You can tap <em>"I noticed this issue"</em> on the items below to give extra resident verification before saving, or simply finish your session.
              </p>

              <div className="flex items-center justify-between text-xs text-emerald-800 font-bold pt-1">
                <span>{acknowledgedSignals.length} of {signals.length} issues acknowledged</span>
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs cursor-pointer transition-colors"
                >
                  Finish Session & Return Home
                </button>
              </div>
            </div>
          )}

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Detected Journey Signals ({signals.length})
              </h3>
              <button
                type="button"
                onClick={downloadJson}
                disabled={signals.length === 0}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {signals.slice(0, 10).map((signal, idx) => {
                const isAck = acknowledgedSignals.includes(idx);
                return (
                  <div
                    key={`${signal.timestamp}-${idx}`}
                    className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2 text-xs shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                          signal.type === 'bumpy'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-rose-100 text-rose-900'
                        }`}
                      >
                        {signal.type === 'bumpy' ? 'BUMPY SURFACE' : 'STEEP INCLINE'}
                      </span>
                      <span className="font-mono font-bold text-slate-800">
                        {signal.value}
                        {signal.type === 'bumpy' ? ' m/s²' : '°'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {signal.lat.toFixed(4)}, {signal.lng.toFixed(4)}
                      </span>
                      <span>{new Date(signal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    {hasEndedSession && (
                      <button
                        type="button"
                        onClick={() => {
                          setAcknowledgedSignals((prev) =>
                            prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
                          );
                        }}
                        className={`w-full py-1.5 rounded-xl font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                          isAck
                            ? 'bg-emerald-600 text-white'
                            : 'border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                        }`}
                      >
                        {isAck ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Acknowledged by You ✓</span>
                          </>
                        ) : (
                          <span>I noticed this issue (Confirm)</span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
