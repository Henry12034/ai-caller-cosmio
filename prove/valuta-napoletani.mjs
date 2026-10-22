// Prima scrematura dei candidati napoletani: un modello audio dà un voto a accento, naturalezza
// e carattere. Solo un'indicazione: si decide a orecchio. Uso: node prove/valuta-napoletani.mjs [v3]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RADICE } from '../src/config.mjs';

const v3 = process.argv[2] === 'v3';
const file = (v3 ? [
  ...[1, 2, 3].map((n) => ['v2-disegnate', `Napoletano-verace-${n} (v3)`]),
  ...[1, 2, 3].map((n) => ['v2-disegnate', `Napoletano-ruspante-${n} (v3)`]),
  ['v2', 'Eddy-napoletano (v3)'], ['v2', 'Raf-napoletano (v3)'],
] : null) || [
  ...[1, 2, 3].map((n) => ['v2-disegnate', `Napoletano-verace-${n}`]),
  ...[1, 2, 3].map((n) => ['v2-disegnate', `Napoletano-ruspante-${n}`]),
  ['v2', 'Eddy-napoletano'], ['v2', 'Raf-napoletano'], ['v2', 'Rita-napoletana'],
];
const domanda = `Ascolta questo audio in qualità telefono: una persona risponde al telefono di un'officina meccanica.
Valuta da 0 a 10: (a) quanto è marcato l'accento napoletano (0 = nessun accento napoletano, 10 = napoletano verace fortissimo); (b) naturalezza, cioè quanto sembra una persona vera e non una voce sintetica; (c) carattere, cioè quanto è una voce particolare e riconoscibile invece che da speaker professionale. Stima l'età e segnala difetti udibili.
Rispondi solo con JSON: {"accento_napoletano":n,"naturalezza":n,"carattere":n,"eta":n,"difetti":"..."}`;

for (const [cartella, nome] of file) {
  const audio = readFileSync(join(RADICE, 'campioni', cartella, `${nome}.mp3`)).toString('base64');
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
  console.log(`${nome.padEnd(22)} ${(j.choices?.[0]?.message?.content || JSON.stringify(j.error)).replace(/\s+/g, ' ')}`);
}
