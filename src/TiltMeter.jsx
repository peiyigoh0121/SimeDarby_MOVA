import { useEffect, useRef, useState } from 'react';
import { Smartphone, CheckCircle, AlertTriangle, XCircle, Sliders } from 'lucide-react';

const MAX_SLOPE_DEGREES = 4.76; // 1:12 slope standard for independent wheelchair use
const MAX_WARNING_DEGREES = 7.13; // 1:8 slope maximum with assistance

export default function TiltMeter({ onCapture }) {
  const [liveAngle, setLiveAngle] = useState(null);
  const [simulationMode, setSimulationMode] = useState(true);
  const [simAngle, setSimAngle] = useState(4.2);

  const timerRef = useRef(null);
  const listenerRef = useRef(null);
  const startAttemptRef = useRef(0);
  const startingRef = useRef(false);
  const mountedRef = useRef(false);
  const latestAngleRef = useRef(null);
  const lastSensorEventRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startAttemptRef.current += 1;
      startingRef.current = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (listenerRef.current) window.removeEventListener('deviceorientation', listenerRef.current);
      listenerRef.current = null;
      timerRef.current = null;
    };
  }, []);

  async function startSensor() {
    if (startingRef.current) return;
    startingRef.current = true;
    const attempt = ++startAttemptRef.current;
    latestAngleRef.current = null;
    lastSensorEventRef.current = 0;

    if (typeof window === 'undefined' || !window.isSecureContext) {
      startingRef.current = false;
      setSimulationMode(true);
      return;
    }

    if (!('DeviceOrientationEvent' in window)) {
      startingRef.current = false;
      setSimulationMode(true);
      return;
    }

    try {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (listenerRef.current) window.removeEventListener('deviceorientation', listenerRef.current);
      listenerRef.current = null;

      const orientation = window.DeviceOrientationEvent;
      if (typeof orientation?.requestPermission === 'function') {
        const permission = await orientation.requestPermission();
        if (permission !== 'granted') throw new Error('Sensor permission denied.');
      }

      if (!mountedRef.current || attempt !== startAttemptRef.current) return;
      setSimulationMode(false);

      function handleOrientation(event) {
        if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
        const beta = ((event.beta ?? 0) * Math.PI) / 180;
        const gamma = ((event.gamma ?? 0) * Math.PI) / 180;
        const cosine = Math.max(-1, Math.min(1, Math.cos(beta) * Math.cos(gamma)));
        const measuredAngle = (Math.acos(cosine) * 180) / Math.PI;
        const previous = latestAngleRef.current;
        const tilt = previous === null ? measuredAngle : previous * 0.75 + measuredAngle * 0.25;
        latestAngleRef.current = tilt;
        lastSensorEventRef.current = Date.now();
        setSimulationMode(false);
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setLiveAngle(tilt);
      }

      listenerRef.current = handleOrientation;
      window.addEventListener('deviceorientation', handleOrientation);

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        if (!mountedRef.current || attempt !== startAttemptRef.current) return;
        if (!lastSensorEventRef.current) {
          setSimulationMode(true);
        }
      }, 5000);
    } catch {
      if (!mountedRef.current || attempt !== startAttemptRef.current) return;
      setSimulationMode(true);
    } finally {
      if (attempt === startAttemptRef.current) startingRef.current = false;
    }
  }

  function formatRatio(angle) {
    if (angle === null || angle <= 0) return '1:∞';
    const distance = Math.round(1 / Math.tan((angle * Math.PI) / 180));
    return `1:${Math.max(1, distance)}`;
  }

  const currentAngle = simulationMode
    ? simAngle
    : liveAngle ?? simAngle;

  function captureMeasurement() {
    const value = currentAngle;
    if (value !== null && Number.isFinite(value)) {
      if (typeof onCapture === 'function') onCapture(value);
    }
  }

  const isCompliant = currentAngle <= MAX_SLOPE_DEGREES;
  const isWarning = currentAngle > MAX_SLOPE_DEGREES && currentAngle <= MAX_WARNING_DEGREES;

  return (
    <div className="space-y-4 rounded-2xl bg-slate-50/80 p-4 sm:p-5 border border-slate-200/80 text-slate-900">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-blue-600" />
            Ramp Slope Tilt Meter
          </h3>
          <p className="text-xs text-slate-500">
            Malaysian MS 1184 Standard (Max 1:12 / 4.8°)
          </p>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          Phone Gyroscope
        </span>
      </div>

      <div className="rounded-2xl bg-white p-5 text-center shadow-xs border border-slate-200/90 relative overflow-hidden">
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-5xl sm:text-6xl font-black tracking-tight text-slate-900 tabular-nums">
            {currentAngle.toFixed(1)}
          </span>
          <span className="text-2xl font-bold text-slate-500">°</span>
        </div>

        <div className="mt-1 flex items-center justify-center gap-3 text-xs font-semibold text-slate-600">
          <span>Slope Ratio: <strong className="text-slate-800">{formatRatio(currentAngle)}</strong></span>
          <span>•</span>
          <span>Gradient: <strong className="text-slate-800">{(Math.tan((currentAngle * Math.PI) / 180) * 100).toFixed(1)}%</strong></span>
        </div>

        <div className="relative mx-auto mt-4 h-12 max-w-xs rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
          <div
            className="absolute w-3/4 h-1.5 rounded-full bg-blue-600 transition-transform duration-200 shadow-sm"
            style={{
              transform: `rotate(${Math.max(-45, Math.min(45, currentAngle))}deg)`,
            }}
          />
          <div className="w-3 h-3 rounded-full bg-slate-900 z-10 border-2 border-white shadow" />
          <span className="absolute bottom-1 right-2 text-[10px] font-mono text-slate-400">
            MS 1184 max: 4.8°
          </span>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-center gap-2">
          {isCompliant ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              PASSES MS 1184 (&le; 1:12 / 4.8°)
            </span>
          ) : isWarning ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              WARNING: STEEP (Assisted transit only)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
              FAIL: DANGEROUS OVER-INCLINE (&gt; 1:8)
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={startSensor}
          className="min-h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Start Phone Sensor</span>
        </button>

        <button
          type="button"
          onClick={captureMeasurement}
          className="min-h-11 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
        >
          <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
          <span>Capture {currentAngle.toFixed(1)}°</span>
        </button>
      </div>

      <div className="rounded-xl bg-white p-3 border border-slate-200 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700 flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            Quick Angle Test (Demo Slider)
          </span>
          <span className="font-mono font-bold text-blue-600">{simAngle.toFixed(1)}°</span>
        </div>
        <input
          type="range"
          min="0"
          max="16"
          step="0.1"
          value={simAngle}
          onChange={(e) => {
            setSimAngle(Number(e.target.value));
            setSimulationMode(true);
          }}
          className="w-full accent-blue-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
        />
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>0° (Flat)</span>
          <span className="text-emerald-600 font-bold">4.8° (1:12 Max)</span>
          <span className="text-amber-600 font-bold">7.1° (1:8 Limit)</span>
          <span className="text-rose-600 font-bold">16° (Dangerous)</span>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 text-center leading-tight">
        * Note: Tilt is approximate, management should confirm on site.
      </p>
    </div>
  );
}
