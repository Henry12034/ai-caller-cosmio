// Prima scrematura delle voci: un modello audio ascolta ogni campione e dà un voto.
// È solo un'indicazione, la scelta finale si fa a orecchio. Uso: node prove/valuta-voci.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RADICE } from '../src/config.mjs';
import { VOCI as TUTTE, VOCI_MATURE } from './voci-v2.mjs';

// 'mature' = le voci mature più Vittorio come riferimento
const VOCI = process.argv[2] === 'mature' ? [...VOCI_MATURE, TUTTE.find((v) => v[1].startsWith('Vittorio'))] : TUTTE;

const domanda = `Sei un direttore del doppiaggio italiano. Ascolta questo audio in qualità telefono: è un receptionist di un'officina meccanica che risponde al telefono.
Valuta da 1 a 10: (a) naturalezza, cioè quanto sembra una persona vera e non una voce sintetica; (b) accento italiano madrelingua (10 = italiano nativo, anche con un accento regionale); (c) adatta a un banco accettazione di un'officina, cordiale e alla mano.
Indica anche eventuali difetti udibili (pronuncia sbagliata, artefatti metallici, ritmo innaturale, risata finta).
Stima anche l'età di chi parla in anni.
Rispondi solo con JSON: {"eta_percepita":n,"naturalezza":n,"accento":n,"adatta":n,"difetti":"..."}`;

for (const [genere, nome] of VOCI) {
  const audio = readFileSync(join(RADICE, 'campioni', 'v2', `${nome}.mp3`)).toString('base64');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-audio-1.5',
      modalities: ['text'],
      messages: [{ role: 'user', content: [{ type: 'text', text: domanda }, { type: 'input_audio', input_audio: { data: audio, format: 'mp3' } }] }],
    }),
  });
  const j = await r.json();
  const testo = j.choices?.[0]?.message?.content || JSON.stringify(j.error || j).slice(0, 200);
  console.log(`${genere.padEnd(6)} ${nome.padEnd(24)} ${testo.replace(/\s+/g, ' ')}`);
}
