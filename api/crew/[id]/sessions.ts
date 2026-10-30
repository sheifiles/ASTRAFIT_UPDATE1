import { sql, ensureSchema, authorized } from '../../_lib.js';

export default async function handler(req: any, res: any) {
  if (!authorized(req, res)) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await ensureSchema();
    const id = String(req.query.id);
    const rows = await sql`SELECT * FROM sessions WHERE crew_id = ${id} ORDER BY started_at DESC`;
    return res.status(200).json(rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Database error' });
  }
}