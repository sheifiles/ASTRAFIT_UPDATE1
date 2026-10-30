import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
export const sql = neon(url as string);

let ready: Promise<void> | null = null;

// Creates the tables the first time any function runs (safe to run repeatedly)
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS crew_members (
        crew_id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        role TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS sessions (
        session_id SERIAL PRIMARY KEY,
        crew_id TEXT NOT NULL REFERENCES crew_members(crew_id),
        started_at TIMESTAMPTZ DEFAULT now(),
        body_region TEXT,
        exact_location TEXT,
        pain_description TEXT,
        pain_intensity INTEGER,
        heart_rate INTEGER,
        coded_marker TEXT,
        pitch_deg REAL,
        roll_deg REAL,
        contact_force_n REAL,
        impact_g REAL,
        notes TEXT
      )`;
      for (const c of ['spo2 INTEGER', 'bp_sys INTEGER', 'bp_dia INTEGER', 'motion_g REAL', 'advice TEXT']) {
        await sql.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ${c}`);
      }
      await sql`CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        crew_id TEXT NOT NULL,
        body_part TEXT,
        module TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        resolved BOOLEAN DEFAULT false,
        acks TEXT DEFAULT ''
      )`;
      // Fixed roster of 6 (edit names here or in the database). Existing rows are never overwritten.
      await sql`INSERT INTO crew_members (crew_id, full_name, role) VALUES
        ('CM-001', 'Crew_member1', NULL),
        ('CM-002', 'Crew_member2', NULL), ('CM-003', 'Crew_member3', NULL),
        ('CM-004', 'Crew_member4', NULL), ('CM-005', 'Crew_member5', NULL), ('CM-006', 'Crew_member6', NULL)
        ON CONFLICT (crew_id) DO NOTHING`;
      await sql`UPDATE crew_members SET full_name = 'Crew_member1', role = NULL WHERE crew_id = 'CM-001' AND full_name = 'Demo Astronaut'`;
    })().catch((e) => {
      ready = null; // retry on the next request
      throw e;
    });
  }
  return ready;
}

// If ACCESS_CODE is set in Vercel, every request must carry it.
export function authorized(req: any, res: any): boolean {
  const code = process.env.ACCESS_CODE;
  if (!code) return true;
  const given = req.headers['x-access-code'] || req.query?.code;
  if (given === code) return true;
  res.status(401).json({ error: 'Access code required' });
  return false;
}

export const CREW_ID = /^[A-Za-z0-9_-]{1,31}$/;

export const num = (v: unknown): number | null =>
  v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v);

export const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};

export const text = (v: unknown): string | null =>
  v === undefined || v === null ? null : String(v).slice(0, 2000);