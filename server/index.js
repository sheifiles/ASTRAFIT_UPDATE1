import express from 'express';
import cors from 'cors';
import { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';
import fs from 'fs';
import { sendReport } from './report.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'astrafit.db');
const XLSX_FILE = path.join(DATA_DIR, 'AstraFit_Reports.xlsx');

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
for (const c of ['spo2 INTEGER', 'bp_sys INTEGER', 'bp_dia INTEGER', 'motion_g REAL', 'advice TEXT']) {
  try { db.exec(`ALTER TABLE sessions ADD COLUMN ${c}`); } catch { /* already there */ }
}

// Seed one demo crew member so the app works on first run
for (const [id, name, role] of [['CM-001', 'Crew_member1', null], ['CM-002', 'Crew_member2', null], ['CM-003', 'Crew_member3', null], ['CM-004', 'Crew_member4', null], ['CM-005', 'Crew_member5', null], ['CM-006', 'Crew_member6', null]]) {
  db.prepare('INSERT OR IGNORE INTO crew_members (crew_id, full_name, role) VALUES (?,?,?)').run(id, name, role);
}
db.prepare("UPDATE crew_members SET full_name='Crew_member1', role=NULL WHERE crew_id='CM-001' AND full_name='Demo Astronaut'").run();

const COLS = [
  'session_id', 'started_at', 'body_region', 'exact_location', 'pain_description',
  'pain_intensity', 'heart_rate', 'coded_marker', 'pitch_deg', 'roll_deg',
  'contact_force_n', 'impact_g', 'notes', 'spo2', 'bp_sys', 'bp_dia', 'motion_g', 'advice', 'report_pdf',
];

// Excel writes are queued so two saves can never corrupt the file
let excelQueue = Promise.resolve();
function appendToExcel(crewId, row) {
  excelQueue = excelQueue.then(async () => {
    const wb = new ExcelJS.Workbook();
    if (fs.existsSync(XLSX_FILE)) await wb.xlsx.readFile(XLSX_FILE);
    let ws = wb.getWorksheet(crewId); // one sheet per crew member
    if (!ws) {
      ws = wb.addWorksheet(crewId);
      ws.addRow(COLS).font = { bold: true };
      ws.columns = COLS.map((c) => ({ width: Math.max(14, c.length + 2) }));
    }
    ws.addRow(COLS.map((c) => row[c]));
    await wb.xlsx.writeFile(XLSX_FILE);
  }).catch((err) => console.error('Excel export failed:', err));
  return excelQueue;
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_, res) => res.json({ ok: true }));

// ---- Crew ----
app.get('/api/crew', (_, res) =>
  res.json(db.prepare('SELECT * FROM crew_members ORDER BY crew_id').all()));

app.post('/api/crew', (req, res) => {
  const { crew_id, full_name, role } = req.body ?? {};
  if (!crew_id || !full_name) return res.status(400).json({ error: 'crew_id and full_name are required' });
  db.prepare('INSERT OR IGNORE INTO crew_members (crew_id, full_name, role) VALUES (?,?,?)')
    .run(crew_id, full_name, role ?? null);
  res.json({ ok: true });
});

// ---- Emergency alerts (in memory; fine for a local Pi hub) ----
let alerts = [];
app.get('/api/alerts', (_, res) =>
  res.json(alerts.filter((a) => !a.resolved && Date.now() - new Date(a.created_at).getTime() < 3600000)));
app.post('/api/alerts', (req, res) => {
  const b = req.body ?? {};
  if (!b.crew_id) return res.status(400).json({ error: 'crew_id is required' });
  if (b.op === 'resolve') { alerts = alerts.map((a) => (a.id === b.id ? { ...a, resolved: true } : a)); return res.json({ ok: true }); }
  if (b.op === 'ack') {
    alerts = alerts.map((a) => (a.id === b.id && !a.acks.includes(b.crew_id) ? { ...a, acks: [...a.acks, b.crew_id] } : a));
    return res.json({ ok: true });
  }
  const id = Date.now();
  alerts.push({ id, crew_id: b.crew_id, body_part: b.body_part ?? null, module: b.module ?? null, created_at: new Date().toISOString(), resolved: false, acks: [] });
  res.json({ id });
});

// ---- Sessions ----
app.post('/api/sessions', async (req, res) => {
  const s = req.body ?? {};
  if (!s.crew_id) return res.status(400).json({ error: 'crew_id is required' });
  const exists = db.prepare('SELECT 1 FROM crew_members WHERE crew_id=?').get(s.crew_id);
  if (!exists) return res.status(404).json({ error: `Unknown crew_id ${s.crew_id}` });

  const FIELDS = ['body_region', 'exact_location', 'pain_description', 'pain_intensity',
    'heart_rate', 'coded_marker', 'pitch_deg', 'roll_deg', 'contact_force_n', 'impact_g', 'notes', 'spo2', 'bp_sys', 'bp_dia', 'motion_g', 'advice'];
  const params = { crew_id: s.crew_id };
  for (const f of FIELDS) params[f] = s[f] ?? null;

  const info = db.prepare(`INSERT INTO sessions
    (crew_id, body_region, exact_location, pain_description, pain_intensity, heart_rate,
     coded_marker, pitch_deg, roll_deg, contact_force_n, impact_g, notes, spo2, bp_sys, bp_dia, motion_g, advice)
    VALUES (@crew_id, @body_region, @exact_location, @pain_description, @pain_intensity,
     @heart_rate, @coded_marker, @pitch_deg, @roll_deg, @contact_force_n, @impact_g, @notes, @spo2, @bp_sys, @bp_dia, @motion_g, @advice)`)
    .run(params);

  const row = db.prepare('SELECT * FROM sessions WHERE session_id=?').get(info.lastInsertRowid);
  row.report_pdf = { text: 'Open PDF report', hyperlink: `${req.protocol}://${req.get('host')}/api/report?id=${row.session_id}` };
  await appendToExcel(s.crew_id, row);
  res.json({ session_id: row.session_id });
});

app.get('/api/crew/:id/sessions', (req, res) =>
  res.json(db.prepare('SELECT * FROM sessions WHERE crew_id=? ORDER BY started_at DESC').all(req.params.id)));

// ---- PDF reports: ?id=12 for one log, ?all=1 for every log ----
app.get('/api/report', (req, res) => {
  const names = Object.fromEntries(db.prepare('SELECT crew_id, full_name FROM crew_members').all().map((c) => [c.crew_id, c.full_name]));
  const rows = req.query.all
    ? db.prepare('SELECT * FROM sessions ORDER BY crew_id, started_at').all()
    : db.prepare('SELECT * FROM sessions WHERE session_id=?').all(Number(req.query.id));
  sendReport(res, rows, (id) => names[id] ?? id);
});

// ---- Excel download ----
app.get('/api/export.xlsx', (_, res) => {
  if (!fs.existsSync(XLSX_FILE)) return res.status(404).json({ error: 'No reports saved yet' });
  res.download(XLSX_FILE);
});

// ---- Reference dataset stats (for the dashboard) ----
app.get('/api/reference/summary', (_, res) =>
  res.json(db.prepare(`SELECT d.name AS dataset, r.label, COUNT(*) AS images
    FROM ref_images r JOIN ref_datasets d USING (dataset_id)
    GROUP BY d.name, r.label ORDER BY d.name, r.label`).all()));

// Serve the built app (npm run build) so one process runs everything on the Pi
const DIST = path.join(__dirname, '..', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (_, res) => res.sendFile(path.join(DIST, 'index.html')));
}

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => console.log(`AstraFit API running on http://localhost:${PORT}`));