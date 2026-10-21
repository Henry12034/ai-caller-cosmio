// Campioni delle voci italiane ElevenLabs (versione 2) in qualità telefono, per sceglierle a orecchio.
// Uso: node prove/campioni-v2.mjs  → file in campioni/v2/
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { CONFIG, RADICE } from '../src/config.mjs';
import { VOCI as TUTTE, VOCI_MATURE } from './voci-v2.mjs';

const cartella = join(RADICE, 'campioni', 'v2');
mkdirSync(cartella, { recursive: true });

const testo = (genere) => `Officina Marchetti, buongiorno! Sono ${genere === 'uomo' ? 'Luca' : 'Giulia'}, mi dica. ... Eh, allora guardi, siamo pienissimi... l'unico giorno che ho è martedì: alle nove, alle undici e mezza, o alle due. ... Tagliando, pastiglie, spia del motore, clima e pure i liquidi? [laughs] Ah, quindi praticamente una macchina nuova!`;

const VOCI = process.argv[2] === 'mature' ? VOCI_MATURE : TUTTE;
const solo = process.argv[2] === 'mature' ? process.argv[3] : process.argv[2];
for (const [genere, nome, id] of VOCI) {
  if (solo && !nome.toLowerCase().startsWith(solo.toLowerCase())) continue;
  const mp3 = join(cartella, `${nome}.mp3`);
  if (existsSync(mp3)) continue;
  const t = Date.now();
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=ulaw_8000`, {
    method: 'POST',
    headers: { 'xi-api-key': CONFIG.elevenKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: testo(genere), model_id: CONFIG.v2.modelloVoce, language_code: 'it', voice_settings: { stability: 0.45, similarity_boost: 0.8 } }),
  });
  if (!r.ok) { console.log(`${nome}: ERRORE ${r.status} ${(await r.text()).slice(0, 300)}`); continue; }
  const audio = Buffer.from(await r.arrayBuffer());
  const grezzo = join(cartella, `${nome}.ulaw`);
  writeFileSync(grezzo, audio);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', grezzo, '-b:a', '64k', mp3]);
  unlinkSync(grezzo);
  console.log(`${nome}.mp3  (${(audio.length / 8000).toFixed(1)} s, generato in ${Date.now() - t} ms, regione ${r.headers.get('x-region') || '?'})`);
}
