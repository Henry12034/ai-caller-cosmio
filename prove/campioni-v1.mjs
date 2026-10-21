// Campioni delle voci OpenAI (versione 1) in qualità telefono, per sceglierle a orecchio.
// Uso: node prove/campioni-v1.mjs  → file in campioni/v1/
import WebSocket from 'ws';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { RADICE } from '../src/config.mjs';

const cartella = join(RADICE, 'campioni', 'v1');
mkdirSync(cartella, { recursive: true });

const femminili = new Set(['marin', 'coral', 'shimmer', 'sage']);
const prove = [
  ['gpt-realtime', 'cedar'], ['gpt-realtime', 'marin'], ['gpt-realtime', 'ash'], ['gpt-realtime', 'coral'],
  ['gpt-realtime-1.5', 'cedar'], ['gpt-realtime-1.5', 'marin'],
  ['gpt-realtime-2.1', 'cedar'], ['gpt-realtime-2.1', 'marin'],
];

function frase(voce) {
  const nome = femminili.has(voce) ? 'Giulia' : 'Luca';
  return `Officina Marchetti, buongiorno! Sono ${nome}, mi dica. ... Eh, allora, guardi, siamo pienissimi: l'unico giorno che ho è martedì. Alle nove, alle undici e mezza, oppure alle due del pomeriggio. Le va bene uno di questi?`;
}

function campione(modello, voce) {
  return new Promise((ok, ko) => {
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${modello}`, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
    const pezzi = [];
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'session.update', session: {
        type: 'realtime', model: modello, output_modalities: ['audio'],
        ...(modello.startsWith('gpt-realtime-2') ? { reasoning: { effort: 'minimal' } } : {}),
        instructions: "Sei un receptionist italiano madrelingua al telefono di un'officina. Parla solo in italiano, con accento italiano nativo e naturale, tono cordiale e sciolto, ritmo da telefonata vera.",
        audio: { output: { format: { type: 'audio/pcmu' }, voice: voce } },
      } }));
      ws.send(JSON.stringify({ type: 'response.create', response: { instructions: `Di' esattamente queste parole, con naturalezza, come al telefono: "${frase(voce)}"` } }));
    });
    ws.on('message', (d) => {
      const e = JSON.parse(d);
      if (e.type === 'response.output_audio.delta') pezzi.push(Buffer.from(e.delta, 'base64'));
      if (e.type === 'response.done') { ws.close(); ok(Buffer.concat(pezzi)); }
      if (e.type === 'error') { ws.close(); ko(new Error(e.error.message)); }
    });
    ws.on('error', ko);
  });
}

for (const [modello, voce] of prove) {
  const audio = await campione(modello, voce);
  const grezzo = join(cartella, `${modello}-${voce}.ulaw`);
  writeFileSync(grezzo, audio);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', grezzo, '-b:a', '64k', join(cartella, `${modello}-${voce}.mp3`)]);
  execFileSync('cmd', ['/c', 'del', grezzo.replace(/\//g, '\\')]);
  console.log(`${modello}-${voce}.mp3  (${(audio.length / 8000).toFixed(1)} s)`);
}
