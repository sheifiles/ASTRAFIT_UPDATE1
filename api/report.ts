import { sql, ensureSchema, authorized } from './_lib.js';
// @ts-ignore plain JS shared with the local server
import { sendReport } from '../server/report.js';

// GET /api/report?id=12  -> one log as PDF     GET /api/report?all=1 -> every log
export default async function handler(req: any, res: any) {
  if (!authorized(req, res)) return;
  try {
    await ensureSchema();
    const crew = await sql`SELECT crew_id, full_name FROM crew_members`;
    const names: Record<string, string> = Object.fromEntries(crew.map((c: any) => [c.crew_id, c.full_name]));
    const rows = req.query.all
      ? await sql`SELECT * FROM sessions ORDER BY crew_id, started_at`
      : await sql`SELECT * FROM sessions WHERE session_id = ${Number(req.query.id)}`;
    sendReport(res, rows, (id: string) => names[id] ?? id);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Report failed' });
  }
}
