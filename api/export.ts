import ExcelJS from 'exceljs';
import { sql, ensureSchema, authorized } from './_lib.js';

const COLS = [
  'session_id', 'started_at', 'body_region', 'exact_location', 'pain_description',
  'pain_intensity', 'heart_rate', 'coded_marker', 'pitch_deg', 'roll_deg',
  'contact_force_n', 'impact_g', 'notes', 'spo2', 'bp_sys', 'bp_dia', 'motion_g', 'advice', 'report_pdf',
];

// Builds the workbook on request from the database: one sheet per crew member
export default async function handler(req: any, res: any) {
  if (!authorized(req, res)) return;
  try {
    await ensureSchema();
    const crew = await sql`SELECT crew_id, full_name FROM crew_members ORDER BY crew_id`;
    const sessions = await sql`SELECT * FROM sessions ORDER BY started_at ASC`;

    const wb = new ExcelJS.Workbook();
    for (const c of crew) {
      const ws = wb.addWorksheet(String(c.crew_id));
      ws.addRow(COLS).font = { bold: true };
      ws.columns = COLS.map((name) => ({ width: Math.max(14, name.length + 2) }));
      for (const s of sessions.filter((x: any) => x.crew_id === c.crew_id)) {
        ws.addRow(COLS.map((k) => {
          if (k === 'report_pdf') return { text: 'Open PDF report', hyperlink: `https://${req.headers.host}/api/report?id=${(s as any).session_id}` };
          const v = (s as any)[k];
          return v instanceof Date ? v.toISOString() : v;
        }));
      }
    }

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="AstraFit_Reports.xlsx"');
    return res.status(200).send(Buffer.from(buf as ArrayBuffer));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Export failed' });
  }
}