import { sql, ensureSchema, authorized, num, int, text } from './_lib.js';

export default async function handler(req: any, res: any) {
  if (!authorized(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await ensureSchema();
    const s = req.body ?? {};
    if (!s.crew_id) return res.status(400).json({ error: 'crew_id is required' });

    const crewId = String(s.crew_id);
    const exists = await sql`SELECT 1 FROM crew_members WHERE crew_id = ${crewId}`;
    if (exists.length === 0) return res.status(404).json({ error: `Unknown crew_id ${crewId}` });

    const rows = await sql`INSERT INTO sessions
      (crew_id, body_region, exact_location, pain_description, pain_intensity, heart_rate,
       coded_marker, pitch_deg, roll_deg, contact_force_n, impact_g, notes, spo2, bp_sys, bp_dia, motion_g, advice)
      VALUES (${crewId}, ${text(s.body_region)}, ${text(s.exact_location)}, ${text(s.pain_description)},
       ${int(s.pain_intensity)}, ${int(s.heart_rate)}, ${text(s.coded_marker)}, ${num(s.pitch_deg)},
       ${num(s.roll_deg)}, ${num(s.contact_force_n)}, ${num(s.impact_g)}, ${text(s.notes)},
       ${int(s.spo2)}, ${int(s.bp_sys)}, ${int(s.bp_dia)}, ${num(s.motion_g)}, ${text(s.advice)})
      RETURNING session_id`;
    return res.status(200).json({ session_id: rows[0].session_id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Database error' });
  }
}