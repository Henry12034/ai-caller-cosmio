// Voci predefinite ElevenLabs (le uniche del piano gratuito) che parlano italiano con Eleven v4 Turbo.
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { CONFIG, RADICE } from '../src/config.mjs';

const cartella = join(RADICE, 'campioni', 'v2-predefinite');
mkdirSync(cartella, { recursive: true });
const voci = [['Chris', 'iP95p4xoKVk53GoZ742B'], ['Eric', 'cjVigY5qzO86Huf0OWal'], ['River', 'SAz9YHcvj6GT2YYXdXww']];
const testo = "Officina Marchetti, buongiorno! Sono Luca, mi dica. ... Eh, allora guardi, siamo pienissimi... l'unico giorno che ho è martedì: alle nove, alle undici e mezza, o alle due. ... Tagliando, pastiglie, spia del motore, clima e pure i liquidi? [laughs] Ah, quindi praticamente una macchina nuova!";
for (const [nome, id] of voci) {
  const t = Date.now();
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=ulaw_8000`, {
    method: 'POST',
    headers: { 'xi-api-key': CONFIG.elevenKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: testo, model_id: 'eleven_v4_turbo', language_code: 'it', voice_settings: { stability: 0.45, similarity_boost: 0.8 } }),
  });
  if (!r.ok) { console.log(nome, 'ERRORE', r.status, (await r.text()).slice(0, 200)); continue; }
  const audio = Buffer.from(await r.arrayBuffer());
  const grezzo = join(cartella, `${nome}.ulaw`);
  writeFileSync(grezzo, audio);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', grezzo, '-b:a', '64k', join(cartella, `predefinita-${nome}.mp3`)]);
  unlinkSync(grezzo);
  console.log(`predefinita-${nome}.mp3 (${(audio.length / 8000).toFixed(1)} s, ${Date.now() - t} ms, regione ${r.headers.get('x-region') || '?'})`);
}
