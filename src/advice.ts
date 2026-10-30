/* types */
export interface AdviceGroup {
  part: string;
  steps: string[];
}

export interface Advice {
  level: 'SELF-CARE' | 'MONITOR' | 'URGENT';
  groups: AdviceGroup[];
  steps: string[];
}

interface AdviceParams {
  part?: string | string[] | null;
  pain?: string | null;
  level?: number;
  hr?: number | null;
  spo2?: number | null;
}

/* recovery protocols */
function getStepsForPart(name: string): string[] {
  const p = name.toLowerCase().trim();

  if (p === 'head') {
    return [
      'POSITION: Maintain neutral head elevation; avoid prolonged inverted or head-down translation.',
      'ENVIRONMENT: Verify sleep berth airflow velocity and cabin CO2 levels (<2.5 mmHg).',
      'PROTOCOL: Downlink retinal and optic telemetry to Flight Surgeon for SANS review.'
    ];
  }
  if (p === 'neck') {
    return [
      'IMMOBILIZATION: Relax cervical spine and loosen sleep station head restraint tethers.',
      'THERAPY: Apply warm thermal compress from station medical pack for 15 minutes.',
      'RESTRICTION: Pause rapid head rotational maneuvers during module translation.'
    ];
  }
  if (p === 'chest') {
    return [
      'EXERCISE HOLD: Immediate pause on high-resistance ARED and high-intensity CEVIS cycling.',
      'VITALS: Continuous SpO2 and 3-lead ECG monitoring for the next 4 hours.',
      'TELEMETRY: Log thoracic discomfort in crew health portal and notify ground medical.'
    ];
  }
  if (p === 'upper back') {
    return [
      'COUNTERMEASURE: Perform gentle spinal decompression hugs in neutral body posture.',
      'THERAPY: Apply warm thermal pack along paraspinal muscles to break zero-g spasm.',
      'HABITATION: Recalibrate sleeping bag harness tension to eliminate spinal traction.'
    ];
  }
  if (p === 'abdomen') {
    return [
      'NUTRITION: Switch to oral rehydration electrolyte pouch and avoid high-sodium rations.',
      'POSITION: Adopt passive fetal tuck to relieve intra-abdominal wall pressure.',
      'MONITOR: Track abdominal rigidity and log vitals hourly if nausea persists.'
    ];
  }
  if (p === 'lower back') {
    return [
      'DECOMPRESSION: Assume neutral body posture (knees to chest) to counter microgravity spinal elongation.',
      'EXERCISE: Withhold ARED deadlifts and barbell squats until clearance.',
      'SUPPORT: Secure lumbar elastic stabilization belt during station translation.'
    ];
  }
  if (p.includes('shoulder')) {
    return [
      `RESTRICTION: Suspend ARED overhead pressing and heavy handrail pulling with ${name}.`,
      'THERAPY: Apply cold pack from medical pack for 10 minutes to reduce acute inflammation.',
      'EXERCISE: Switch to lower-body countermeasure routines (CEVIS) to maintain daily target.'
    ];
  }
  if (p.includes('upper arm') || p.includes('forearm')) {
    return [
      `COMPRESSION: Apply elastic compression wrap from station kit along ${name}.`,
      'MOBILITY: Use opposite limb for translation grip along corridor handrails.',
      'MONITOR: Check distal capillary refill and finger sensation every 2 hours.'
    ];
  }
  if (p.includes('elbow') || p.includes('hand')) {
    return [
      `SPLINT: Secure ${name} in functional neutral splint to alleviate EVA glove overuse tension.`,
      'THERAPY: Perform gentle passive tendon glides; avoid power-grip tools.',
      'REST: Alternate tether clipping tasks to the non-affected side.'
    ];
  }
  if (p.includes('thigh') || p.includes('calf')) {
    return [
      `GARMENT: Don station lower-body compression sleeve on ${name} to support venous return.`,
      'EXERCISE: Perform passive ankle pumps hourly to prevent venous blood pooling.',
      'MONITOR: Inspect for unilateral warmth, swelling, or localized tenderness.'
    ];
  }
  if (p.includes('knee') || p.includes('ankle') || p.includes('foot')) {
    return [
      `UNLOAD: Avoid locking into foot restraints or using T2 treadmill bungee cords.`,
      'SUPPORT: Apply supportive neoprene joint sleeve from station medical kit.',
      'REST: Keep limb floating in zero-g neutral posture to allow joint effusion to resorb.'
    ];
  }

  return [
    `REST: Minimize physical stress on ${name} during daily translation tasks.`,
    'THERAPY: Use localized hot/cold packs according to comfort.',
    'LOG: Downlink scan data and update daily medical status log for ground review.'
  ];
}

/* triage logic */
export function getAdvice({ part, pain, level = 5, hr, spo2 }: AdviceParams): Advice {
  let urgency: 'SELF-CARE' | 'MONITOR' | 'URGENT' = 'SELF-CARE';

  const isSevereCritical = (hr && (hr > 125 || hr < 45)) || (spo2 && spo2 < 92);
  const isHighPain = level >= 8 || String(pain).includes('Burning') || String(pain).includes('Pressure');

  if (isSevereCritical || (level >= 9 && String(pain).includes('Pressure'))) {
    urgency = 'URGENT';
  } else if (level >= 6 || isHighPain) {
    urgency = 'MONITOR';
  }

  const partsList: string[] = Array.isArray(part) ? part : part ? [part] : [];

  if (partsList.length === 0) {
    return {
      level: urgency,
      groups: [],
      steps: ['Select a crew member body region to initiate guided countermeasure protocol.']
    };
  }

  const groups: AdviceGroup[] = partsList.map((p) => ({
    part: p,
    steps: getStepsForPart(p)
  }));

  const flatSteps = groups.flatMap((g) => g.steps);

  return {
    level: urgency,
    groups,
    steps: flatSteps
  };
}