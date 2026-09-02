/**
 * SystemStatus — live health check on every api/ route, probed with an
 * unauthenticated request. Safe on every route (including delete-school)
 * because every handler's requireAuth()/CRON_SECRET check runs before it
 * ever touches the request body. 401 (or 200 for the bodyless /api/ping)
 * means the function loaded and is executing; anything else (404, 500,
 * timeout) means it's actually broken.
 */
import React, { useEffect, useState } from 'react';
import { Activity, CheckCheck, AlertCircle, Loader2 } from 'lucide-react';

const API_ROUTES: { path: string; method: 'GET' | 'POST'; label: string; group: string }[] = [
  { path: '/api/ping', method: 'GET', label: 'ping', group: 'Core' },
  { path: '/api/comms', method: 'POST', label: 'comms', group: 'Core' },
  { path: '/api/google', method: 'POST', label: 'google', group: 'Core' },
  { path: '/api/send-email', method: 'POST', label: 'send-email', group: 'Core' },
  { path: '/api/storage', method: 'POST', label: 'storage', group: 'Core' },
  { path: '/api/get-upload-signature', method: 'POST', label: 'get-upload-signature', group: 'Core' },
  { path: '/api/set-student-password', method: 'POST', label: 'set-student-password', group: 'Core' },
  { path: '/api/delete-school', method: 'POST', label: 'delete-school', group: 'Core' },
  { path: '/api/cron?job=daily-reminders', method: 'GET', label: 'cron/daily-reminders', group: 'Cron' },
  { path: '/api/cron?job=expire-demo', method: 'GET', label: 'cron/expire-demo', group: 'Cron' },
  { path: '/api/cron?job=send-scheduled', method: 'GET', label: 'cron/send-scheduled', group: 'Cron' },
  { path: '/api/cron?job=attendance-watch', method: 'GET', label: 'cron/attendance-watch', group: 'Cron' },
];

type Status = 'checking' | 'up' | 'down';
interface RouteResult { status: Status; ms: number | null; code: number | null; }

export default function SystemStatus() {
  const [results, setResults] = useState<Record<string, RouteResult>>({});
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const check = async () => {
    setChecking(true);
    setResults(Object.fromEntries(API_ROUTES.map(r => [r.path, { status: 'checking' as const, ms: null, code: null }])));
    const entries = await Promise.all(API_ROUTES.map(async r => {
      const start = performance.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(r.path, { method: r.method, signal: controller.signal });
        clearTimeout(timeout);
        const ms = Math.round(performance.now() - start);
        const up = r.path === '/api/ping' ? res.status === 200 : res.status === 401;
        return [r.path, { status: up ? 'up' as const : 'down' as const, ms, code: res.status }] as const;
      } catch {
        return [r.path, { status: 'down' as const, ms: Math.round(performance.now() - start), code: null }] as const;
      }
    }));
    setResults(Object.fromEntries(entries));
    setLastChecked(new Date());
    setChecking(false);
  };

  useEffect(() => { check(); }, []);

  const resultList: RouteResult[] = Object.values(results);
  const upCount = resultList.filter(r => r.status === 'up').length;
  const downCount = resultList.filter(r => r.status === 'down').length;
  const allUp = downCount === 0 && upCount === API_ROUTES.length;
  const groups = [...new Set(API_ROUTES.map(r => r.group))];

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-600" /> System Status
          </h1>
          <p className="text-slate-500 text-sm mt-1">Live health check on every backend route — no dashboard access needed to see if something's broken.</p>
        </div>
        <button onClick={check} disabled={checking}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm"
        >
          {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
          {checking ? 'Checking…' : 'Recheck'}
        </button>
      </div>

      <div className={`rounded-2xl p-5 border flex items-center gap-3 ${allUp ? 'bg-emerald-50 border-emerald-200' : checking ? 'bg-slate-50 border-slate-200' : 'bg-red-50 border-red-200'}`}>
        {checking ? (
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
        ) : allUp ? (
          <CheckCheck className="w-5 h-5 text-emerald-600" />
        ) : (
          <AlertCircle className="w-5 h-5 text-red-600" />
        )}
        <div>
          <p className={`font-semibold text-sm ${allUp ? 'text-emerald-800' : checking ? 'text-slate-600' : 'text-red-800'}`}>
            {checking ? 'Checking all routes…' : allUp ? `All ${API_ROUTES.length} routes operational` : `${downCount} of ${API_ROUTES.length} route${downCount !== 1 ? 's' : ''} down`}
          </p>
          {lastChecked && (
            <p className="text-xs text-slate-500 mt-0.5">
              Last checked {lastChecked.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>
      </div>

      {groups.map(group => (
        <div key={group} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 text-sm">{group}</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {API_ROUTES.filter(r => r.group === group).map(r => {
              const result = results[r.path] ?? { status: 'checking' as const, ms: null, code: null };
              return (
                <div key={r.path} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${
                      result.status === 'up' ? 'bg-emerald-500' : result.status === 'down' ? 'bg-red-500' : 'bg-slate-300 animate-pulse'
                    }`} />
                    <span className="font-mono text-sm text-slate-700">{r.label}</span>
                    <span className="text-xs text-slate-400">{r.method}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    {result.code !== null && <span>HTTP {result.code}</span>}
                    {result.ms !== null && <span>{result.ms}ms</span>}
                    <span className={`font-semibold px-2 py-0.5 rounded-full ${
                      result.status === 'up' ? 'bg-emerald-50 text-emerald-700' : result.status === 'down' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-400'
                    }`}>
                      {result.status === 'checking' ? 'checking…' : result.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
