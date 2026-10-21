// Misura quanto ci mette ogni modello realtime a cominciare a rispondere (primo audio),
// a parità di tutto: stesse istruzioni, stessa frase del cliente, turno chiuso a mano.
// Uso: node prove/ttfa.mjs [modello ...]
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/config.mjs';
import { istruzioni, strumenti } from '../src/persona.mjs';

const qui = dirname(fileURLToPath(import.meta.url));
const modelli = process.argv.slice(2).length ? process.argv.slice(2) : ['gpt-realtime-2.1', 'gpt-realtime-2.1-mini', 'gpt-realtime-2', 'gpt-realtime-1.5', 'gpt-realtime', 'gpt-realtime-mini'];
const frase = readFileSync(join(qui, 'audio-cliente', 'base', '1.ulaw'));
const RIPETIZIONI = 3;

function prova(modello, extra = {}) {
  return new Promise((ok) => {
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${modello}`, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
    const tempi = [];
    let t, n = 0, tPing;
    const rtt = [];
    const giro = () => {
      if (n >= RIPETIZIONI) { ws.close(); return ok({ modello, tempi, rtt }); }
      n++;
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: frase.toString('base64') }));
      ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      t = Date.now();
      ws.send(JSON.stringify({ type: 'response.create' }));
    };
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'session.update', session: {
        type: 'realtime', model: modello, output_modalities: ['audio'], instructions: istruzioni(), tools: strumenti(),
        audio: { input: { format: { type: 'audio/pcmu' }, turn_detection: null }, output: { format: { type: 'audio/pcmu' }, voice: 'cedar' } },
        ...extra,
      } }));
      tPing = Date.now();
    });
    let primo = true;
    ws.on('message', (d) => {
      const e = JSON.parse(d);
      if (e.type === 'session.updated') { rtt.push(Date.now() - tPing); giro(); }
      else if ((e.type === 'response.output_audio.delta') && primo) { tempi.push(Date.now() - t); primo = false; }
      else if (e.type === 'response.done') {
        primo = true;
        // svuota la conversazione per ripartire sempre dallo stesso punto
        ws.send(JSON.stringify({ type: 'conversation.item.delete', item_id: e.response.output?.[0]?.id }));
        setTimeout(giro, 300);
      } else if (e.type === 'error') { console.log(modello, 'errore', e.error.message); }
    });
    ws.on('error', (e) => ok({ modello, errore: e.message }));
  });
}

for (const m of modelli) {
  const r = await prova(m);
  const med = r.tempi?.length ? [...r.tempi].sort((a, b) => a - b)[Math.floor(r.tempi.length / 2)] : null;
  console.log(`${m.padEnd(24)} primo audio: ${r.tempi?.join(', ')} ms (mediana ${med})  · session.update→updated ${r.rtt?.join(',')} ms ${r.errore || ''}`);
}
