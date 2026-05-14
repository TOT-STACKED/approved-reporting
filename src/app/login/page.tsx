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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold">
            ToT
          </div>
          <div>
            <div className="font-semibold text-gray-900">Tech on Toast</div>
            <div className="text-xs text-gray-500">Partner Portal sign-in</div>
          </div>
        </div>

        <h1 className="text-lg font-semibold text-gray-900 mb-1">Sign in</h1>
        <p className="text-sm text-gray-500 mb-6">Enter the team password to access the dashboard.</p>

        {error ? (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            Incorrect password. Try again.
          </div>
        ) : null}

        <form method="post" action="/api/auth/login" className="space-y-4">
          <input type="hidden" name="next" value={safeNext} />
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Password</span>
            <input
              type="password"
              name="password"
              required
              autoFocus
              autoComplete="current-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </label>
          <button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium py-2 rounded-md transition-colors"
          >
            Sign in
          </button>
        </form>

        <p className="text-xs text-gray-400 mt-6">
          Partner pages with a <code>/p/</code> link don&apos;t need a password.
        </p>
      </div>
    </div>
  );
}
