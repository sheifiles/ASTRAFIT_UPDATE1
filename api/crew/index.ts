import { sql, ensureSchema, authorized, CREW_ID, text } from '../_lib.js';

export default async function handler(req: any, res: any) {
  if (!authorized(req, res)) return;
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const rows = await sql`SELECT crew_id, full_name, role, created_at FROM crew_members ORDER BY crew_id`;
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { crew_id, full_name, role } = req.body ?? {};
      if (!crew_id || !full_name) return res.status(400).json({ error: 'crew_id and full_name are required' });
      if (!CREW_ID.test(String(crew_id))) return res.status(400).json({ error: 'Invalid crew_id' });
      await sql`INSERT INTO crew_members (crew_id, full_name, role)
        VALUES (${String(crew_id)}, ${String(full_name).slice(0, 120)}, ${text(role)})
        ON CONFLICT (crew_id) DO NOTHING`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Database error' });
  }
}