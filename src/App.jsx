import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import ReportForm from './ReportForm.jsx';
import MotionLogger from './MotionLogger.jsx';
import { getSupabaseClient, logSupabaseRequestError } from './lib/supabaseClient.js';
import { fetchIssues, subscribeToIssues } from './lib/issueRepository.js';
import { sortIssuesByPriority } from './lib/issuePriority.js';
import { buildIssueQueues } from './lib/issueQueues.js';
import { getIssueWorkflow, ISSUE_WORKFLOW_STATUSES } from './lib/issueWorkflow.js';
import { DEFAULT_DISTANCE_THRESHOLD_METERS, evaluateConfidenceCount, evaluateMultiSignalEscalation } from './lib/issueEvidence.js';
import { calculateTownshipAccessibilityRating } from './lib/townshipRating.js';
import { createUnconfirmedEmergencySafetyEvent, getEmergencyAlertIntegrationStatus } from './lib/emergencyAlertIntegration.js';
import { getFictionalDemoIssues } from './lib/fictionalDemoIssues.js';
import { buildShopOwnerMetadata, getShopRegistrationValidationError, hasShopOwnerAccess, hasShopkeeperMonitorAccess, isShopOwnerSignup } from './lib/shopOwnerRegistration.js';
import { getAuthErrorMessage, getConfirmationRequiredNotice } from './lib/authFeedback.js';
import { 
  ArrowRight, 
  Building, 
  User, 
  LogOut, 
  Sparkles,
  Navigation, 
  Store, 
  ShieldAlert, 
  Award, 
  Eye, 
  Accessibility, 
  PhoneCall,
  Clock,
  Mic,
  MicOff,
  Volume2
} from 'lucide-react';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const activeIcon = L.divIcon({
  className: 'custom-pin-active',
  html: `<div style="background-color: #2563eb; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 3px solid white; box-shadow: 0 4px 10px rgba(37,99,235,0.5);">📍</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32]
});

const defaultIcon = L.divIcon({
  className: 'custom-pin-default',
  html: `<div style="background-color: #ef4444; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">📍</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28]
});

const INITIAL_MAP_VIEW = {
  center: [3.11806, 101.62083],
  zoom: 16,
};

function MapViewportManager({ onViewChange }) {
  const map = useMap();

  useMapEvents({
    moveend() {
      const center = map.getCenter();
      onViewChange({ center: [center.lat, center.lng], zoom: map.getZoom() });
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    let animationFrame;
    const invalidateSize = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        map.invalidateSize({ animate: false, pan: false });
      });
    };

    invalidateSize();
    if (typeof ResizeObserver === 'undefined') {
      return () => cancelAnimationFrame(animationFrame);
    }

    const observer = new ResizeObserver(invalidateSize);
    observer.observe(container);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
    };
  }, [map]);

  return null;
}

function IssueQueuePanel({ title, description, entries, selectedIssue, onSelect }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3" aria-label={title}>
      <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">{title}</h2>
      <p className="mt-1 text-[10px] text-slate-500">{description}</p>
      {entries.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 p-2 text-[10px] font-semibold text-slate-500">No open issues in this queue.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {entries.map(({ issue, priority }) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => onSelect(issue)}
              className={`w-full rounded-lg border p-2.5 text-left transition hover:border-indigo-300 hover:bg-slate-50 ${
                selectedIssue?.id === issue.id
                  ? 'border-indigo-500 bg-indigo-50/40'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-bold capitalize text-slate-800">{issue.type}</span>
                {priority.state === 'scored' ? (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-extrabold text-rose-700">{priority.score}/100</span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">Needs triage</span>
                )}
              </div>
              <p className="mt-1 text-[10px] text-slate-600">Status: {issue.status}</p>
              <p className="mt-1 text-[10px] text-slate-500">Location: {issue.location_name}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function IssueWorkflowPanel({ issue }) {
  const workflow = getIssueWorkflow(issue)

  return (
    <section className="space-y-3 border-t border-slate-200 pt-3" aria-labelledby="issue-workflow-heading">
      <div>
        <h4 id="issue-workflow-heading" className="text-[11px] font-bold text-slate-600">Issue status workflow</h4>
        <p className="mt-1 text-[10px] text-slate-500">Read-only until approved workflow storage and permissions are available.</p>
      </div>
      <ol className="grid grid-cols-4 gap-1">
        {ISSUE_WORKFLOW_STATUSES.map((status, index) => (
          <li
            key={status}
            className={`rounded-md px-1 py-1.5 text-center text-[9px] font-bold uppercase ${
              index < workflow.currentIndex
                ? 'bg-emerald-100 text-emerald-800'
                : index === workflow.currentIndex
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-500'
            }`}
          >
            {status}
          </li>
        ))}
      </ol>
      <p className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px] font-semibold text-slate-600">{workflow.guidance}</p>
    </section>
  )
}

function IssueEvidencePanel({ issue, issues }) {
  // MOVA currently stores neither an independent reporter identifier nor a signal type.
  // The evaluators therefore deliberately return insufficient evidence for live data.
  const confidence = evaluateConfidenceCount(issue, issues);
  const escalation = evaluateMultiSignalEscalation(issue, issues);

  return (
    <section className="space-y-3 border-t border-slate-200 pt-3" aria-labelledby="issue-evidence-heading">
      <div>
        <h4 id="issue-evidence-heading" className="text-[11px] font-bold text-slate-600">Agreement and escalation</h4>
        <p className="mt-1 text-[10px] text-slate-500">Separate from priority scoring and status workflow. Location threshold: {DEFAULT_DISTANCE_THRESHOLD_METERS}m.</p>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-900">
        <p className="font-bold">Confidence count: Insufficient evidence</p>
        <p className="mt-1">{confidence.reason} A report count is not a statistically validated confidence probability.</p>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-900">
        <p className="font-bold">Multi-signal escalation: Insufficient evidence</p>
        <p className="mt-1">{escalation.reason} No escalation is applied.</p>
      </div>
    </section>
  )
}

const REPORT_ISSUES = [
  {
    type: 'blocked_tactile_paving',
    title: 'Blocked tactile paving',
    detail: 'A motorcycle, boxes or other obstacle is blocking the yellow guidance line.',
    icon: '🦯',
    badge: 'AI PHOTO CHECK',
    color: 'violet',
  },
  {
    type: 'broken_tactile_paving',
    title: 'Broken tactile paving',
    detail: 'Tiles are loose, cracked, missing or worn smooth.',
    icon: '🔨',
    badge: 'AI PHOTO CHECK',
    color: 'violet',
  },
  {
    type: 'missing_handrail',
    title: 'Missing handrail',
    detail: 'A ramp or flight of steps lacks continuous dual-height handrails.',
    icon: 'Ⅱ',
    badge: 'PHOTO & LOCATION',
    color: 'amber',
  },
  {
    type: 'step_at_entrance',
    title: 'Step at entrance',
    detail: 'An unramped 1–2 step or high kerb blocks access into a shoplot.',
    icon: '↗',
    badge: 'PHOTO & LOCATION',
    color: 'amber',
  },
  {
    type: 'lift_out_of_service',
    title: 'Lift out of service',
    detail: 'An accessible lift at a pedestrian link bridge is unavailable.',
    icon: '🛗',
    badge: 'PHOTO & LOCATION',
    color: 'blue',
  },
  {
    type: 'drain_or_crossing',
    title: 'Drain or crossing',
    detail: 'Wide parallel drain grates trap wheelchair front casters or cane tips.',
    icon: '⌖',
    badge: 'PHOTO & LOCATION',
    color: 'blue',
  },
  {
    type: 'pickup_point',
    title: 'Pick-up point',
    detail: 'A drop-off point forces OKU commuters directly onto the vehicle road.',
    icon: '⌂',
    badge: 'PHOTO & LOCATION',
    color: 'blue',
  },
];

function BrandHeader({ onLogout }) {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xs font-black text-base">
          M
        </div>
        <div>
          <p className="text-xl font-black tracking-tight text-slate-900 leading-none">
            MOVA
          </p>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Accessibility you can measure
          </p>
        </div>
      </div>

      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 text-slate-400" />
          <span>Log out</span>
        </button>
      )}
    </header>
  );
}

function AuthPage({ onSignedIn }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('resident');
  const [hasShop, setHasShop] = useState(false);
  const [shopName, setShopName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopType, setShopType] = useState('');
  const [shopContact, setShopContact] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const isSignup = mode === 'signup';
  const registeringShopOwner = isShopOwnerSignup(role, hasShop);

  async function submitAuth(e) {
    e.preventDefault();
    setAuthError('');
    setAuthNotice('');

    const shop = { name: shopName, address: shopAddress, type: shopType, contact: shopContact };
    const shopValidationError = getShopRegistrationValidationError({ isSignup, registeringShopOwner, shop });
    if (shopValidationError) {
      setAuthError(shopValidationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = getSupabaseClient();
      const result = isSignup
        ? await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              ...buildShopOwnerMetadata({
                role,
                hasShop,
                shop,
              }),
            },
          },
        })
        : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) throw result.error;

      if (isSignup && !result.data.session) {
        setAuthNotice(getConfirmationRequiredNotice());
      } else if (result.data.user) {
        onSignedIn(result.data.user);
      }
    } catch (error) {
      logSupabaseRequestError(
        isSignup ? 'sign-up' : 'sign-in',
        isSignup ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password',
        error,
      );
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-12 text-left text-slate-900">
      <BrandHeader />

      <div className="mx-auto grid w-full max-w-5xl gap-6 pt-4 md:grid-cols-[1.1fr_0.9fr] md:items-center md:pt-10">
        <section className="rounded-3xl bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-700 p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-md px-3.5 py-1 text-xs font-bold text-white border border-white/30">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              RESIDENT ACCESS • Sime Darby Property
            </span>

            <h1 className="text-3xl sm:text-4xl font-black leading-tight tracking-tight text-white">
              Spot a barrier? Let’s measure and fix it.
            </h1>

            <p className="text-sm text-blue-100 leading-relaxed max-w-md">
              Report physical access problems with a photo, verified GPS location, and targeted tools.
            </p>
          </div>
        </section>

        <form
          noValidate
          onSubmit={submitAuth}
          className="rounded-3xl bg-white p-6 sm:p-8 shadow-xs border border-slate-200/90 space-y-5"
        >
          <div>
            <h2 className="text-2xl font-black text-slate-900">
              {isSignup ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {isSignup ? 'Every resident can use the accessibility tools. Shop owners can add a monitor for their business.' : 'Sign in to report or review township barriers.'}
            </p>
          </div>

          <div className="rounded-2xl bg-indigo-50/70 p-3.5 border border-indigo-100 space-y-2">
            <span className="text-[11px] font-bold text-indigo-950 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Real Supabase account required
            </span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                disabled
                className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-indigo-200 text-indigo-700 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-indigo-600" />
                <span>Demo Resident</span>
              </button>
              <button
                type="button"
                disabled
                className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-emerald-200 text-emerald-800 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Store className="w-3.5 h-3.5 text-emerald-700" />
                <span>Demo Resident · Shop Owner</span>
              </button>
              <button
                type="button"
                disabled
                className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Building className="w-3.5 h-3.5 text-slate-500" />
                <span>Demo Developer</span>
              </button>
            </div>
          </div>

          {authError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{authError}</p>}
          {authNotice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">{authNotice}</p>}

          {isSignup && (
            <div>
              <label htmlFor="auth-role" className="mb-1.5 block text-xs font-bold text-slate-700">
                I am joining as a
              </label>
              <select
                id="auth-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
              >
                <option value="resident">Resident</option>
                <option value="shop_owner">Shop Owner</option>
              </select>
            </div>
          )}

          {isSignup && role === 'resident' && (
            <fieldset className="space-y-2 rounded-2xl border border-slate-200 p-4">
              <legend className="px-1 text-xs font-bold text-slate-800">Enable Shopkeeper Monitor?</legend>
              <p className="text-[11px] text-slate-500">This optional opt-in gives a resident account access to its shop's assistance monitor.</p>
              <div className="flex gap-3">
                {[
                  { value: false, label: 'No' },
                  { value: true, label: 'Yes' },
                ].map((option) => (
                  <label key={option.label} className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700">
                    <input
                      type="radio"
                      name="has-shop"
                      checked={hasShop === option.value}
                      onChange={() => setHasShop(option.value)}
                      className="accent-indigo-600"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {isSignup && registeringShopOwner && (
            <section className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Shop details</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">These details identify your shop in the assistance monitor. This enables the feature for your registered account.</p>
              </div>
              <div>
                <label htmlFor="shop-name" className="mb-1.5 block text-xs font-bold text-slate-700">Shop name</label>
                <input
                  id="shop-name"
                  type="text"
                  required
                  autoComplete="organization"
                  placeholder="e.g. SS2 Corner Cafe"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <div>
                <label htmlFor="shop-address" className="mb-1.5 block text-xs font-bold text-slate-700">Shop address or lot location</label>
                <input
                  id="shop-address"
                  type="text"
                  required
                  autoComplete="street-address"
                  placeholder="Street, lot or landmark in SS2"
                  value={shopAddress}
                  onChange={(e) => setShopAddress(e.target.value)}
                  className="w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <div>
                <label htmlFor="shop-type" className="mb-1.5 block text-xs font-bold text-slate-700">Shop type</label>
                <select
                  id="shop-type"
                  required
                  value={shopType}
                  onChange={(e) => setShopType(e.target.value)}
                  className="w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="" disabled>Select a shop type</option>
                  <option value="Cafe">Cafe or restaurant</option>
                  <option value="Retail">Retail shop</option>
                  <option value="Grocery">Grocery or convenience store</option>
                  <option value="Services">Personal or professional services</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label htmlFor="shop-contact" className="mb-1.5 block text-xs font-bold text-slate-700">Contact number</label>
                <input
                  id="shop-contact"
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="e.g. 012-345 6789"
                  value={shopContact}
                  onChange={(e) => setShopContact(e.target.value)}
                  className="w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            </section>
          )}

          <div>
            <label htmlFor="auth-email-input" className="mb-1.5 block text-xs font-bold text-slate-700">
              Email address
            </label>
            <input
              id="auth-email-input"
              type="email"
              required
              placeholder="e.g. resident@ss2.my"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div>
            <label htmlFor="auth-password-input" className="mb-1.5 block text-xs font-bold text-slate-700">
              Password
            </label>
            <input
              id="auth-password-input"
              type="password"
              required
              minLength={6}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-xs transition-colors cursor-pointer"
          >
            {isSubmitting ? 'Please wait…' : isSignup ? 'Create Account' : 'Sign In'}
          </button>

          <p className="text-center text-xs text-slate-500 pt-1">
            {isSignup ? 'Already have an account?' : 'New to MOVA?'}{' '}
            <button
              type="button"
              onClick={() => setMode(isSignup ? 'signin' : 'signup')}
              className="font-extrabold text-indigo-600 hover:underline cursor-pointer ml-1"
            >
              {isSignup ? 'Sign in' : 'Create account'}
            </button>
          </p>
        </form>
      </div>
    </main>
  );
}

function IssueCard({ title, detail, icon, color, badge, onClick }) {
  const iconBg =
    color === 'violet'
      ? 'bg-purple-50 text-purple-700 border-purple-200'
      : color === 'amber'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : color === 'green'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-blue-50 text-blue-700 border-blue-200';

  const badgeBg =
    color === 'violet'
      ? 'bg-purple-50 text-purple-700 border-purple-200'
      : color === 'amber'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : color === 'green'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : 'bg-blue-50 text-blue-700 border-blue-200';

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-3xl bg-white p-5 text-left shadow-xs border border-slate-200/90 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-3"
    >
      <div>
        <div className="flex items-center justify-between">
          <span
            className={`w-11 h-11 rounded-2xl border flex items-center justify-center text-xl font-bold group-hover:scale-105 transition-transform ${iconBg}`}
          >
            {icon}
          </span>
          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${badgeBg}`}>
            {badge}
          </span>
        </div>

        <h3 className="mt-3.5 text-base font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center justify-between">
          <span>{title}</span>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
        </h3>

        <p className="mt-1 text-xs text-slate-500 leading-relaxed">{detail}</p>
      </div>

      <div className="pt-2 border-t border-slate-100 flex items-center text-xs font-bold text-indigo-600">
        <span>Open report flow &rarr;</span>
      </div>
    </button>
  );
}

function IssuePicker({ onChooseIssue, onBackToMap, onLogout }) {
  return (
    <main className="min-h-screen bg-slate-50 pb-16 text-left text-slate-900">
      <BrandHeader onLogout={onLogout} />

      <div className="mx-auto max-w-5xl space-y-5 px-4 sm:px-6">
        <button
          type="button"
          onClick={onBackToMap}
          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
        >
          ← Back to SS2 Map
        </button>

        <section className="space-y-1">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">What barrier did you encounter?</h1>
          <p className="text-sm text-slate-500">Choose an issue to open its matching report form and tools.</p>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <IssueCard
            title="Steep or broken ramp"
            detail="Measure ramp slope with your phone gyroscope and check it against the MS 1184 standard."
            icon="♿"
            color="blue"
            badge="RAMP SENSOR"
            onClick={() => onChooseIssue('ramp')}
          />
          {REPORT_ISSUES.map((issue) => (
            <IssueCard
              key={issue.type}
              title={issue.title}
              detail={issue.detail}
              icon={issue.icon}
              color={issue.color}
              badge={issue.badge}
              onClick={() => onChooseIssue(issue.type)}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function ResidentHome({ onChooseIssue, onOpenPassive, onOpenPitch, onLogout }) {
  return (
    <main className="min-h-screen bg-slate-50 pb-16 text-left text-slate-900">
      <BrandHeader onLogout={onLogout} />

      <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6">
        <section className="rounded-3xl bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
          <div className="relative z-10 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white border border-white/25">
                RESIDENT APP
              </span>
              <span className="text-xs text-blue-100 font-medium">
                SS2, Petaling Jaya • Sime Darby Property
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Spot a barrier? Let’s measure and fix it.
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 max-w-xl leading-relaxed">
              Choose the problem you encountered below. Each issue launches its own specialized sensor or AI check.
            </p>

            <div className="pt-2 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => onChooseIssue('ramp')}
                className="px-4 py-2.5 rounded-2xl bg-white text-indigo-700 font-extrabold text-xs shadow-xs hover:bg-blue-50 transition-colors cursor-pointer"
              >
                Measure Ramp Gradient
              </button>
              <button
                type="button"
                onClick={onOpenPassive}
                className="px-4 py-2.5 rounded-2xl bg-indigo-800/60 hover:bg-indigo-800/80 text-white font-bold text-xs border border-white/20 transition-colors cursor-pointer"
              >
                Enable Ride Roughness Logger
              </button>
              <button
                type="button"
                onClick={onOpenPitch}
                className="px-4 py-2.5 rounded-2xl bg-slate-950/25 hover:bg-slate-950/40 text-white font-bold text-xs border border-white/30 transition-colors cursor-pointer"
              >
                Open Pitch Views
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-lg font-black text-slate-900">
                What issue did you encounter?
              </h2>
              <p className="text-xs text-slate-500">
                Tap one card to open its dedicated report flow:
              </p>
            </div>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
              Person A Toolset
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <IssueCard
              title="Steep or broken ramp"
              detail="Measure ramp slope with your phone gyroscope and test against Malaysian MS 1184 1:12 standard."
              icon="♿"
              color="blue"
              badge="RAMP SENSOR"
              onClick={() => onChooseIssue('ramp')}
            />

            <IssueCard
              title="Blocked tactile paving"
              detail="Photograph yellow tactile pavers for AI detection of parked motorcycles, boxes or hawker stalls."
              icon="🦯"
              color="violet"
              badge="AI PHOTO CHECK"
              onClick={() => onChooseIssue('blocked_tactile_paving')}
            />

            <IssueCard
              title="Broken tactile paving"
              detail="Photograph cracked, missing or worn smooth blister/directional tiles for engineering repair."
              icon="🔨"
              color="violet"
              badge="AI PHOTO CHECK"
              onClick={() => onChooseIssue('broken_tactile_paving')}
            />

            {REPORT_ISSUES.filter(
              (i) => !['blocked_tactile_paving', 'broken_tactile_paving'].includes(i.type)
            ).map((issue) => (
              <IssueCard
                key={issue.type}
                title={issue.title}
                detail={issue.detail}
                icon={issue.icon}
                color={issue.color}
                badge={issue.badge}
                onClick={() => onChooseIssue(issue.type)}
              />
            ))}

            <IssueCard
              title="Wheelchair ride logger"
              detail="Opt in to background motion and location signals while rolling. Review summary at trip end."
              icon="🧑‍🦽"
              color="green"
              badge="PASSIVE TELEMETRY"
              onClick={onOpenPassive}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function DeveloperHome({ onLogout }) {
  return (
    <main className="min-h-screen bg-slate-50 text-left text-slate-900 pb-16">
      <BrandHeader onLogout={onLogout} />

      <div className="mx-auto mt-6 max-w-xl px-4 space-y-6">
        <section className="rounded-3xl bg-white p-6 sm:p-8 text-center shadow-xs border border-slate-200 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center mx-auto text-3xl font-bold">
            ⌘
          </div>

          <h1 className="text-2xl font-black text-slate-900">
            Developer Workspace
          </h1>

          <p className="text-xs text-slate-500 leading-relaxed">
            This space is prepared for the developer dashboard when implemented by Person B.
          </p>

          <button
            type="button"
            onClick={onLogout}
            className="w-full py-3 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer"
          >
            Log Out of Developer Account
          </button>
        </section>
      </div>
    </main>
  );
}

// --- PERSON C INTEGRATED PITCH VIEW COMPONENT ---
function IntegratedPitchView({ onOpenReport, onOpenPassive, onLogout, isShopOwner, shopDetails, shopkeeperSetupIncomplete }) {
  const [activeTab, setActiveTab] = useState('resident');
  const [profile, setProfile] = useState('wheelchair');
  const [issues, setIssues] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [issuesState, setIssuesState] = useState('loading');
  const [issuesError, setIssuesError] = useState('');
  const [dataMode, setDataMode] = useState('live');
  const [demoNotice, setDemoNotice] = useState('');
  const [shopArrivals, setShopArrivals] = useState([]);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [emergencySafetyEvent, setEmergencySafetyEvent] = useState(null);
  const [, setFeedbackMsg] = useState('');

  // VOICE DETECTOR STATES & AUDIO STREAM REFS
  const [isListening, setIsListening] = useState(false);
  const [voiceVolume, setVoiceVolume] = useState(0);
  const [voiceLog, setVoiceLog] = useState('Voice Detection System ready.');

  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const animFrameRef = useRef(null);
  const [mapView, setMapView] = useState({
    center: [...INITIAL_MAP_VIEW.center],
    zoom: INITIAL_MAP_VIEW.zoom,
  });
  const rankedIssues = sortIssuesByPriority(issues);
  const issueQueues = buildIssueQueues(rankedIssues);
  const townshipRating = calculateTownshipAccessibilityRating(issues);

  const handleMapViewChange = useCallback((nextView) => {
    setMapView((currentView) => {
      if (
        currentView.zoom === nextView.zoom &&
        currentView.center[0] === nextView.center[0] &&
        currentView.center[1] === nextView.center[1]
      ) {
        return currentView;
      }

      return nextView;
    });
  }, []);

  useEffect(() => {
    let active = true;

    if (dataMode === 'demo') {
      Promise.resolve().then(() => {
        try {
          const demoIssues = getFictionalDemoIssues();
          if (!active) return;
          setIssues(demoIssues);
          setSelectedIssue(demoIssues[0] || null);
          setIssuesError('');
          setIssuesState('ready');
        } catch (error) {
          if (!active) return;
          setIssues([]);
          setSelectedIssue(null);
          setIssuesState('error');
          setIssuesError(error instanceof Error ? error.message : 'Could not load fictional demo data.');
        }
      });
      return () => {
        active = false;
      };
    }

    async function loadIssues() {
      setIssuesState('loading');
      setIssuesError('');
      try {
        const nextIssues = await fetchIssues();
        if (!active) return;
        setIssues(nextIssues);
        setSelectedIssue((current) => nextIssues.find((issue) => issue.id === current?.id) || nextIssues[0] || null);
        setIssuesState(nextIssues.length === 0 ? 'empty' : 'ready');
      } catch (error) {
        if (!active) return;
        setIssues([]);
        setSelectedIssue(null);
        setIssuesState('error');
        setIssuesError(error instanceof Error ? error.message : 'Could not load issues from the shared database.');
      }
    }

    loadIssues();
    const unsubscribe = subscribeToIssues(loadIssues, (error) => {
      if (!active) return;
      setIssuesError(error.message);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [dataMode]);

  useEffect(() => () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(track => track.stop());
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
  }, []);

  // LIVE COUNTDOWN TIMER TICKER
  useEffect(() => {
    const timer = setInterval(() => {
      setShopArrivals(prevArrivals =>
        prevArrivals.map(arrival => {
          if (arrival.secondsLeft > 0) {
            const nextSec = arrival.secondsLeft - 1;
            const mins = Math.floor(nextSec / 60);
            const secs = nextSec % 60;
            return {
              ...arrival,
              secondsLeft: nextSec,
              etaFormatted: `${mins}:${secs < 10 ? '0' : ''}${secs}`
            };
          }
          return arrival;
        })
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const emergencyIntegration = getEmergencyAlertIntegrationStatus();

  const openEmergencySafetyReview = (source) => {
    setEmergencySafetyEvent(createUnconfirmedEmergencySafetyEvent({
      source,
      observedAt: new Date().toISOString(),
    }));
    setEmergencyModalOpen(true);
    setVoiceLog(source === 'microphone_peak_detector'
      ? 'Microphone peak detected. Emergency is unconfirmed; safety review opened.'
      : 'Emergency safety review opened. No alert has been sent.');
    if ('vibrate' in navigator) navigator.vibrate([300, 100, 300]);
  };

  const triggerEmergencyAction = () => openEmergencySafetyReview('microphone_peak_detector');

  const openReportFromPitch = () => {
    if (dataMode === 'demo') {
      setDemoNotice('Demo Mode is read-only. Exit Demo Mode before opening the real report submission flow.');
      return;
    }
    onOpenReport();
  };

  const triggerReportAction = () => {
    openReportFromPitch();
    if (dataMode === 'demo') {
      setVoiceLog('Demo Mode: real report submission remains disabled.');
      setFeedbackMsg('Demo Mode: exit before opening the real report flow.');
    } else {
      setVoiceLog('📝 Voice Command Triggered: Barrier Report Opened!');
      setFeedbackMsg('✓ Voice Command: Barrier report triggered!');
    }
    setTimeout(() => setFeedbackMsg(''), 3000);
    if ('vibrate' in navigator) navigator.vibrate(150);
  };

  // TIME-DOMAIN PEAK WAVAFORM ANALYZER
  const startVoiceAudioAnalyzer = async () => {
    if (isListening) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported by this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mediaStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      const bufferLength = analyser.fftSize;
      const dataArray = new Uint8Array(bufferLength);

      let triggered = false;
      let sustainedPeakFrames = 0;

      const analyzeFrame = () => {
        analyser.getByteTimeDomainData(dataArray);

        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const sample = (dataArray[i] - 128) / 128;
          sumSquares += sample * sample;
        }

        const peakVol = Math.min(100, Math.round(Math.sqrt(sumSquares / bufferLength) * 220));
        setVoiceVolume(peakVol);

        sustainedPeakFrames = peakVol > 40 ? sustainedPeakFrames + 1 : 0;
        if (sustainedPeakFrames >= 4 && !triggered) {
          triggered = true;
          triggerEmergencyAction();
          window.setTimeout(() => { triggered = false; }, 3500);
        }

        animFrameRef.current = requestAnimationFrame(analyzeFrame);
      };

      analyzeFrame();
      setIsListening(true);
          setVoiceLog('Microphone listening for sustained loud sound. It cannot confirm an emergency.');
    } catch (err) {
      console.error('Microphone error:', err);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      setIsListening(false);
      setVoiceLog(err instanceof Error && err.message.includes('not supported')
        ? err.message
        : 'Microphone access denied. Allow mic access and try again.');
    }
  };

  const stopVoiceAudioAnalyzer = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close();
    setIsListening(false);
    setVoiceVolume(0);
    setVoiceLog('Voice detection stopped.');
  };

  const toggleVoiceAssistant = () => {
    if (isListening) {
      stopVoiceAudioAnalyzer();
    } else {
      startVoiceAudioAnalyzer();
    }
  };

  /*
  const handleConfirmIssue = (id, isConfirm) => {
    setIssues(prevIssues =>
      prevIssues.map(issue => {
        if (issue.id === id) {
          const currentSev = issue.severity || 3;
          const updatedSev = isConfirm ? Math.min(5, currentSev + 1) : Math.max(1, currentSev - 1);
          const updatedStatus = isConfirm ? 'reported' : 'fixed';

          const updated = {
            ...issue,
            severity: updatedSev,
            status: updatedStatus
          };

          if (selectedIssue?.id === id) {
            setSelectedIssue(updated);
          }
          return updated;
        }
        return issue;
      })
    );

    setFeedbackMsg(
      isConfirm
        ? '✓ Confirmed: Barrier is still active!'
        : '✓ Success: Barrier flagged as resolved!'
    );
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  */

  const triggerShopArrival = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }

    const newArrival = {
      id: `arrival-${Date.now()}`,
      profileType: 'Wheelchair User',
      secondsLeft: 120,
      etaFormatted: '2:00',
      distance: '45m away',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setShopArrivals(prev => [newArrival, ...prev]);
  };

  const handleAcknowledge = (id) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(100);
    }
    setShopArrivals(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col selection:bg-blue-500 selection:text-white">

      {/* Header Bar */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-[100] px-4 py-3 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Accessibility className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-slate-900">MOVA</span>
                <span className="bg-blue-500/20 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-500/30">
                  SIME DARBY
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">Township Accessibility System</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-inner">
            <button
              onClick={() => setActiveTab('resident')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'resident'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white'
              }`}
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>SS2 Resident Map</span>
            </button>

            {isShopOwner && (
              <button
                onClick={() => setActiveTab('shop')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'shop'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>Shopkeeper Monitor</span>
                {shopArrivals.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-white hover:text-slate-900"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log out</span>
            </button>

          </nav>
        </div>
      </header>

      {/* Main Pitch Views */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">SS2 Accessibility Map</h1>
            <p className="mt-0.5 text-xs text-slate-500">Explore reported barriers and choose what you need to do.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openReportFromPitch}
              className="rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"
            >
              Report a Barrier
            </button>
            <button
              type="button"
              onClick={onOpenPassive}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100"
            >
              Passive Detection
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (dataMode === 'demo') {
                  setIssues([]);
                  setSelectedIssue(null);
                  setIssuesState('loading');
                  setDataMode('live');
                } else {
                  setDataMode('demo');
                }
                setDemoNotice('');
              }}
              className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
            >
              {dataMode === 'demo' ? 'Exit Demo Mode' : 'View Fictional Demo Data'}
            </button>
            {dataMode === 'demo' && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800">DEMO DATA — NOT REAL REPORTS</span>
            )}
          </div>
        </div>

        {dataMode === 'demo' && (
          <section className="mb-5 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-xs text-amber-950" aria-label="Demo data notice">
            <p className="font-extrabold">DEMO DATA — NOT REAL REPORTS</p>
            <p className="mt-1">Showing eight local fictional scenarios only. They are not fetched from, inserted into, or combined with public.&quot;MOVA&quot;. Report submission is disabled until you exit Demo Mode.</p>
          </section>
        )}
        {demoNotice && (
          <p role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">{demoNotice}</p>
        )}
        {shopkeeperSetupIncomplete && (
          <p role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
            Your Shopkeeper Monitor setup is incomplete. You are signed in, but the monitor stays unavailable until approved account support adds your missing shop details.
          </p>
        )}

        {/* RESIDENT NAVIGATION VIEW */}
        {activeTab === 'resident' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  1. Active Access Profile
                </span>
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setProfile('wheelchair')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      profile === 'wheelchair'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Accessibility className="w-4 h-4" />
                    <span>Wheelchair User</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfile('blind');
                      startVoiceAudioAnalyzer();
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      profile === 'blind'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Eye className="w-4 h-4" />
                    <span>Visually Impaired</span>
                  </button>
                </div>
              </div>

              {/* Data-based project indicator; not a legal accessibility certification. */}
              <div className="flex items-center gap-3 bg-gradient-to-r from-white via-slate-50 to-white p-3 rounded-xl border border-amber-500/30 shadow-lg">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-sm border bg-slate-300/10 text-slate-700 border-slate-400/30">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">Township Rating:</span>
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                      {townshipRating.state === 'insufficient_data'
                        ? 'INSUFFICIENT DATA'
                        : townshipRating.badge
                          ? `${townshipRating.badge} PROJECT INDICATOR`
                          : 'BELOW BRONZE'}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-600 mt-0.5">
                    {townshipRating.state === 'insufficient_data'
                      ? `${townshipRating.completeRecords}/${townshipRating.totalRecords} complete records (${townshipRating.coveragePercent}% coverage).`
                      : `${townshipRating.score}/100 from verified-resolution status; ${townshipRating.coveragePercent}% record coverage.`}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">Project indicator only — not a legal accessibility certification.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* REAL MAP CONTAINER */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-2 flex flex-col justify-between relative overflow-hidden min-h-[440px] shadow-lg">

                {/* REQUIREMENT #2: ROUTE WITH WARNINGS BANNER */}
                <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-center justify-between text-amber-800 text-xs mb-2 font-semibold">
                  <div className="flex items-center gap-2">
                    <span>⚠️</span>
                    <span>Reported blockage on your route: Commercial Lot 4 Entrance</span>
                  </div>
                  <span className="text-[10px] bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40 text-amber-800 font-bold">
                    ROUTE WARNING
                  </span>
                </div>

                <div className="relative z-0 h-[380px] w-full rounded-xl overflow-hidden border border-slate-200">
                  <MapContainer
                    center={mapView.center}
                    zoom={mapView.zoom}
                    scrollWheelZoom={true}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <MapViewportManager onViewChange={handleMapViewChange} />
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {issues.filter((issue) => Number.isFinite(issue.lat) && Number.isFinite(issue.lng)).map((issue) => (
                      <Marker
                        key={issue.id}
                        position={[issue.lat, issue.lng]}
                        icon={selectedIssue?.id === issue.id ? activeIcon : defaultIcon}
                        eventHandlers={{
                          click: () => setSelectedIssue(issue),
                        }}
                      >
                        <Popup autoPan={false}>
                          <div className="text-xs font-sans text-slate-900 font-bold">
                            <p className="capitalize text-blue-600">{issue.type} Issue</p>
                            <p className="text-[10px] text-slate-500">{issue.location_name}</p>
                            <p className="text-[10px] text-slate-500">Slope: {issue.slope_degrees}°</p>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>

                <div className="relative z-10 bg-white/95 backdrop-blur-md p-3 mt-2 rounded-xl border border-slate-200 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Location: SS2, Petaling Jaya</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">Live GPS Connected</span>
                </div>

                {issuesState === 'loading' && (
                  <p role="status" className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs font-semibold text-indigo-700">Loading shared accessibility issues…</p>
                )}
                {issuesState === 'empty' && (
                  <p role="status" className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">No accessibility issues are available in the shared database yet.</p>
                )}
                {issuesState === 'ready' && issues.length > 0 && !issues.some((issue) => Number.isFinite(issue.lat) && Number.isFinite(issue.lng)) && (
                  <p role="status" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">Issues loaded, but their coordinate format cannot be shown on the map yet.</p>
                )}
                {issuesState === 'error' && (
                  <p role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">Could not load shared issues: {issuesError}</p>
                )}

                {issuesState === 'ready' && rankedIssues.length > 0 && (
                  <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-labelledby="priority-list-heading">
                    <div className="flex items-center justify-between gap-3">
                      <h2 id="priority-list-heading" className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Issue priority</h2>
                      <span className="text-[10px] font-semibold text-slate-500">Scored issues first</span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {rankedIssues.map(({ issue, priority }) => (
                        <button
                          key={issue.id}
                          type="button"
                          onClick={() => setSelectedIssue(issue)}
                          className={`w-full rounded-lg border p-2.5 text-left transition hover:border-indigo-300 hover:bg-white ${
                            selectedIssue?.id === issue.id
                              ? 'border-indigo-500 bg-white shadow-sm'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-xs font-bold capitalize text-slate-800">{issue.type} issue</span>
                            {priority.state === 'scored' && (
                              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-extrabold text-rose-700">{priority.score}/100</span>
                            )}
                            {priority.state === 'needs_triage' && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">Needs triage</span>
                            )}
                            {priority.state === 'resolved' && (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">Resolved</span>
                            )}
                          </div>
                          <p className="mt-1 text-[10px] text-slate-500">
                            {priority.state === 'needs_triage'
                              ? `Missing: ${priority.missingFields.join(', ')}`
                              : issue.location_name}
                          </p>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {issuesState === 'ready' && rankedIssues.length > 0 && (
                  <section className="mt-3" aria-label="Read-only issue queues">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Issue queues</h2>
                      <span className="text-[10px] font-semibold text-slate-500">Read-only classification</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <IssueQueuePanel
                        title="Maintenance"
                        description="Physical repairs and service faults."
                        entries={issueQueues.maintenance}
                        selectedIssue={selectedIssue}
                        onSelect={setSelectedIssue}
                      />
                      <IssueQueuePanel
                        title="Enforcement"
                        description="Obstructions requiring enforcement follow-up."
                        entries={issueQueues.enforcement}
                        selectedIssue={selectedIssue}
                        onSelect={setSelectedIssue}
                      />
                    </div>
                    {issueQueues.unclassified.length > 0 && (
                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] font-semibold text-amber-800">
                        {issueQueues.unclassified.length} issue{issueQueues.unclassified.length === 1 ? '' : 's'} need queue triage because their type is not in the current project taxonomy.
                      </p>
                    )}
                  </section>
                )}
              </div>

              {/* DETAILS PANEL, VOICE CONTROL & SAFETY LAYER */}
              <div className="space-y-6">

                {/* VOICE CONTROL WITH PEAK AMPLITUDE METER */}
                <div className="bg-white border-2 border-indigo-500/40 p-5 rounded-2xl shadow-md space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-indigo-700" />
                      <span>Time-Domain Voice Waveform Analyzer</span>
                    </h3>
                    {isListening && (
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-500/30 animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        Live Stream Active
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Sustained loud sound opens an unconfirmed safety review. It does not recognise words or confirm an emergency.
                  </p>

                  {isListening && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-slate-500">
                        <span>Voice Peak Amplitude:</span>
                        <span className="text-emerald-700 font-bold">{voiceVolume}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                        <div
                          className={`h-full transition-all duration-75 ${voiceVolume > 40 ? 'bg-red-500' : 'bg-emerald-400'}`}
                          style={{ width: `${voiceVolume}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={toggleVoiceAssistant}
                    className={`w-full font-extrabold py-3.5 rounded-xl border text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md ${
                      isListening
                        ? 'bg-red-600 text-white border-red-400 animate-pulse'
                        : 'bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-700 border-indigo-500/50'
                    }`}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-indigo-700" />}
                    <span>{isListening ? 'Stop Voice Detection' : 'Activate Live Voice Detection'}</span>
                  </button>

                  <div className="pt-2 border-t border-slate-200 space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-500 block">
                      Safety review controls:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => openEmergencySafetyReview('manual_safety_control')}
                        className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-500/40 text-[10px] font-bold py-2 rounded-lg transition active:scale-95 cursor-pointer"
                      >
                        Open emergency review
                      </button>
                      <button
                        type="button"
                        onClick={triggerReportAction}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-500/40 text-[10px] font-bold py-2 rounded-lg transition active:scale-95 cursor-pointer"
                      >
                        🗣 "Report barrier"
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200 text-[10px] font-mono text-indigo-700 font-bold">
                    {voiceLog}
                  </div>
                </div>

                {/* REQUIREMENT #3 & REQUIREMENT #4: VERIFIED RAMP DETAILS & COMPANION SUGGESTION */}
                {selectedIssue && (
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-md space-y-4">
                    <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                          Selected Micro-Path Detail
                        </span>
                        <h3 className="text-base font-extrabold text-slate-900 capitalize mt-0.5">
                          {selectedIssue.type} Issue
                        </h3>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${
                        selectedIssue.status === 'fixed'
                          ? 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-700 border-amber-500/30'
                      }`}>
                        {selectedIssue.status}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs text-slate-700 font-medium">
                      <p><span className="text-slate-500">Location:</span> {selectedIssue.location_name}</p>
                      <p><span className="text-slate-500">Gradient Measurement:</span> <strong className="text-slate-900 font-mono">{selectedIssue.slope_degrees}°</strong> (Standard: ≤ 4.8°)</p>
                      <p><span className="text-slate-500">Handrail Present:</span> {selectedIssue.handrail ? 'Yes' : 'No (Non-Compliant)'}</p>
                    </div>

                    {/* REQUIREMENT #4: COMPANION SUGGESTION */}
                    {selectedIssue.slope_degrees > 4.8 && (
                      <div className="bg-rose-50 border border-rose-500/40 p-3 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
                        <span>💡</span>
                        <span>Companion suggestion: This ramp is steep, consider going with someone.</span>
                      </div>
                    )}

                    <IssueWorkflowPanel issue={selectedIssue} />
                    <IssueEvidencePanel issue={selectedIssue} issues={issues} />
                  </div>
                )}

                {/* REQUIREMENT #8: EMERGENCY BUTTON FOR BLIND USERS */}
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-md space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-500" />
                      <span>Visually Impaired Safety Layer</span>
                    </h3>
                  </div>

                  <button
                    onClick={() => openEmergencySafetyReview('manual_safety_control')}
                    aria-label="Open emergency safety review"
                    className="w-full bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-black py-4 rounded-xl shadow-lg shadow-red-600/30 text-sm tracking-wider uppercase border-2 border-red-400 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <PhoneCall className="w-5 h-5 animate-bounce" />
                    <span>Emergency Safety Review</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REQUIREMENT #7: SHOP OWNER ALERT */}
        {isShopOwner && activeTab === 'shop' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-md flex justify-between items-center">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Shopkeeper Assistance Monitor</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {shopDetails?.name || 'Your shop'} · {shopDetails?.type || 'Shop'} · {shopDetails?.address || 'SS2, Petaling Jaya'}
                </p>
                {shopDetails?.contact && <p className="mt-1 text-[11px] text-slate-500">Contact: {shopDetails.contact}</p>}
              </div>
              <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 text-xs font-bold px-3 py-1.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Local demo monitor
              </span>
            </div>

            <div className="space-y-4">
              {shopArrivals.length === 0 ? (
                <div className="bg-white border border-slate-200 border-dashed p-12 text-center rounded-2xl space-y-3">
                  <Store className="w-10 h-10 text-slate-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-500">No approaching visitors right now.</p>
                  <p className="text-[11px] text-slate-500">Demo only: this trigger stays in this browser tab. GPS proximity and cross-tab Supabase Realtime are not configured.</p>
                  <button
                    type="button"
                    onClick={triggerShopArrival}
                    className="mt-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-700 border border-blue-500/40 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer active:scale-95 transition"
                  >
                    Simulate Local Arrival (Wheelchair user arriving, please open door)
                  </button>
                </div>
              ) : (
                shopArrivals.map(arrival => (
                  <div key={arrival.id} className="bg-white border border-blue-500/40 p-5 rounded-2xl shadow-md flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-700 shrink-0">
                        <Accessibility className="w-7 h-7 animate-pulse" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{arrival.profileType} Arriving</h4>
                          <span className="bg-amber-500/20 text-amber-800 border border-amber-500/30 font-mono text-[11px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-700 animate-spin" />
                            ETA: {arrival.secondsLeft > 0 ? arrival.etaFormatted : 'Arriving Now!'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 mt-1 font-medium">
                          Distance: {arrival.distance} • Wheelchair user arriving, please open the door.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAcknowledge(arrival.id)}
                      className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition shadow-md shrink-0"
                    >
                      Acknowledge & Accept
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </main>

      {/* Emergency Modal */}
      {emergencyModalOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-900/30 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border-2 border-red-500 p-6 rounded-2xl max-w-md w-full shadow-lg space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2 text-red-500">
                <ShieldAlert className="w-6 h-6 animate-pulse" />
                <h3 className="text-lg font-black tracking-wide uppercase">Emergency alert not sent</h3>
              </div>
              <button onClick={() => setEmergencyModalOpen(false)} className="text-slate-500 hover:text-slate-900 font-bold p-1 cursor-pointer">✕</button>
            </div>
            <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-bold">Status: Not sent — integration unavailable</p>
              <p>Source: {emergencySafetyEvent?.source === 'microphone_peak_detector' ? 'Microphone peak detector (unconfirmed)' : 'Manual safety control'}</p>
              <p>Observed: {emergencySafetyEvent?.observedAt ? new Date(emergencySafetyEvent.observedAt).toLocaleString() : 'Unavailable'}</p>
              <p>Location: Unavailable. The map view is not used as an alert location.</p>
            </div>
            <p className="text-xs text-slate-700">{emergencyIntegration.message} Emergency alerts are separate from accessibility issue reports.</p>
            <p className="text-[11px] text-slate-500">For immediate danger, use your local emergency service or other approved emergency channel.</p>
            <button
              onClick={() => setEmergencyModalOpen(false)}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold text-xs py-2.5 rounded-xl cursor-pointer"
            >
              Close Test Modal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentScreen, setCurrentScreen] = useState('home');
  const [selectedIssueType, setSelectedIssueType] = useState('ramp');

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) logSupabaseRequestError('session restore', '/auth/v1/user', error);
      setUser(data.session?.user || null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user || null);
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) {
      logSupabaseRequestError('sign-out', '/auth/v1/logout', error);
      return;
    }
    setCurrentScreen('home');
  };

  if (authLoading) {
    return <main className="min-h-screen bg-slate-50 grid place-items-center p-6 text-sm font-semibold text-slate-600">Checking your secure session…</main>;
  }

  if (!user) {
    return <AuthPage onSignedIn={(userData) => setUser(userData)} />;
  }

  const userRole = user?.user_metadata?.role || 'resident';
  const shopkeeperSetupIncomplete = hasShopOwnerAccess(user?.user_metadata)
    && !hasShopkeeperMonitorAccess(user?.user_metadata);

  if (userRole === 'developer') {
    return <DeveloperHome onLogout={handleLogout} />;
  }

  if (currentScreen === 'pitch' || currentScreen === 'home') {
    return (
      <IntegratedPitchView
        onOpenReport={() => setCurrentScreen('issues')}
        onOpenPassive={() => setCurrentScreen('passive')}
        onLogout={handleLogout}
        isShopOwner={hasShopkeeperMonitorAccess(user?.user_metadata)}
        shopDetails={user?.user_metadata?.shop}
        shopkeeperSetupIncomplete={shopkeeperSetupIncomplete}
      />
    );
  }

  if (currentScreen === 'issues') {
    return (
      <IssuePicker
        onChooseIssue={(issueType) => {
          setSelectedIssueType(issueType);
          setCurrentScreen('report');
        }}
        onBackToMap={() => setCurrentScreen('home')}
        onLogout={handleLogout}
      />
    );
  }

  if (currentScreen === 'passive') {
    return (
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6 text-left">
        <div className="max-w-xl mx-auto space-y-4">
          <button
            onClick={() => setCurrentScreen('home')}
            className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200 cursor-pointer"
          >
            ← Back to Resident Home
          </button>
          <MotionLogger />
        </div>
      </div>
    );
  }

  if (currentScreen === 'report') {
    return (
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6 text-left">
        <div className="max-w-xl mx-auto space-y-4">
          <button
            onClick={() => setCurrentScreen('home')}
            className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200 cursor-pointer"
          >
            ← Back to Resident Home
          </button>
          <ReportForm
            initialIssueType={selectedIssueType}
            onBackToDashboard={() => setCurrentScreen('home')}
          />
        </div>
      </div>
    );
  }

  return (
    <ResidentHome
      onChooseIssue={(issueType) => {
        setSelectedIssueType(issueType);
        setCurrentScreen('report');
      }}
      onOpenPassive={() => setCurrentScreen('passive')}
      onOpenPitch={() => setCurrentScreen('pitch')}
      onLogout={handleLogout}
    />
  );
}
