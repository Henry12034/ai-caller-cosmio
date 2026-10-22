// Stessa battuta, ma con Eleven v3 Conversational (il v3 degli agenti) invece di v4 Turbo:
// per sentire se v4 attenua l'accento regionale.
// Uso: node prove/campioni-v3.mjs
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { CONFIG, RADICE } from '../src/config.mjs';

const disegnate = JSON.parse(readFileSync(join(RADICE, 'campioni', 'v2-disegnate', 'voci.json'), 'utf8'));
const voci = [...Object.entries(disegnate).map(([n, id]) => ['v2-disegnate', n, id]),
  ['v2', 'Eddy-napoletano', '9EBC4nR8Ez9R9MFRcOx1'], ['v2', 'Raf-napoletano', '6HCIm4JAL5AF0sSi7qZd']];
const battuta = "Officina Marchetti, buongiorno! Sono Luca, mi dica. ... Eh, allora guardi, siamo pienissimi... l'unico giorno che ho è martedì: alle nove, alle undici e mezza, o alle due. ... Tagliando, pastiglie, spia del motore, clima e pure i liquidi? [laughs] Ah, quindi praticamente una macchina nuova!";
for (const [cartella, nome, id] of voci) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=ulaw_8000`, {
    method: 'POST',
    headers: { 'xi-api-key': CONFIG.elevenKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: battuta, model_id: 'eleven_v3_conversational', language_code: 'it' }),
  });
  if (!r.ok) { console.log(nome, 'ERRORE', r.status, (await r.text()).slice(0, 200)); continue; }
  const file = join(RADICE, 'campioni', cartella, `${nome} (v3).mp3`);
  const grezzo = file.replace(/\.mp3$/, '.ulaw');
  writeFileSync(grezzo, Buffer.from(await r.arrayBuffer()));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', grezzo, '-b:a', '64k', file]);
  unlinkSync(grezzo);
  console.log(`${nome} (v3).mp3`);
}
