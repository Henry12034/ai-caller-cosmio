// Quanto ci mette ogni voce ElevenLabs a far arrivare il primo pezzo di audio in streaming
// (il ritardo che si aggiunge a ogni risposta al telefono). Uso: node prove/ttfb-voci.mjs
import { CONFIG } from '../src/config.mjs';
import { VOCI } from './voci-v2.mjs';

const tutte = [...VOCI, ['uomo', 'Chris-predefinita', 'iP95p4xoKVk53GoZ742B']];
const frasi = ['Perfetto, le nove allora. E a che nome la segno?', 'Ah, bella macchina. E cosa c\'è da fare?'];
for (const [, nome, id] of tutte) {
  const tempi = [];
  for (const testo of frasi) {
    const t = Date.now();
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}/stream?output_format=ulaw_8000`, {
      method: 'POST',
      headers: { 'xi-api-key': CONFIG.elevenKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testo, model_id: 'eleven_v4_turbo', language_code: 'it' }),
    });
    if (!r.ok) { tempi.push(`errore ${r.status}`); continue; }
    const lettore = r.body.getReader();
    await lettore.read();
    tempi.push(Date.now() - t);
    while (!(await lettore.read()).done);
  }
  console.log(`${nome.padEnd(24)} primo audio: ${tempi.join(', ')} ms`);
}
