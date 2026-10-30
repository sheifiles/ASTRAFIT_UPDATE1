import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, ChevronLeft, ChevronRight, Download, HeartPulse, LogOut, ShieldAlert, Check } from 'lucide-react';
import { getCrew, saveSession, getCrewSessions, excelUrl, reportsUrl, isDemoMode, getAlerts, sendAlert, alertAction } from './api';
import IdScan from './IdScan';
import { openCamera } from './camera';
import { getAdvice } from './advice';
import type { Advice } from './advice';
import type { CrewMember, Alert } from './api';
import { useSensors } from './sensors';

type Screen = 'splash' | 'login' | 'idscan' | 'admin' | 'home' | 'pain' | 'scan' | 'result' | 'vitals' | 'sos';
type View = 'front' | 'back';
const ADMIN = 'ADMIN';
const MODULES = ['Command', 'Lab', 'Airlock', 'Cupola', 'Crew Quarters', 'Gym', 'Galley', 'Storage'];

/* earth dimensions */
const WIDTH = 480;
const HEIGHT = 320;
const smooth = (t: number): number => t * t * (3 - 2 * t);

function hash(a: number, b: number, seed: number): number {
  const n = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number, cells: number, seed: number): number {
  const fx = (x / WIDTH) * cells;
  const fy = (y / HEIGHT) * cells;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smooth(fx - ix);
  const ty = smooth(fy - iy);
  const a = hash(ix % cells, iy, seed);
  const b = hash((ix + 1) % cells, iy, seed);
  const c = hash(ix % cells, iy + 1, seed);
  const d = hash((ix + 1) % cells, iy + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function fbm(x: number, y: number, seed: number, baseCells: number, octaves: number): number {
  let value = 0;
  let amplitude = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    value += amplitude * valueNoise(x, y, baseCells << o, seed);
    total += amplitude;
    amplitude /= 2;
  }
  return value / total;
}

function createLayer(): { canvas: HTMLCanvasElement; image: ImageData } | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const image = ctx.createImageData(WIDTH, HEIGHT);
    return { canvas, image };
  } catch {
    return null;
  }
}

/* earth noise layers */
function generateLayers(): { land: HTMLCanvasElement; clouds: HTMLCanvasElement } | null {
  try {
    const land = createLayer();
    const clouds = createLayer();
    if (!land || !clouds) return null;

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const k = (y * WIDTH + x) * 4;
        const height = fbm(x, y, 1, 3, 5) - 0.52;
        const detail = fbm(x, y, 3, 12, 2);
        const landMix = smooth(Math.max(0, Math.min(1, (height + 0.025) / 0.05)));

        let landR = 22 + 22 * detail;
        let landG = 42 + 26 * detail;
        let landB = 36 + 14 * detail;
        if (height > 0.02 && hash(x, y, 9) > 0.985) {
          landR = 255;
          landG = 190;
          landB = 110;
        }
        const oceanR = 8 + 10 * detail;
        const oceanG = 26 + 22 * detail;
        const oceanB = 70 + 40 * detail;
        const coast = Math.exp(-Math.abs(height) * 60) * 0.5;

        land.image.data[k] = oceanR + (landR - oceanR) * landMix + coast * 30;
        land.image.data[k + 1] = oceanG + (landG - oceanG) * landMix + coast * 70;
        land.image.data[k + 2] = oceanB + (landB - oceanB) * landMix + coast * 100;
        land.image.data[k + 3] = 255;

        const cover = fbm(x, y, 5, 4, 5);
        const alpha = Math.max(0, Math.min(1, (cover - 0.48) / 0.22));
        clouds.image.data[k] = 205;
        clouds.image.data[k + 1] = 220;
        clouds.image.data[k + 2] = 245;
        clouds.image.data[k + 3] = smooth(alpha) * 140;
      }
    }
    const landCtx = land.canvas.getContext('2d');
    const cloudCtx = clouds.canvas.getContext('2d');
    if (landCtx) landCtx.putImageData(land.image, 0, 0);
    if (cloudCtx) cloudCtx.putImageData(clouds.image, 0, 0);
    return { land: land.canvas, clouds: clouds.canvas };
  } catch {
    return null;
  }
}

function getTargetAngle(partName: string | null): { pitch: number; roll: number } {
  if (!partName) return { pitch: 15, roll: 0 };
  const p = partName.toLowerCase();
  const isRight = p.includes('right');
  const isLeft = p.includes('left');

  if (p.includes('head')) return { pitch: -24, roll: 0 };
  if (p.includes('neck')) return { pitch: 14, roll: isRight ? -16 : isLeft ? 16 : 0 };
  if (p.includes('chest')) return { pitch: 6, roll: 0 };
  if (p.includes('upper back')) return { pitch: -14, roll: 0 };
  if (p.includes('abdomen')) return { pitch: 28, roll: 0 };
  if (p.includes('pelvis') || p.includes('glutes')) return { pitch: 34, roll: 0 };
  if (p.includes('lower back')) return { pitch: -18, roll: 0 };
  if (p.includes('shoulder')) return { pitch: 12, roll: isRight ? -28 : 28 };
  if (p.includes('upper arm')) return { pitch: 20, roll: isRight ? -22 : 22 };
  if (p.includes('forearm')) return { pitch: 16, roll: isRight ? -18 : 18 };
  if (p.includes('elbow')) return { pitch: 4, roll: isRight ? -24 : 24 };
  if (p.includes('hand')) return { pitch: -2, roll: isRight ? -18 : 18 };
  if (p.includes('thigh')) return { pitch: 26, roll: isRight ? -14 : 14 };
  if (p.includes('knee')) return { pitch: 18, roll: isRight ? -20 : 20 };
  if (p.includes('calf')) return { pitch: -8, roll: isRight ? -16 : 16 };
  if (p.includes('ankle') || p.includes('foot')) return { pitch: -14, roll: isRight ? -12 : 12 };
  return { pitch: 16, roll: 8 };
}

function getPainsForArea(partName: string | null): string[] {
  if (!partName) return ['Sharp', 'Dull', 'Throbbing', 'Burning', 'Pressure', 'Cramping', 'Numb', 'Not sure'];
  const p = partName.toLowerCase();

  if (p.includes('head') || p.includes('neck')) {
    return ['Throbbing', 'Pressure', 'Sharp', 'Dull', 'Stiffness', 'Aura / Visual', 'Burning', 'Not sure'];
  }
  if (p.includes('chest') || p.includes('upper back')) {
    return ['Crushing', 'Sharp / Pleuritic', 'Burning', 'Dull ache', 'Tightness', 'Spasm', 'Radiating', 'Not sure'];
  }
  if (p.includes('abdomen') || p.includes('pelvis') || p.includes('glutes') || p.includes('lower back')) {
    return ['Cramping', 'Sharp / Focal', 'Dull ache', 'Burning', 'Bloating', 'Tender', 'Radiating', 'Not sure'];
  }
  return ['Sharp / Catching', 'Dull ache', 'Burning', 'Throbbing', 'Cramping', 'Numb / Tingling', 'Stiffness', 'Not sure'];
}

/* body map vectors */
const CENTER: [string, string, string, string?][] = [
  ['Head', 'UPPER', 'M80 4c-10 0-16 8-16 18s6 19 16 19 16-9 16-19S90 4 80 4z'],
  ['Neck', 'UPPER', 'M72 39h16l2 14H70z'],
  ['Chest', 'UPPER', 'M60 54q20-6 40 0l-1 38q-19 5-38 0z', 'Upper back'],
  ['Abdomen', 'LOWER', 'M61 94q19 5 38 0l-1 32q-18 4-36 0z', 'Lower back'],
  ['Pelvis', 'LOWER', 'M62 128q18 4 36 0l4 24q-22 10-44 0z', 'Glutes'],
];
const SIDE: [string, string, string][] = [
  ['shoulder', 'UPPER', 'M59 55c-9 1-17 5-21 12l12 6 9-10z'],
  ['upper arm', 'UPPER', 'M38 68l13 6-8 42-13-2z'],
  ['elbow', 'UPPER', 'M29 120a8 8 0 1 0 16 0a8 8 0 1 0-16 0z'],
  ['forearm', 'UPPER', 'M30 128h14l-6 44-12-2z'],
  ['hand', 'UPPER', 'M25 173l12 2-1 20q-6 6-12 0z'],
  ['thigh', 'LOWER', 'M60 156h20l-4 72h-12z'],
  ['knee', 'LOWER', 'M62 238a9 9 0 1 0 18 0a9 9 0 1 0-18 0z'],
  ['calf', 'LOWER', 'M63 248h16l-3 36h-10z'],
  ['ankle', 'LOWER', 'M65 287a6 5 0 1 0 12 0a6 5 0 1 0-12 0z'],
  ['foot', 'LOWER', 'M63 293h14q5 6 5 12H58z'],
];
const MIRROR = 'matrix(-1 0 0 1 160 0)';

function Body({ view, sel, onPick }: { view: View; sel: string[]; onPick: (n: string, r: string) => void }) {
  const left = view === 'front' ? 'Right' : 'Left';
  const right = view === 'front' ? 'Left' : 'Right';
  const cls = (n: string) => 'bp' + (sel.includes(n) ? ' on' : '');
  return (
    <svg viewBox="0 0 160 310" className="body">
      {CENTER.map(([n, r, d, back]) => {
        const name = view === 'back' && back ? back : n;
        return <path key={n} d={d} className={cls(name)} onClick={() => onPick(name, r)} />;
      })}
      {SIDE.map(([n, r, d]) => {
        const a = `${left} ${n}`, b = `${right} ${n}`;
        return (
          <g key={n}>
            <path d={d} className={cls(a)} onClick={() => onPick(a, r)} />
            <path d={d} transform={MIRROR} className={cls(b)} onClick={() => onPick(b, r)} />
          </g>
        );
      })}
    </svg>
  );
}

/* ultrasound placeholder */
function Sonogram() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const w = 160, h = 130;
    let f = 0;
    const t = setInterval(() => {
      try {
        const img = ctx.createImageData(w, h);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const dx = (x - w / 2) / (w / 2);
            const dy = y / h;
            const fan = Math.abs(dx) < 0.12 + dy * 0.82 && dy > 0.05;
            const n = Math.sin(x * 12.9898 + y * 78.233 + f) * 43758.5453;
            const v = fan ? Math.max(6, Math.min(230, 48 + (n - Math.floor(n)) * 85 + 32 * Math.sin(y * 0.2 + Math.sin(x * 0.08) * 3))) : 3;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
            img.data[i + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        f += 0.4;
      } catch {}
    }, 90);
    return () => clearInterval(t);
  }, []);
  return <canvas ref={ref} width={160} height={130} className="sono" />;
}

function TopBar({ left, mid, onVitals, onSos }: { left: React.ReactNode; mid?: React.ReactNode; onVitals: () => void; onSos: () => void }) {
  return (
    <div className="top">
      <div className="top-l">{left}</div>
      <div className="top-m">{mid}</div>
      <button className="btn vit" onClick={onVitals}><HeartPulse size={16} /> VITALS</button>
      <button className="btn sos" onClick={onSos}><ShieldAlert size={16} /> EMERGENCY</button>
    </div>
  );
}
const Steps = ({ n }: { n: number }) => <div className="steps">{['LOCATE', 'PAIN', 'SCAN', 'RESULT'].map((s, i) => <span key={s} className={i === n ? 'cur' : i < n ? 'done' : ''}>{s}</span>)}</div>;

export default function App() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [splashFading, setSplashFading] = useState(false);
  const [back, setBack] = useState<Screen>('home');
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [user, setUser] = useState<string>(() => localStorage.getItem('astrafit_user') || '');
  const [menu, setMenu] = useState(false);
  const [pending, setPending] = useState('');
  const [tips, setTips] = useState(false);
  const [adv, setAdv] = useState<Advice>({ level: 'SELF-CARE', groups: [], steps: [] });
  const [logout, setLogout] = useState(false);
  const [scale, setScale] = useState(1);
  const [view, setView] = useState<View>('front');

  const [parts, setParts] = useState<string[]>([]);
  const [region, setRegion] = useState('');
  const [painMap, setPainMap] = useState<Record<string, string>>({});
  const [levelMap, setLevelMap] = useState<Record<string, number>>({});
  const [activePartIndex, setActivePartIndex] = useState(0);
  const [scanIndex, setScanIndex] = useState(0);

  const [hold, setHold] = useState(0);
  const [prog, setProg] = useState(0);
  const [saved, setSaved] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<string, { n: number; last: string }>>({});
  const [mod, setMod] = useState(() => localStorage.getItem('astrafit_module') || MODULES[0]);
  const [count, setCount] = useState(5);
  const [sent, setSent] = useState<{ id: number; delivered: boolean } | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const video = useRef<HTMLVideoElement>(null);
  const { vitals, orient, mode, simTilt } = useSensors();

  const canvasLRef = useRef<HTMLCanvasElement>(null);
  const canvasCRef = useRef<HTMLCanvasElement>(null);
  const earthLoaded = useRef(false);

  /* earth render loop */
  useEffect(() => {
    if (earthLoaded.current) return;
    const handle = requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          const layers = generateLayers();
          if (!layers) return;

          const ctxL = canvasLRef.current?.getContext('2d');
          if (ctxL) {
            ctxL.drawImage(layers.land, 0, 0);
            ctxL.drawImage(layers.land, WIDTH, 0);
            ctxL.drawImage(layers.land, WIDTH * 2, 0);
            ctxL.drawImage(layers.land, WIDTH * 3, 0);
          }
          const ctxC = canvasCRef.current?.getContext('2d');
          if (ctxC) {
            ctxC.drawImage(layers.clouds, 0, 0);
            ctxC.drawImage(layers.clouds, WIDTH, 0);
            ctxC.drawImage(layers.clouds, WIDTH * 2, 0);
            ctxC.drawImage(layers.clouds, WIDTH * 3, 0);
          }
          earthLoaded.current = true;
        } catch {}
      }, 60);
    });
    return () => cancelAnimationFrame(handle);
  }, []);

  const me = crew.find((c) => c.crew_id === user);
  const partsLabel = parts.join(', ');
  const currentPart = parts[activePartIndex] ?? parts[0] ?? null;
  const currentPain = currentPart ? painMap[currentPart] ?? null : null;
  const currentLevel = currentPart ? levelMap[currentPart] ?? 5 : 5;

  const activeScanPart = parts[scanIndex] ?? parts[0] ?? null;
  const T = getTargetAngle(activeScanPart);

  const dp = T.pitch - orient.pitch, dr = T.roll - orient.roll;
  const ok = Math.abs(dp) <= 3 && Math.abs(dr) <= 3;
  const near = Math.abs(dp) <= 8 && Math.abs(dr) <= 8;
  const big = Math.abs(dp) >= Math.abs(dr), d = big ? dp : dr;
  const guide = ok ? 'PERFECT · HOLD IT' : `${near ? 'ALMOST THERE · ' : ''}${big ? (d > 0 ? 'TILT UP ' : 'TILT DOWN ') : (d > 0 ? 'ROLL RIGHT ' : 'ROLL LEFT ')}${Math.round(Math.abs(d))}°`;

  useEffect(() => {
    const f = () => setScale(Math.min(innerWidth / 480, innerHeight / 320));
    f();
    addEventListener('resize', f);
    return () => removeEventListener('resize', f);
  }, []);

  useEffect(() => {
    getCrew().then(setCrew).catch(() => {});
  }, []);

  useEffect(() => {
    if (screen !== 'splash') return;
    const fadeTimer = setTimeout(() => {
      setSplashFading(true);
    }, 3500);

    const switchTimer = setTimeout(() => {
      const target = localStorage.getItem('astrafit_user')
        ? (localStorage.getItem('astrafit_user') === ADMIN ? 'admin' : 'home')
        : 'login';
      setScreen(target);
    }, 3900);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(switchTimer);
    };
  }, [screen]);

  const poll = useCallback(() => {
    getAlerts().then(setAlerts).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user || user === ADMIN) return;
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [user, poll]);

  const incoming = user && user !== ADMIN ? alerts.find((a) => a.crew_id !== user && !a.acks.includes(user)) : undefined;

  useEffect(() => {
    if (!incoming) return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const beep = () => {
      if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.15;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.25);
    };
    beep();
    const t = setInterval(beep, 1000);
    return () => {
      clearInterval(t);
      ctx?.close();
    };
  }, [incoming?.id]);

  useEffect(() => {
    if (screen === 'scan') {
      setHold(0);
      setProg(0);
      simTilt({ pitch: T.pitch + 16, roll: T.roll - 14 });
      let stream: MediaStream | null = null;
      if (video.current) {
        openCamera(video.current).then((s) => {
          stream = s;
        }).catch(() => {});
      }
      return () => stream?.getTracks().forEach((t) => t.stop());
    } else {
      setHold(0);
      setProg(0);
    }
  }, [screen, scanIndex]);

  useEffect(() => {
    if (screen !== 'scan' || prog > 0) return;
    if (!ok) {
      setHold(0);
      return;
    }
    const t = setInterval(() => setHold((h) => Math.min(2, h + 0.1)), 100);
    return () => clearInterval(t);
  }, [screen, ok, prog]);

  useEffect(() => {
    if (screen === 'scan' && hold >= 2 && prog === 0) setProg(1);
  }, [hold, screen, prog]);

  useEffect(() => {
    if (screen !== 'scan' || prog === 0) return;
    const t = setInterval(() => setProg((p) => Math.min(100, p + 3)), 90);
    return () => clearInterval(t);
  }, [screen, prog > 0]);

  useEffect(() => {
    if (screen !== 'scan' || prog < 100) return;
    if (scanIndex < parts.length - 1) {
      setScanIndex((i) => i + 1);
      setProg(0);
      setHold(0);
    } else {
      setScreen('result');
      setSaved(null);
      const painSummary = Object.entries(painMap).map(([p, d]) => `${p}: ${d}`).join(', ');
      const maxLevel = Math.max(...Object.values(levelMap), 5);
      const a = getAdvice({ part: parts, pain: painSummary, level: maxLevel, hr: vitals.hr, spo2: vitals.spo2 });
      setAdv(a);
      saveSession({
        crew_id: user,
        body_region: region,
        exact_location: partsLabel || undefined,
        pain_description: painSummary || undefined,
        pain_intensity: maxLevel,
        heart_rate: vitals.hr ?? undefined,
        spo2: vitals.spo2 ?? undefined,
        bp_sys: vitals.sys ?? undefined,
        bp_dia: vitals.dia ?? undefined,
        motion_g: vitals.g ?? undefined,
        advice: `${a.level}: ${a.steps.join(' | ')}`,
        pitch_deg: orient.pitch,
        roll_deg: orient.roll
      }).then((r) => setSaved(r.session_id)).catch(() => {});
    }
  }, [prog, screen, scanIndex, parts.length]);

  useEffect(() => {
    if (screen !== 'sos' || sent) return;
    if (count <= 0) {
      sendAlert({ crew_id: user, body_part: partsLabel || undefined, module: mod }).then(setSent);
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [screen, count, sent]);

  useEffect(() => {
    if (screen === 'sos' && sent) {
      poll();
      const t = setInterval(poll, 2000);
      return () => clearInterval(t);
    }
  }, [screen, sent, poll]);

  const login = (id: string) => {
    localStorage.setItem('astrafit_user', id);
    setUser(id);
    setMenu(false);
    setScreen(id === ADMIN ? 'admin' : 'home');
    if (id === ADMIN) loadCounts();
  };

  const pick = (id: string) => {
    setMenu(false);
    setPending(id);
    setScreen('idscan');
  };

  const doLogout = () => {
    localStorage.removeItem('astrafit_user');
    setUser('');
    setLogout(false);
    setParts([]);
    setScreen('login');
  };

  const loadCounts = () => {
    crew.forEach((c) => {
      getCrewSessions(c.crew_id).then((r) => {
        const a = r as { started_at?: string }[];
        setCounts((p) => ({
          ...p,
          [c.crew_id]: {
            n: a.length,
            last: a[0]?.started_at ? String(a[0].started_at).slice(0, 16).replace('T', ' ') : '—'
          }
        }));
      });
    });
  };

  useEffect(() => {
    if (screen === 'admin' && crew.length) loadCounts();
  }, [screen, crew.length]);

  const go = (s: Screen) => {
    if (s === 'vitals' || s === 'sos') {
      if (screen !== 'vitals' && screen !== 'sos') setBack(screen);
    }
    setScreen(s);
  };

  const openSos = () => {
    setCount(5);
    setSent(null);
    go('sos');
  };

  const mine = alerts.find((a) => a.crew_id === user);

  const newCheck = () => {
    setParts([]);
    setPainMap({});
    setLevelMap({});
    setActivePartIndex(0);
    setScanIndex(0);
    setHold(0);
    setProg(0);
    setScreen('home');
  };

  const handleBodyPick = (name: string, r: string) => {
    setRegion(r);
    setParts((prev) => {
      if (prev.includes(name)) {
        const next = prev.filter((item) => item !== name);
        setPainMap((pm) => { const copy = { ...pm }; delete copy[name]; return copy; });
        setLevelMap((lm) => { const copy = { ...lm }; delete copy[name]; return copy; });
        return next;
      }
      return [...prev, name];
    });
  };

  const chip = <button className="chip" onClick={() => setLogout(true)}><span className="av">{(me?.full_name || user || '?')[0]}</span>{me?.full_name || user}</button>;
  const bar = (l: React.ReactNode, m?: React.ReactNode) => <TopBar left={l} mid={m} onVitals={() => go('vitals')} onSos={openSos} />;
  const backBtn = (to: Screen) => <button className="chip" onClick={() => setScreen(to)}><ChevronLeft size={18} /> BACK</button>;
  const n = (v: number | null) => (v === null ? '--' : v);

  return (
    <div className="wrap">
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        {/* earth backdrop */}
        <div id="bgwrap">
          <canvas ref={canvasLRef} id="eL" className="el" width={1920} height={320} />
          <canvas ref={canvasCRef} id="eC" className="el" width={1920} height={320} />
          <div id="limb" />
          <div id="stars" />
          <div id="veil" />
        </div>

        {screen === 'splash' && (
          <div className={`splash ${splashFading ? 'fading-out' : ''}`}>
            <div className="orbit"><i /></div>
            <div className="logo">ASTRA<b>FIT</b></div>
            <small>CREW HEALTH SYSTEM</small>
          </div>
        )}

        {screen === 'login' && (
          <div className="login">
            <div className="logo sm">ASTRA<b>FIT</b></div>
            <p>WHO IS THIS?</p>
            <button className="select" onClick={() => setMenu(true)}>SELECT CREW MEMBER <ChevronDown size={20} /></button>
            <small>{isDemoMode() ? 'OFFLINE · LOCAL DATA' : 'SYSTEM ONLINE'}</small>
            {menu && (
              <div className="sheet" onClick={() => setMenu(false)}>
                <div className="list" onClick={(e) => e.stopPropagation()}>
                  {crew.map((c) => <button key={c.crew_id} onClick={() => pick(c.crew_id)}><span className="av">{c.full_name[0]}</span>{c.full_name}<em>{c.crew_id}</em></button>)}
                  <button className="adm" onClick={() => pick(ADMIN)}><span className="av">A</span>Administrator<em>ALL LOGS</em></button>
                </div>
              </div>
            )}
          </div>
        )}

        {screen === 'idscan' && <IdScan id={pending} name={crew.find((c) => c.crew_id === pending)?.full_name ?? 'ADMIN'} onOk={() => login(pending)} onCancel={() => setScreen('login')} />}

        {screen === 'admin' && (
          <>
            <div className="top"><div className="top-l">{chip}</div><div className="top-m"><b className="tag">ADMIN</b></div></div>
            <div className="admin">
              <div className="rows">
                {crew.map((c) => <div key={c.crew_id} className="row"><span className="av">{c.full_name[0]}</span><div>{c.full_name}<em>{c.crew_id}</em></div><div className="r">{counts[c.crew_id]?.n ?? 0} logs<em>{counts[c.crew_id]?.last ?? '—'}</em></div></div>)}
              </div>
              <div className="btns">
                <a className="btn big" href={excelUrl()} download><Download size={16} /> DATABASE (.XLSX)</a>
                <a className="btn big" href={reportsUrl()} target="_blank" rel="noreferrer"><Download size={16} /> ALL REPORTS (PDF)</a>
              </div>
            </div>
          </>
        )}

        {screen === 'home' && (
          <>
            {bar(chip, <Steps n={0} />)}
            <div className="home">
              <div className="figure"><Body view={view} sel={parts} onPick={handleBodyPick} /></div>
              <div className="side">
                <div className="seg"><button className={view === 'front' ? 'on' : ''} onClick={() => setView('front')}>FRONT</button><button className={view === 'back' ? 'on' : ''} onClick={() => setView('back')}>BACK</button></div>
                <small>{parts.length > 0 ? `${parts.length} SELECTED` : 'TAP WHERE IT HURTS'}</small>
                <h2>{partsLabel || 'Select body parts'}</h2>
                <button
                  className="btn go"
                  disabled={parts.length === 0}
                  onClick={() => { setActivePartIndex(0); setScanIndex(0); setScreen('pain'); }}
                >
                  CONTINUE <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        )}

        {screen === 'pain' && currentPart && (
          <>
            {bar(
              <button
                className="chip"
                onClick={() => {
                  if (activePartIndex > 0) setActivePartIndex((i) => i - 1);
                  else setScreen('home');
                }}
              >
                <ChevronLeft size={18} /> BACK
              </button>,
              <Steps n={1} />
            )}
            <div className="pain">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2>{currentPart}</h2>
                {parts.length > 1 && (
                  <small style={{ color: 'var(--bl)', fontWeight: 700 }}>
                    {activePartIndex + 1} OF {parts.length}
                  </small>
                )}
              </div>
              <small>WHAT DOES IT FEEL LIKE?</small>
              <div className="grid">
                {getPainsForArea(currentPart).map((p) => (
                  <button
                    key={p}
                    className={currentPain === p ? 'on' : ''}
                    onClick={() => setPainMap((prev) => ({ ...prev, [currentPart]: p }))}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <small>HOW STRONG? <b>{currentLevel}/10</b></small>
              <div className="lvl">
                {Array.from({ length: 10 }, (_, i) => (
                  <button
                    key={i}
                    className={i + 1 <= currentLevel ? 'on' : ''}
                    style={{ ['--k' as string]: i / 9 }}
                    onClick={() => setLevelMap((prev) => ({ ...prev, [currentPart]: i + 1 }))}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              {activePartIndex < parts.length - 1 ? (
                <button
                  className="btn go"
                  disabled={!currentPain}
                  onClick={() => setActivePartIndex((i) => i + 1)}
                >
                  NEXT: {parts[activePartIndex + 1]} <ChevronRight size={18} />
                </button>
              ) : (
                <button
                  className="btn go"
                  disabled={!currentPain}
                  onClick={() => {
                    setScanIndex(0);
                    setHold(0);
                    setProg(0);
                    setScreen('scan');
                  }}
                >
                  START SCAN <ChevronRight size={18} />
                </button>
              )}
            </div>
          </>
        )}

        {screen === 'scan' && activeScanPart && (
          <>
            {bar(backBtn('pain'), <Steps n={2} />)}
            <div className="scan">
              <div className="cam">
                <video ref={video} autoPlay muted playsInline />
                <div className="grid2" /><i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
                {prog > 0 && <div className="sweep" style={{ top: `${prog}%` }} />}
                <span className="cap">
                  {activeScanPart} {parts.length > 1 ? `(${scanIndex + 1}/${parts.length})` : ''}
                </span>
              </div>
              <div className="aim">
                <Level o={orient} T={T} ok={ok} sim={mode === 'SIMULATED'} onTilt={simTilt} />
                <div className={'msg' + (ok ? ' ok' : near ? ' near' : '')}>
                  {prog > 0 ? `SCANNING ${prog}%` : guide}
                </div>
                <div className="bar"><div style={{ width: `${prog > 0 ? prog : (hold / 2) * 100}%` }} /></div>
                {mode === 'SIMULATED' && <small>SIM · DRAG THE DOT</small>}
              </div>
            </div>
          </>
        )}

        {screen === 'result' && (
          <>
            {bar(backBtn('home'), <Steps n={3} />)}
            <div className="result">
              <div className="us">
                <div className="sono-box">
                  <Sonogram />
                </div>
                <span>ULTRASOUND · PLACEHOLDER IMAGE</span>
              </div>
              <div className="side">
                <small>SCAN COMPLETE</small>
                <h2>{partsLabel}</h2>
                <div className="result-pains">
                  {parts.map((p) => (
                    <div key={p} className="result-pain-item">
                      <b>{p}:</b> {painMap[p] ?? 'Assessed'} <u>({levelMap[p] ?? 5}/10)</u>
                    </div>
                  ))}
                </div>
                <div className={'lv ' + adv.level}>{adv.level}</div>
                <p className="st">
                  {adv.groups && adv.groups.length > 0
                    ? `${adv.groups[0].part} · ${adv.groups[0].steps[0]}`
                    : adv.steps[0]}
                </p>
                <button className="btn vit" onClick={() => setTips(true)}>RECOVERY PLAN</button>
                <p className="sv">{saved ? <><Check size={14} /> LOG #{saved} SAVED</> : 'SAVING…'}</p>
                <button className="btn go" onClick={newCheck}>DONE</button>
              </div>
            </div>
          </>
        )}

        {screen === 'vitals' && (
          <>
            {bar(backBtn(back))}
            <div className="vitals">
              <div className="tile">
                <small>HEART RATE</small>
                <div className="v-row">
                  <b>{n(vitals.hr)}<u>BPM</u></b>
                  <svg className="ecg-wave" viewBox="0 0 100 24">
                    <path d="M0 12 L30 12 L35 4 L42 22 L48 2 L54 16 L58 12 L100 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              <div className="tile">
                <small>OXYGEN · SpO₂</small>
                <div className="v-row">
                  <b>{n(vitals.spo2)}<u>%</u></b>
                  <svg className="ppg-wave" viewBox="0 0 100 24">
                    <path d="M0 18 C15 18 20 4 25 4 C30 4 33 14 38 18 C45 18 50 18 55 18 C70 18 75 4 80 4 C85 4 88 14 93 18 L100 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              <div className="tile">
                <small>BLOOD PRESSURE</small>
                <div className="v-row">
                  <b>{n(vitals.sys)}/{n(vitals.dia)}<u>mmHg</u></b>
                  <div className="bp-meter">
                    <div className="bp-bar sys"><span style={{ height: `${Math.min(100, Math.max(20, ((vitals.sys ?? 120) / 180) * 100))}%` }} /></div>
                    <div className="bp-bar dia"><span style={{ height: `${Math.min(100, Math.max(20, ((vitals.dia ?? 80) / 120) * 100))}%` }} /></div>
                  </div>
                </div>
              </div>
              <div className="tile">
                <small>MOTION · ACCEL</small>
                <div className="v-row">
                  <b>{vitals.g ?? '--'}<u>g</u></b>
                  <div className="g-meter">
                    <div className="g-axis"><span style={{ height: '45%' }} /><i>X</i></div>
                    <div className="g-axis"><span style={{ height: '70%' }} /><i>Y</i></div>
                    <div className="g-axis"><span style={{ height: `${Math.min(100, Math.max(15, (Number(vitals.g) || 0.1) * 80))}%` }} /><i>Z</i></div>
                  </div>
                </div>
              </div>
              <div className="src"><Activity size={12} /> SENSORS · {mode}</div>
            </div>
          </>
        )}

        {screen === 'sos' && (
          <div className="sosx">
            {!sent ? (
              <>
                <ShieldAlert size={34} /><h1>EMERGENCY</h1>
                <p>Alerting all crew in <b>{count}</b></p>
                <div className="mods">{MODULES.map((m) => <button key={m} className={m === mod ? 'on' : ''} onClick={() => { setMod(m); localStorage.setItem('astrafit_module', m); }}>{m}</button>)}</div>
                <button className="btn white" onClick={() => setScreen(back)}>CANCEL</button>
              </>
            ) : (
              <>
                <h1>{sent.delivered ? 'CREW ALERTED' : 'NO LINK · SAVED LOCALLY'}</h1>
                <p>{me?.full_name} · {mod}{partsLabel ? ` · ${partsLabel}` : ''}</p>
                <div className="acks">{sent.delivered ? (mine?.acks.length ? `ACKNOWLEDGED BY ${mine.acks.join(', ')}` : 'WAITING FOR CREW…') : 'NOT DELIVERED · USE VOICE / STATION ALARM'}</div>
                <button className="btn white" onClick={() => { alertAction(sent.id, 'resolve', user); setScreen(back); }}>I'M OK · CLOSE ALERT</button>
              </>
            )}
          </div>
        )}

        {incoming && (
          <div className="sosx incoming">
            <ShieldAlert size={34} /><h1>CREW EMERGENCY</h1>
            <p><b>{crew.find((c) => c.crew_id === incoming.crew_id)?.full_name ?? incoming.crew_id}</b> needs help</p>
            <div className="acks">{incoming.module ?? 'LOCATION UNKNOWN'}{incoming.body_part ? ` · ${incoming.body_part}` : ''}</div>
            <button className="btn white" onClick={() => alertAction(incoming.id, 'ack', user).then(poll)}>ACKNOWLEDGE · I'M COMING</button>
          </div>
        )}

        {tips && (
          <div className="sheet" onClick={() => setTips(false)}>
            <div className="list next-steps-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <span className={'lv ' + adv.level}>{adv.level}</span>
                <small>COUNTERMEASURE & RECOVERY PROTOCOL</small>
              </div>

              <div className="steps-scroll">
                {adv.groups && adv.groups.length > 0 ? (
                  adv.groups.map((group) => (
                    <div key={group.part} className="step-group">
                      <h3 className="group-title">{group.part}</h3>
                      {group.steps.map((s, idx) => (
                        <div key={idx} className="step-row">
                          <span className="step-num">{idx + 1}</span>
                          <p>{s}</p>
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  <p className="who">{adv.steps[0]}</p>
                )}
              </div>

              <button className="btn go close-btn" onClick={() => setTips(false)}>
                CLOSE
              </button>
            </div>
          </div>
        )}

        {logout && (
          <div className="sheet" onClick={() => setLogout(false)}>
            <div className="list" onClick={(e) => e.stopPropagation()}>
              <p className="who">{me?.full_name || 'Administrator'}</p>
              <button onClick={doLogout}><LogOut size={18} /> LOG OUT</button>
              <button onClick={() => setLogout(false)}>CANCEL</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Level({ o, T, ok, sim, onTilt }: { o: { pitch: number; roll: number }; T: { pitch: number; roll: number }; ok: boolean; sim: boolean; onTilt: (v: { pitch: number; roll: number }) => void }) {
  const S = 2, R = 44;
  const x = Math.max(-R, Math.min(R, (o.roll - T.roll) * S)), y = Math.max(-R, Math.min(R, (o.pitch - T.pitch) * S));
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sim || (e.type === 'pointermove' && e.buttons === 0)) return;
    const r = e.currentTarget.getBoundingClientRect(), k = r.width / 100;
    const dx = (e.clientX - r.left - r.width / 2) / k, dy = (e.clientY - r.top - r.height / 2) / k;
    onTilt({ roll: T.roll + dx / S, pitch: T.pitch + dy / S });
  };
  return (
    <div className={'level' + (ok ? ' ok' : '')} onPointerDown={drag} onPointerMove={drag}>
      <i className="h" /><i className="v" /><i className="ring" />
      <i className="dot" style={{ transform: `translate(${x}px,${y}px)` }} />
    </div>
  );
}