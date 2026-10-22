// Crea da zero una voce "con carattere" (Voice Design di ElevenLabs) partendo da una descrizione,
// la salva tra le voci dell'account e la fa parlare con Eleven v4 Turbo in qualità telefono,
// cioè esattamente come suonerebbe nell'agente della versione 2.
// Uso: node prove/disegna-voce.mjs <etichetta> "<descrizione in inglese>"
import { mkdirSync, writeFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { CONFIG, RADICE } from '../src/config.mjs';

const [etichetta, descrizione] = process.argv.slice(2);
if (!etichetta || !descrizione) throw new Error('Uso: node prove/disegna-voce.mjs <etichetta> "<descrizione>"');
const cartella = join(RADICE, 'campioni', 'v2-disegnate');
mkdirSync(cartella, { recursive: true });
const h = { 'xi-api-key': CONFIG.elevenKey, 'Content-Type': 'application/json' };
const battuta = "Officina Marchetti, buongiorno! Sono Luca, mi dica. ... Eh, allora guardi, siamo pienissimi... l'unico giorno che ho è martedì: alle nove, alle undici e mezza, o alle due. ... Tagliando, pastiglie, spia del motore, clima e pure i liquidi? [laughs] Ah, quindi praticamente una macchina nuova!";

function mp3DaUlaw(ulaw, file) {
  const grezzo = file.replace(/\.mp3$/, '.ulaw');
  writeFileSync(grezzo, ulaw);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', grezzo, '-b:a', '64k', file]);
  unlinkSync(grezzo);
}

// 1. tre proposte dalla descrizione
const r = await fetch('https://api.elevenlabs.io/v1/text-to-voice/design?output_format=ulaw_8000', {
  method: 'POST',
  headers: h,
  body: JSON.stringify({
    voice_description: descrizione,
    model_id: 'eleven_ttv_v3',
    text: battuta.replace(' [laughs]', ''),
    guidance_scale: 3, // descrizione lunga e dettagliata: meno vincolo, voce meno artificiale
  }),
});
if (!r.ok) throw new Error(`design ${r.status}: ${(await r.text()).slice(0, 400)}`);
const { previews } = await r.json();

const fileVoci = join(cartella, 'voci.json');
const create = existsSync(fileVoci) ? JSON.parse(readFileSync(fileVoci, 'utf8')) : {};
for (const [i, p] of previews.entries()) {
  const nome = `${etichetta}-${i + 1}`;
  // 2. la proposta diventa una voce dell'account (serve per usarla con v4 Turbo e nell'agente)
  const c = await fetch('https://api.elevenlabs.io/v1/text-to-voice', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ voice_name: `Centralino ${nome}`, voice_description: descrizione.slice(0, 500), generated_voice_id: p.generated_voice_id }),
  });
  if (!c.ok) { console.log(`${nome}: creazione fallita ${c.status} ${(await c.text()).slice(0, 200)}`); continue; }
  const { voice_id } = await c.json();
  create[nome] = voice_id;
  // 3. la stessa battuta delle altre voci, con Eleven v4 Turbo come nell'agente
  const t = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}?output_format=ulaw_8000`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ text: battuta, model_id: CONFIG.v2.modelloVoce, language_code: 'it', voice_settings: { stability: 0.45, similarity_boost: 0.8 } }),
  });
  if (!t.ok) { console.log(`${nome}: sintesi fallita ${t.status} ${(await t.text()).slice(0, 200)}`); continue; }
  mp3DaUlaw(Buffer.from(await t.arrayBuffer()), join(cartella, `${nome}.mp3`));
  console.log(`${nome}.mp3  voice_id ${voice_id}`);
}
writeFileSync(fileVoci, JSON.stringify(create, null, 2));
