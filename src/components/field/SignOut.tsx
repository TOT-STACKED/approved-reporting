'use client';

import { useRouter } from 'next/navigation';

export default function SignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        if (!confirm('Sign out of Field on this phone?')) return;
        await fetch('/api/field/logout', { method: 'POST' });
        router.replace('/field/signin');
      }}
      className="h-11 rounded-full px-3 text-sm text-white/80 active:bg-white/10"
    >
      Sign out
    </button>
  );
}
