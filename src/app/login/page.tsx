import StackedLogo from '@/components/renewals/StackedLogo';

type LoginSearch = { next?: string; error?: string };

export const metadata = {
  title: 'Sign in - Stacked Approved Partner Portal',
};

// Team sign-in for the Approved Partner Portal (also approvedreporting.netlify.app).
// Same palette as the partner, Renewals and Field sign-ins: night purple page,
// cream card, Chunko heading, orange call to action. On wide screens the
// headline and what's inside sit beside the card; on phones the card comes
// first so the team can sign in without scrolling.
const NIGHT = '#2A1D6B';
const CREAM = '#FAF3E5';
const INK = '#38278F';
const SOFT = '#5B4F8C';
const LINE = '#E4DAC6';

// Pastel tiles from the design system, each with its own ink.
const SECTIONS = [
  { title: 'Lead pipeline', body: 'Every referred lead, MAL through to Closed Won.', bg: '#90D8F0', ink: '#1F4E6E' },
  { title: 'Partner performance', body: 'Who is converting and who needs a nudge.', bg: '#B0F070', ink: '#204000' },
  { title: 'NPS feedback', body: 'Operator sentiment, broken down by vendor.', bg: '#FFF0C0', ink: '#6B4A00' },
  { title: 'Community activity', body: 'Marketplace, podcast and event reach.', bg: '#D8C0F0', ink: '#301878' },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearch>;
}) {
  const { next = '/', error } = await searchParams;
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return (
    <main className="min-h-dvh font-body px-4 py-8 sm:py-12 lg:flex lg:items-center" style={{ background: NIGHT }}>
      <div className="w-full max-w-6xl mx-auto grid gap-8 lg:gap-16 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        {/* Headline and what's inside. Below the card on phones. */}
        <section className="order-2 lg:order-1" style={{ color: CREAM }}>
          <p className="font-mono text-xs uppercase tracking-[0.14em] mb-4" style={{ color: `${CREAM}B3` }}>
            Stacked · Approved Reporting
          </p>
          <h1 className="font-display uppercase text-[44px] sm:text-[64px] lg:text-[76px] leading-[0.88] tracking-[-0.02em]">
            Approved<br />Partner<br />Portal
          </h1>
          <p className="text-[15px] sm:text-base leading-relaxed mt-5 max-w-md" style={{ color: `${CREAM}CC` }}>
            One place to see what Stacked is doing for every Approved partner: leads, conversion, sentiment and reach.
          </p>

          <ul className="grid grid-cols-2 gap-3 mt-8 max-w-lg">
            {SECTIONS.map(s => (
              <li key={s.title} className="rounded-[18px] p-4" style={{ background: s.bg, color: s.ink }}>
                <p className="font-semibold text-sm leading-tight">{s.title}</p>
                <p className="text-xs leading-snug mt-1.5 opacity-90">{s.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Sign-in card. First on phones. */}
        <div className="order-1 lg:order-2 w-full max-w-[440px] mx-auto lg:mx-0 lg:justify-self-end">
          <div className="rounded-[28px] p-6 sm:p-10" style={{ background: CREAM, color: INK }}>
            <div className="flex items-center gap-3 mb-7">
              <StackedLogo className="h-6 w-auto" />
              <span className="font-mono text-xs uppercase tracking-[0.1em]" style={{ color: SOFT }}>Team</span>
            </div>

            <h2 className="font-display uppercase text-[28px] sm:text-[32px] leading-[0.95] tracking-[-0.02em] mb-3" style={{ color: INK }}>
              Team sign in
            </h2>
            <p className="text-[15px] leading-relaxed mb-5" style={{ color: SOFT }}>
              Enter the team password to open the portal.
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
        </div>
      </div>
    </main>
  );
}
