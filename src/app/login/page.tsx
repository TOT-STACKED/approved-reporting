type LoginSearch = { next?: string; error?: string };

export const metadata = {
  title: 'Sign in - Tech on Toast',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearch>;
}) {
  const { next = '/', error } = await searchParams;
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-cream px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <img
            src="/tech-on-toast-logo.svg"
            alt="Tech on Toast"
            className="h-20 w-auto text-brand-green mb-3"
          />
          <p className="text-xs uppercase tracking-[0.18em] text-brand-green-soft font-medium">
            Partner Portal
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/70 p-8">
          <h1 className="text-xl font-semibold text-brand-green mb-1">Welcome back</h1>
          <p className="text-sm text-gray-500 mb-6">Enter the team password to access your dashboard.</p>

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
          Partner pages with a <code className="bg-white/60 px-1 py-0.5 rounded">/p/</code> link don&apos;t need a password.
        </p>
      </div>
    </div>
  );
}
