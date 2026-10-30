// AstraFit API client.
// Uses the real backend when reachable (local Express server, or the Vercel /api functions).
// If no backend answers, falls back to browser storage so the demo still works.

export interface SessionData {
  crew_id: string;
  body_region?: string;
  exact_location?: string;
  pain_description?: string;
  pain_intensity?: number;
  heart_rate?: number;
  spo2?: number;
  bp_sys?: number;
  bp_dia?: number;
  motion_g?: number;
  advice?: string;
  coded_marker?: string;
  pitch_deg?: number;
  roll_deg?: number;
  contact_force_n?: number;
  impact_g?: number;
  notes?: string;
}

export interface CrewMember {
  crew_id: string;
  full_name: string;
  role: string | null;
}

let demo = false;
export const isDemoMode = () => demo;

const LS_CREW = 'astrafit_demo_crew';
const LS_SESS = 'astrafit_demo_sessions';
const LS_CODE = 'astrafit_code';
const DEFAULT_CREW: CrewMember[] = [
  { crew_id: 'CM-001', full_name: 'Crew_member1', role: null },
  { crew_id: 'CM-002', full_name: 'Crew_member2', role: null },
  { crew_id: 'CM-003', full_name: 'Crew_member3', role: null },
  { crew_id: 'CM-004', full_name: 'Crew_member4', role: null },
  { crew_id: 'CM-005', full_name: 'Crew_member5', role: null },
  { crew_id: 'CM-006', full_name: 'Crew_member6', role: null },
];

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
}

const getCode = () => {
  try { return localStorage.getItem(LS_CODE) || ''; } catch { return ''; }
};

// Returns null when there is no real backend (network error or non-JSON reply)
async function tryApi<T>(url: string, init: RequestInit = {}, canRetry = true): Promise<T | null> {
  const code = getCode();
  const headers = { ...(init.headers as Record<string, string>), ...(code ? { 'x-access-code': code } : {}) };

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch {
    return null;
  }

  if (res.status === 401 && canRetry) {
    const entered = window.prompt('Access code required');
    if (entered) {
      try { localStorage.setItem(LS_CODE, entered.trim()); } catch { /* ignore */ }
      return tryApi<T>(url, init, false);
    }
    throw new Error('Access code required');
  }

  if (!(res.headers.get('content-type') || '').includes('application/json')) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function getCrew(): Promise<CrewMember[]> {
  const r = await tryApi<CrewMember[]>('/api/crew');
  if (r) { demo = false; return r; }
  demo = true;
  const list = read<CrewMember[]>(LS_CREW, DEFAULT_CREW);
  write(LS_CREW, list);
  return list;
}

export async function addCrew(c: { crew_id: string; full_name: string; role?: string }) {
  const r = await tryApi<{ ok: boolean }>('/api/crew', post(c));
  if (r) { demo = false; return r; }
  demo = true;
  const list = read<CrewMember[]>(LS_CREW, DEFAULT_CREW);
  if (!list.some((m) => m.crew_id === c.crew_id)) {
    list.push({ crew_id: c.crew_id, full_name: c.full_name, role: c.role ?? null });
    write(LS_CREW, list);
  }
  return { ok: true };
}

export async function saveSession(s: SessionData) {
  const r = await tryApi<{ session_id: number }>('/api/sessions', post(s));
  if (r) { demo = false; return r; }
  demo = true;
  const all = read<(SessionData & { session_id: number; started_at: string })[]>(LS_SESS, []);
  const session_id = all.length + 1;
  all.push({ ...s, session_id, started_at: new Date().toISOString() });
  write(LS_SESS, all);
  return { session_id };
}

export async function getCrewSessions(crewId: string) {
  const r = await tryApi<unknown[]>(`/api/crew/${encodeURIComponent(crewId)}/sessions`);
  if (r) return r;
  return read<(SessionData & { session_id: number })[]>(LS_SESS, []).filter((x) => x.crew_id === crewId);
}

export const reportsUrl = () => { const c = getCode(); return '/api/report?all=1' + (c ? `&code=${encodeURIComponent(c)}` : ''); };
export const EXCEL_URL = '/api/export.xlsx';

// Use this for the download link so the access code (if any) travels with it
export const excelUrl = () => {
  const c = getCode();
  return EXCEL_URL + (c ? `?code=${encodeURIComponent(c)}` : '');
};

// ---- Emergency alerts -------------------------------------------------------
// Delivery layer. Today: shared backend (every device polls /api/alerts).
// Later: swap these three functions for the Pi local-network version (WebSocket/MQTT).
export interface Alert { id: number; crew_id: string; body_part: string | null; module: string | null; created_at: string; resolved: boolean; acks: string[] }
const LS_AL = 'astrafit_alerts2';

export async function getAlerts(): Promise<Alert[]> {
  const r = await tryApi<Alert[]>('/api/alerts');
  if (r) return r;
  return read<Alert[]>(LS_AL, []).filter((a) => !a.resolved);
}

export async function sendAlert(a: { crew_id: string; body_part?: string; module?: string }): Promise<{ id: number; delivered: boolean }> {
  const r = await tryApi<{ id: number }>('/api/alerts', post(a));
  if (r) return { id: r.id, delivered: true };
  const list = read<Alert[]>(LS_AL, []);
  const id = Date.now();
  list.push({ id, crew_id: a.crew_id, body_part: a.body_part ?? null, module: a.module ?? null, created_at: new Date().toISOString(), resolved: false, acks: [] });
  write(LS_AL, list);
  return { id, delivered: false };
}

export async function alertAction(id: number, op: 'ack' | 'resolve', crew_id: string) {
  const r = await tryApi<{ ok: boolean }>('/api/alerts', post({ op, id, crew_id }));
  if (r) return;
  const list = read<Alert[]>(LS_AL, []).map((a) =>
    a.id !== id ? a : op === 'resolve' ? { ...a, resolved: true } : { ...a, acks: a.acks.includes(crew_id) ? a.acks : [...a.acks, crew_id] });
  write(LS_AL, list);
}
