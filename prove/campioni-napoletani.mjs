// La scena "napoletanizzata": stesse voci napoletane, ma con parole e modi di dire da napoletano
// verace, perché il carattere passa anche da come si parla, non solo dal timbro.
// Uso: node prove/campioni-napoletani.mjs [modello]   (predefinito eleven_v4_turbo, come l'agente)
import { writeFileSync, unlinkSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { CONFIG, RADICE } from '../src/config.mjs';

const modello = process.argv[2] || 'eleven_v4_turbo';
const cartella = join(RADICE, 'campioni', 'v2-napoletani');
mkdirSync(cartella, { recursive: true });
const disegnate = JSON.parse(readFileSync(join(RADICE, 'campioni', 'v2-disegnate', 'voci.json'), 'utf8'));
const voci = [...Object.entries(disegnate), ['Eddy-napoletano', '9EBC4nR8Ez9R9MFRcOx1'], ['Raf-napoletano', '6HCIm4JAL5AF0sSi7qZd']];
const battuta = "Uè, buongiorno! Officina Marchetti, so' Gennaro, mi dica. ... Eh, guardi, qua stiamo pieni pieni, non ce sta proprio posto... l'unico giorno che tengo è martedì: alle nove, alle undici e mezza, o alle due. ... Tagliando, pastiglie, spia del motore, clima e pure i liquidi? [laughs] Mamma mia, ma allora è 'na macchina nuova!";

for (const [nome, id] of voci) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=ulaw_8000`, {
    method: 'POST',
    headers: { 'xi-api-key': CONFIG.elevenKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: battuta, model_id: modello, language_code: 'it', voice_settings: { stability: 0.4, similarity_boost: 0.85 } }),
  });
  if (!r.ok) { console.log(nome, 'ERRORE', r.status, (await r.text()).slice(0, 200)); continue; }
  const file = join(cartella, `${nome}${modello === 'eleven_v4_turbo' ? '' : ` (${modello})`}.mp3`);
  const grezzo = file.replace(/\.mp3$/, '.ulaw');
  writeFileSync(grezzo, Buffer.from(await r.arrayBuffer()));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', grezzo, '-b:a', '64k', file]);
  unlinkSync(grezzo);
  console.log(file.split(/[\\/]/).pop());
}
