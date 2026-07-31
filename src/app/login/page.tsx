type LoginSearch = { next?: string; error?: string };

export const metadata = {
  title: 'Sign in - Tech on Toast Approved Partner Portal',
};

const PORTAL_SECTIONS = [
  {
    title: 'Lead pipeline',
    body: 'Every lead referred through Tech on Toast, scored and tracked from MAL through MQL, SQL and Closed Won.',
  },
  {
    title: 'Partner performance',
    body: 'A heat-mapped view of which partners are converting, which need attention, and how each compares on conversion ratios.',
  },
  {
    title: 'NPS feedback',
    body: 'Net Promoter Score across every touchpoint — stack reviews and support chat — broken down by vendor.',
  },
  {
    title: 'Community activity',
    body: 'Marketplace traffic, podcast and event activity, plus what the operator community is talking about right now.',
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearch>;
}) {
  const { next = '/', error } = await searchParams;
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return (
    <div className="min-h-screen bg-brand-cream px-4 py-10 sm:py-16">
      <div className="max-w-4xl mx-auto">
        {/* Welcome / brand header */}
        <div className="flex flex-col items-center text-center mb-10">
          <img
            src="/stacked-wordmark.svg"
            alt="Stacked"
            className="h-14 w-auto mb-6"
          />
          <h1 className="font-display text-4xl sm:text-5xl text-brand-green leading-[1] tracking-tight">
            Approved<br/>Partner Portal
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-4 max-w-xl leading-relaxed">
            The single hub for measuring what we&apos;re doing for our approved
            partners — from inbound leads and conversion performance to
            community sentiment and marketing reach.
          </p>
        </div>

        {/* What's inside */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
          {PORTAL_SECTIONS.map(section => (
            <div key={section.title} className="bg-white/70 border border-gray-200/70 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-brand-green mb-1">{section.title}</h2>
              <p className="text-xs text-gray-600 leading-relaxed">{section.body}</p>
            </div>
          ))}
        </div>

        {/* Sign-in card */}
        <div className="max-w-sm mx-auto bg-white rounded-2xl shadow-sm border border-gray-200/70 p-8">
          <h2 className="text-lg font-semibold text-brand-green mb-1">Sign in</h2>
          <p className="text-sm text-gray-500 mb-6">Enter the team password to continue.</p>

          {error ? (
            <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              Incorrect password. Try again.
            </div>
          ) : null}

          <form method="post" action="/api/auth/login" className="space-y-4">
            <input type="hidden" name="next" value={safeNext} />
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wide">Password</span>
              <input
                type="password"
                name="password"
                required
                autoFocus
                autoComplete="current-password"
                className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green"
              />
            </label>
            <button
              type="submit"
              className="w-full bg-brand-green hover:bg-brand-green-soft text-white text-sm font-medium py-2.5 rounded-md transition-colors"
            >
              Sign in
            </button>
          </form>
        </div>

        <p className="text-xs text-gray-500 mt-6 text-center">
          Partners with a personal <code className="bg-white/60 px-1 py-0.5 rounded">/p/</code> link don&apos;t need a password.
        </p>
      </div>
    </div>
  );
}
