'use client';

import { useRouter } from 'next/navigation';

export default function SignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        if (!confirm('Sign out of Field on this phone?')) return;
        // Forget this phone too, or the sign-in page would sign straight back in.
        try { localStorage.removeItem('stacked-field-device'); } catch { /* ignore */ }
        await fetch('/api/field/logout', { method: 'POST' });
        router.replace('/field/signin');
      }}
      className="h-11 rounded-full px-3 text-sm text-white/80 active:bg-white/10"
    >
      Sign out
    </button>
  );
}
