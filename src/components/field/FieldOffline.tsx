'use client';

import { useEffect, useState } from 'react';
import { flushOutbox, onOutboxChange, queuedVisits, type QueuedVisit } from '@/lib/field-outbox';

// Runs on every Field page. Registers the service worker (so the app opens
// with no signal), keeps its offline pages warm, sends anything waiting in the
// phone's queue whenever there's signal, and shows a strip when offline or
// when visits are waiting.

export default function FieldOffline() {
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState<QueuedVisit[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/field-sw.js', { scope: '/field' }).then(reg => {
        const warm = () => navigator.onLine && (reg.active || reg.waiting || reg.installing)?.postMessage({ type: 'warm' });
        if (reg.active) warm();
        else navigator.serviceWorker.ready.then(() => warm());
      }).catch(() => {});
    }

    const refresh = () => queuedVisits().then(setWaiting).catch(() => {});
    const send = async () => {
      if (!navigator.onLine) return;
      if (!(await queuedVisits()).length) return;
      setSending(true);
      await flushOutbox().catch(() => {});
      setSending(false);
      refresh();
    };
    const update = () => { setOnline(navigator.onLine); if (navigator.onLine) void send(); };

    update();
    refresh();
    const off = onOutboxChange(refresh);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const visible = () => { if (document.visibilityState === 'visible') update(); };
    document.addEventListener('visibilitychange', visible);
    const t = setInterval(send, 30000);
    return () => {
      off();
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      document.removeEventListener('visibilitychange', visible);
      clearInterval(t);
    };
  }, []);

  if (online && !waiting.length) return null;
  const stuck = waiting.find(w => w.error);
  return (
    <div className={`fixed inset-x-0 z-40 px-3 ${online ? 'bg-warning-tint text-warning-dark' : 'bg-night text-white'}`}
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }} role="status">
      <div className="mx-auto flex max-w-md items-center gap-2 py-2 text-[13px] font-bold md:max-w-2xl">
        <span className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-warning' : 'bg-negative'}`} />
        <span className="flex-1">
          {!online && 'No signal. You can still log visits.'}
          {waiting.length > 0 && ` ${waiting.length} visit${waiting.length === 1 ? '' : 's'} saved on this phone${online ? (sending ? ', sending…' : ', will send shortly') : ', will send when you’re back online'}.`}
          {stuck?.error && online && <span className="block font-normal">{stuck.venue_name}: {stuck.error}</span>}
        </span>
        {online && waiting.length > 0 && !sending && (
          <button type="button" onClick={async () => { setSending(true); await flushOutbox().catch(() => {}); setSending(false); }}
            className="h-9 shrink-0 rounded-full bg-white/70 px-3 text-[12px]">Send now</button>
        )}
      </div>
    </div>
  );
}
