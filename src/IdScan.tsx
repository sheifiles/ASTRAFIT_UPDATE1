import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { ChevronLeft } from 'lucide-react';
import { openCamera } from './camera';

// ---- FACE ID PLACEHOLDER -------------------------------------------------------
// Put face recognition here later. Return the crew_id it recognises, or null.
// export async function identifyFace(video: HTMLVideoElement): Promise<string | null> { ... }
// -----------------------------------------------------------------------------------

// Badge = barcode or QR code whose text is the crew_id (CM-001 ... CM-006, ADMIN).
export default function IdScan({ id, name, onOk, onCancel }: { id: string; name: string; onOk: () => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState('STARTING CAMERA…');
  const [bad, setBad] = useState(false);

  useEffect(() => {
    let stop = false;
    let stream: MediaStream | null = null;
    let controls: { stop: () => void } | null = null;
    (async () => {
      if (!video.current) return;
      stream = await openCamera(video.current);
      if (!stream) { setMsg('NO CAMERA FOUND'); setBad(true); return; }
      setMsg('SHOW YOUR CREW BADGE');
      controls = await new BrowserMultiFormatReader().decodeFromStream(stream, video.current, (r) => {
        if (stop || !r) return;
        if (r.getText().trim().toUpperCase() === id.toUpperCase()) { stop = true; setBad(false); setMsg('VERIFIED'); setTimeout(onOk, 500); }
        else { setBad(true); setMsg('BADGE DOES NOT MATCH'); }
      });
    })();
    return () => { stop = true; controls?.stop(); stream?.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="top"><div className="top-l"><button className="chip" onClick={onCancel}><ChevronLeft size={18} /> BACK</button></div><div className="top-m"><b className="tag">VERIFY · {name}</b></div></div>
      <div className="idv">
        <video ref={video} autoPlay muted playsInline />
        <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
        <button className="skip" onClick={onOk}>SKIP</button>
        <span className={'idm' + (bad ? ' bad' : '')}>{msg}</span>
      </div>
    </>
  );
}
