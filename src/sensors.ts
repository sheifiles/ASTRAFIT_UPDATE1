// ============================================================================
// SENSOR LAYER — the ONLY file you touch when the real hardware is ready.
//
// The UI never talks to hardware directly. It calls useSensors() and gets:
//   vitals  -> { hr, spo2, sys, dia, g }   (null = no reading)
//   orient  -> { pitch, roll } in degrees  (probe tilt)
//
// Two modes:
//   SIMULATED (default)  fake values so the app runs on any laptop.
//   LIVE                 values arrive from a small service on the Raspberry Pi.
//                        Turn on with  VITE_SENSOR_BRIDGE=ws://localhost:8765
//
// The Pi service reads the I2C sensors and sends JSON once per ~100 ms:
//   {"hr":72,"spo2":98,"sys":118,"dia":76,"g":1.02,"pitch":4.2,"roll":-1.8}
// ============================================================================
import { useEffect, useState } from 'react';

export interface Vitals { hr: number | null; spo2: number | null; sys: number | null; dia: number | null; g: number | null }
export interface Orient { pitch: number; roll: number }
export type SensorMode = 'SIMULATED' | 'LIVE';

const EMPTY: Vitals = { hr: null, spo2: null, sys: null, dia: null, g: null };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ---- PLACEHOLDER: MAX30102 (heart rate + SpO2) ------------------------------
// Put the real read here (or in the Pi service). Return null until it works.
// NOTE: the MAX30102 cannot measure blood pressure. sys/dia need a cuff or a
// separate estimate, so they stay simulated/null until you decide the source.
function readMax30102(): Pick<Vitals, 'hr' | 'spo2'> {
  return { hr: Math.round(rnd(68, 78)), spo2: Math.round(rnd(97, 99)) }; // SIMULATED
}

// ---- PLACEHOLDER: MPU6050 / MPU9250 (motion + tilt) ---------------------------
// Put the real read here (or in the Pi service). Angles in degrees, g in units of g.
function readMpuMotion(): Pick<Vitals, 'g'> {
  return { g: +rnd(0.97, 1.04).toFixed(2) }; // SIMULATED
}

export function useSensors() {
  const [vitals, setVitals] = useState<Vitals>(EMPTY);
  const [orient, setOrient] = useState<Orient>({ pitch: 0, roll: 0 });
  const [mode, setMode] = useState<SensorMode>('SIMULATED');

  // LIVE: Raspberry Pi bridge
  useEffect(() => {
    const url = import.meta.env.VITE_SENSOR_BRIDGE as string | undefined;
    if (!url) return;
    let ws: WebSocket | null = null;
    let retry = 0;
    const open = () => {
      ws = new WebSocket(url);
      ws.onopen = () => setMode('LIVE');
      ws.onclose = () => { setMode('SIMULATED'); retry = window.setTimeout(open, 3000); };
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          setVitals({ hr: d.hr ?? null, spo2: d.spo2 ?? null, sys: d.sys ?? null, dia: d.dia ?? null, g: d.g ?? null });
          if (typeof d.pitch === 'number' && typeof d.roll === 'number') setOrient({ pitch: d.pitch, roll: d.roll });
        } catch { /* ignore bad packet */ }
      };
    };
    open();
    return () => { window.clearTimeout(retry); ws?.close(); };
  }, []);

  // SIMULATED: only runs while there is no live bridge
  useEffect(() => {
    if (mode === 'LIVE') return;
    const tick = () => setVitals({ ...readMax30102(), ...readMpuMotion(), sys: Math.round(rnd(116, 122)), dia: Math.round(rnd(75, 80)) });
    tick();
    const t = setInterval(tick, 1500);
    return () => clearInterval(t);
  }, [mode]);

  // setOrient is only used in SIMULATED mode (drag on the level widget)
  return { vitals, orient, mode, simTilt: mode === 'SIMULATED' ? setOrient : () => {} };
}
