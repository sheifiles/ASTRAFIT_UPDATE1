import { sql, ensureSchema, authorized, CREW_ID, text } from './_lib.js';

// GET  -> active alerts (unresolved, last 60 min), each with the list of crew who acknowledged
// POST {crew_id, body_part?, module?}     -> raise an alert
// POST {op:'ack'|'resolve', id, crew_id}  -> acknowledge / close it
export default async function handler(req: any, res: any) {
  if (!authorized(req, res)) return;
  try {
    await ensureSchema();
    if (req.method === 'GET') {
      const rows = await sql`SELECT id, crew_id, body_part, module, created_at, resolved, acks FROM alerts
        WHERE resolved = false AND created_at > now() - interval '60 minutes' ORDER BY id DESC`;
      return res.status(200).json(rows.map((r: any) => ({ ...r, acks: String(r.acks || '').split(',').filter(Boolean) })));
    }
    if (req.method === 'POST') {
      const b = req.body ?? {};
      const crew = String(b.crew_id ?? '');
      if (!CREW_ID.test(crew)) return res.status(400).json({ error: 'Invalid crew_id' });
      if (b.op === 'resolve') {
        await sql`UPDATE alerts SET resolved = true WHERE id = ${Number(b.id)}`;
        return res.status(200).json({ ok: true });
      }
      if (b.op === 'ack') {
        await sql`UPDATE alerts SET acks = CASE WHEN (',' || acks || ',') LIKE ${'%,' + crew + ',%'} THEN acks ELSE acks || ',' || ${crew} END WHERE id = ${Number(b.id)}`;
        return res.status(200).json({ ok: true });
      }
      const rows = await sql`INSERT INTO alerts (crew_id, body_part, module) VALUES (${crew}, ${text(b.body_part)}, ${text(b.module)}) RETURNING id`;
      return res.status(200).json({ id: rows[0].id });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Database error' });
  }
}
