import PDFDocument from 'pdfkit';

// One page per log: crew, location, pain, vitals at that moment, probe angles, guidance.
export function sendReport(res, sessions, nameOf) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: false });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="AstraFit_Report.pdf"');
  doc.pipe(res);
  if (!sessions.length) { doc.addPage(); doc.fontSize(14).text('No logs saved yet.'); }
  for (const s of sessions) {
    doc.addPage();
    doc.rect(0, 0, 595, 64).fill('#0b3d91');
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(18).text('ASTRAFIT  |  CREW MEDICAL REPORT', 40, 24);
    doc.fillColor('#000').fontSize(11);
    let y = 90;
    const row = (k, v) => {
      const t = y;
      doc.font('Helvetica-Bold').text(k, 40, t, { width: 150 });
      doc.font('Helvetica').text(String(v ?? '-'), 200, t, { width: 350 });
      y = Math.max(doc.y, t + 14) + 8;
    };
    const head = (t) => { y += 6; doc.font('Helvetica-Bold').fontSize(12).fillColor('#0b3d91').text(t, 40, y); doc.fillColor('#000').fontSize(11); y = doc.y + 8; };
    head('CREW');
    row('Name', nameOf(s.crew_id)); row('Crew ID', s.crew_id); row('Log #', s.session_id); row('Time', String(s.started_at).slice(0, 19).replace('T', ' '));
    head('REPORTED INJURY');
    row('Location', s.exact_location); row('Region', s.body_region); row('Pain type', s.pain_description); row('Pain intensity', s.pain_intensity == null ? '-' : s.pain_intensity + ' / 10');
    head('VITALS AT THE TIME');
    row('Heart rate', s.heart_rate == null ? '-' : s.heart_rate + ' bpm'); row('Oxygen (SpO2)', s.spo2 == null ? '-' : s.spo2 + ' %');
    row('Blood pressure', s.bp_sys == null ? '-' : s.bp_sys + '/' + s.bp_dia + ' mmHg'); row('Motion', s.motion_g == null ? '-' : s.motion_g + ' g');
    head('PROBE');
    row('Pitch / roll', s.pitch_deg == null ? '-' : Number(s.pitch_deg).toFixed(1) + ' / ' + Number(s.roll_deg).toFixed(1) + ' deg');
    head('GUIDANCE');
    row('Suggested steps', s.advice);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#666').text('Generated from crew answers and sensor readings. Not a medical diagnosis. Contact the flight surgeon for any concern.', 40, 760, { width: 515 });
    doc.fillColor('#000');
  }
  doc.end();
}
