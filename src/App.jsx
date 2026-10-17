import { useEffect, useState } from 'react';
import ReportForm from './ReportForm.jsx';
import MotionLogger from './MotionLogger.jsx';
import { getSupabaseClient } from './lib/supabaseClient.js';
import { ArrowRight, Building, User, LogOut, Sparkles } from 'lucide-react';
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
    icon: '⇵',
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const isSignup = mode === 'signup';

  async function submitAuth(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const supabase = getSupabaseClient();
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { role },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (data.session?.user) {
          onSignedIn(data.session.user);
        } else if (data.user) {
          setMessage('Account created. Check your email and confirm your address before signing in. If no email arrives, ask the project admin to check Supabase Auth email confirmation and SMTP settings.');
        } else {
          setMessage('Account created. Check your email for a confirmation link before signing in.');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) onSignedIn(data.user);
      }
    } catch (err) {
      setMessage(err?.code === 'email_not_confirmed'
        ? 'This account is not confirmed yet. Open the confirmation link sent by email, then sign in again. If you cannot receive the email, the Supabase project admin must adjust the Auth email confirmation settings.'
        : err?.message || 'Sign in failed. Check your details.');
    } finally {
      setBusy(false);
    }
  }

  function handleQuickDemo(targetRole) {
    onSignedIn({
      id: 'demo_' + targetRole,
      email: `${targetRole}@ss2.mova.my`,
      user_metadata: { role: targetRole },
    });
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
              Report physical access problems with a photo, verified GPS location, and targeted tools:
              ramp reports get a <strong>live tilt meter</strong>; tactile paving reports get an <strong>AI vision check</strong>.
            </p>
          </div>
        </section>

        <form
          onSubmit={submitAuth}
          className="rounded-3xl bg-white p-6 sm:p-8 shadow-xs border border-slate-200/90 space-y-5"
        >
          <div>
            <h2 className="text-2xl font-black text-slate-900">
              {isSignup ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {isSignup ? 'Choose your role to join MOVA.' : 'Sign in to report or review township barriers.'}
            </p>
          </div>

          <div className="rounded-2xl bg-indigo-50/70 p-3.5 border border-indigo-100 space-y-2">
            <span className="text-[11px] font-bold text-indigo-950 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              1-Click Demo Testing:
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickDemo('resident')}
                className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-indigo-200 text-indigo-700 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-indigo-600" />
                <span>Demo Resident</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('developer')}
                className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Building className="w-3.5 h-3.5 text-slate-500" />
                <span>Demo Developer</span>
              </button>
            </div>
          </div>

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
                <option value="developer">Developer</option>
              </select>
            </div>
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

          {message && (
            <p className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-xs transition-colors cursor-pointer"
          >
            {busy ? 'Please wait…' : isSignup ? 'Create Account' : 'Sign In'}
          </button>

          <p className="text-center text-xs text-slate-500 pt-1">
            {isSignup ? 'Already have an account?' : 'New to MOVA?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? 'signin' : 'signup');
                setMessage('');
              }}
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
    <div
      onClick={onClick}
      className="group rounded-3xl bg-white p-5 shadow-xs border border-slate-200/90 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-3"
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
    </div>
  );
}

function ResidentHome({ onChooseIssue, onOpenPassive, onLogout }) {
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
              Choose the problem you encountered below. Each issue launches its own specialized sensor or AI check—ramp tilt is only used for ramps!
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
            This space is prepared for the developer dashboard when that part of the project is implemented by your teammate (Person B).
          </p>

          <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 text-xs text-left space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Pilot Township:</span>
              <span className="font-bold text-slate-800">SS2, Petaling Jaya</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Master Developer:</span>
              <span className="font-bold text-slate-800">Sime Darby Property</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Audit Status:</span>
              <span className="font-bold text-emerald-600">Active Field Collection</span>
            </div>
          </div>

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

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPage] = useState('home');
  const [issueType, setIssueType] = useState('ramp');

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive && session?.user) setUser(session.user);
      if (alive && !session?.user) setUser(null);
    });

    async function restoreSession() {
      try {
        const { data } = await supabase.auth.getSession();
        if (alive && data?.session?.user) {
          setUser(data.session.user);
        }
      } catch {
        // ignore
      } finally {
        if (alive) setAuthReady(true);
      }
    }
    restoreSession();
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  function acceptSignedInUser(nextUser) {
    setUser(nextUser);
    setPage('home');
  }

  async function logOut() {
    try {
      await getSupabaseClient().auth.signOut();
    } catch {
      // ignore
    } finally {
      setUser(null);
      setPage('home');
    }
  }

  if (!authReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-600">
        <p className="text-sm font-semibold flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
          Loading MOVA…
        </p>
      </main>
    );
  }

  if (!user) return <AuthPage onSignedIn={acceptSignedInUser} />;

  const role = user.user_metadata?.role === 'developer' ? 'developer' : 'resident';
  if (role === 'developer') return <DeveloperHome onLogout={logOut} />;
  if (page === 'report') return <ReportForm key={issueType} initialIssueType={issueType} onBackToDashboard={() => setPage('home')} />;
  if (page === 'passive') return <MotionLogger onBackToHome={() => setPage('home')} onLogout={logOut} />;

  return (
    <ResidentHome
      onChooseIssue={(nextType) => {
        setIssueType(nextType);
        setPage('report');
      }}
      onOpenPassive={() => setPage('passive')}
      onLogout={logOut}
    />
  );
}
