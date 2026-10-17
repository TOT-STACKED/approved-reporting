'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteVisit({ id, back }: { id: string; back: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!confirm('Delete this visit and its photos? This can’t be undone.')) return;
        setBusy(true);
        const res = await fetch(`/api/field/visits/${id}`, { method: 'DELETE' });
        if (res.ok) { router.replace(back); router.refresh(); } else { setBusy(false); alert('Couldn’t delete. Try again.'); }
      }}
      className="h-14 rounded-2xl border border-negative/40 px-5 text-[15px] font-bold text-negative active:bg-negative-tint disabled:opacity-50"
    >
      Delete
    </button>
  );
}
