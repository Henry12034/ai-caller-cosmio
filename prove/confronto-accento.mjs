// Le stesse frasi di metà telefonata del personaggio napoletano con modelli e impostazioni diverse,
// per sentire quale tiene di più l'accento. Uso: node prove/confronto-accento.mjs → campioni/accento/
// (la voce è quella in V2_VOCE)
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { CONFIG, RADICE } from '../src/config.mjs';

const cartella = join(RADICE, 'campioni', 'accento');
mkdirSync(cartella, { recursive: true });
const voce = CONFIG.v2.voce;
if (!voce) throw new Error('Manca V2_VOCE nel file .env');
// frasi prese dalla telefonata di prova, più una quasi neutra (lì l'accento rischia di sparire)
const testo = "Jamme, allora martedì ventisette alle nove, perfetto! E a che nome ve lo segno? ... Va buono, ve lo segno. E mo' che macchina tenete? Marca, modello e anno. ... Allora, ricapitoliamo: 'o tagliando, le pastiglie davanti, 'a spia d''o motore e 'o clima. È tutto ccà? ... Il prezzo non ve lo so dire al telefono, ve lo dicono i ragazzi quando vedono la macchina.";
const prove = [
  ['1 - v4 Turbo come ora', 'eleven_v4_turbo', { stability: 0.45, similarity_boost: 0.8 }],
  ['2 - v4 Turbo piu fedele alla voce', 'eleven_v4_turbo', { stability: 0.45, similarity_boost: 1.0 }],
  ['3 - v3 conversazionale (+0,2 s di ritardo)', 'eleven_v3_conversational', null],
];
for (const [nome, modello, impostazioni] of prove) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voce}?output_format=ulaw_8000`, {
    method: 'POST',
    headers: { 'xi-api-key': CONFIG.elevenKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: testo, model_id: modello, language_code: 'it', ...(impostazioni ? { voice_settings: impostazioni } : {}) }),
  });
  if (!r.ok) { console.log(nome, 'ERRORE', r.status, (await r.text()).slice(0, 200)); continue; }
  const file = join(cartella, `Gennaro ${nome}.mp3`);
  const grezzo = file.replace(/\.mp3$/, '.ulaw');
  writeFileSync(grezzo, Buffer.from(await r.arrayBuffer()));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', grezzo, '-b:a', '64k', file]);
  unlinkSync(grezzo);
  console.log(file.split(/[\/]/).pop());
}
