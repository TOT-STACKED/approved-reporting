import StackedLogo from '@/components/renewals/StackedLogo';

type LoginSearch = { next?: string; error?: string };

export const metadata = {
  title: 'Sign in - Stacked Approved Partner Portal',
};

// Team sign-in for the Approved Partner Portal. Same look as the partner,
// Renewals and Field sign-ins: night purple page, cream card, Stacked
// wordmark, Chunko heading, orange call to action.
const NIGHT = '#2A1D6B';
const CREAM = '#FAF3E5';
const INK = '#38278F';
const SOFT = '#5B4F8C';
const LINE = '#E4DAC6';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearch>;
}) {
  const { next = '/', error } = await searchParams;
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-8 font-body" style={{ background: NIGHT }}>
      <div className="w-full max-w-[440px] rounded-[28px] p-6 sm:p-10" style={{ background: CREAM, color: INK }}>
        <div className="flex items-center gap-3 mb-7">
          <StackedLogo className="h-6 w-auto" />
          <span className="font-mono text-xs uppercase tracking-[0.1em]" style={{ color: SOFT }}>Partner Portal</span>
        </div>

        <h1 className="font-display uppercase text-[28px] sm:text-[32px] leading-[0.95] tracking-[-0.02em] mb-3" style={{ color: INK }}>
          Team sign in
        </h1>
        <p className="text-[15px] leading-relaxed mb-5" style={{ color: SOFT }}>
          Enter the team password to open the Approved Partner Portal.
        </p>

        <form method="post" action="/api/auth/login" className="space-y-3">
          <input type="hidden" name="next" value={safeNext} />
          <label htmlFor="password" className="sr-only">Team password</label>
          <input
            id="password"
            type="password"
            name="password"
            required
            autoFocus
            autoComplete="current-password"
            placeholder="Team password"
            className="w-full bg-white border rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-offset-0"
            style={{ borderColor: LINE, color: INK, '--tw-ring-color': `${INK}40` } as React.CSSProperties}
          />
          {error ? (
            <p role="alert" className="text-sm text-negative-dark">Incorrect password. Try again.</p>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-full bg-primary hover:bg-primary-hover active:bg-primary-press text-white px-6 py-3.5 text-[15px] font-bold uppercase tracking-[-0.01em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ '--tw-ring-color': INK, '--tw-ring-offset-color': CREAM } as React.CSSProperties}
          >
            Sign in
          </button>
        </form>

        <p className="text-xs leading-relaxed mt-6 pt-5 border-t" style={{ color: SOFT, borderColor: LINE }}>
          A partner? <a href="/signin" className="underline underline-offset-2" style={{ color: INK }}>Sign in with your work email</a> instead.
        </p>
      </div>
    </main>
  );
}
