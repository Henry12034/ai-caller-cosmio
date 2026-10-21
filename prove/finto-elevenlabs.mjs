// Come finto-twilio.mjs, ma parla direttamente con l'agente ElevenLabs della versione 2
// (stesso audio telefonico μ-law 8 kHz che usa Twilio): misura i ritardi e salva la registrazione.
// Uso: node prove/finto-elevenlabs.mjs [etichetta] [copione: base | scorbutico | disordine]
import WebSocket from 'ws';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPIONI } from './copione.mjs';
import { CONFIG } from '../src/config.mjs';
import { idAgente, variabiliDinamiche } from '../src/v2-elevenlabs.mjs';

const qui = dirname(fileURLToPath(import.meta.url));
const etichetta = process.argv[2] || 'v2';
const nomeCopione = process.argv[3] || 'base';
const COPIONE = COPIONI[nomeCopione];
const FRAME = 160; // 20 ms di μ-law a 8 kHz
const SILENZIO = 0xff;
const PAUSA_UMANA_MS = 350;
const FINE_TURNO_MS = 1100;

const battute = COPIONE.map((_, i) => readFileSync(join(qui, 'audio-cliente', nomeCopione, `${i + 1}.ulaw`)));
const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${idAgente()}`, { headers: { 'xi-api-key': CONFIG.elevenKey } });
if (!r.ok) { console.error('signed url:', r.status, await r.text()); process.exit(1); }
const { signed_url: url } = await r.json();
const ws = new WebSocket(url);

let coda = Buffer.alloc(0);
const sinistra = [];
const destra = [];
let battuta = -1;
let posizione = 0;
let stato = 'ascolta';
let ultimoAudioMs = 0;
let haParlato = false;
const misure = [];
let primoAudioDopo = null;
let salutoMs = null;
const t0 = Date.now();
const ora = () => Date.now() - t0;
let tick = 0;
let chiuso = false;
const log = (...a) => console.log(`[${(ora() / 1000).toFixed(2)}s]`, ...a);
const invia = (o) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); };

ws.on('open', () => {
  invia({ type: 'conversation_initiation_client_data', dynamic_variables: variabiliDinamiche('+390000000000') });
  log('connesso all\'agente', idAgente());
  avanti();
});

ws.on('message', (dati) => {
  const m = JSON.parse(dati);
  switch (m.type) {
    case 'conversation_initiation_metadata': {
      const e = m.conversation_initiation_metadata_event;
      log('conversazione', e.conversation_id, 'formati', e.agent_output_audio_format, '/', e.user_input_audio_format);
      break;
    }
    case 'audio': {
      const audio = Buffer.from(m.audio_event.audio_base_64, 'base64');
      if (salutoMs === null) { salutoMs = ora(); log(`  ⏱  saluto dopo ${salutoMs} ms dalla connessione`); }
      if (primoAudioDopo !== null) {
        misure.push({ battuta: primoAudioDopo.battuta, ms: ora() - primoAudioDopo.t });
        log(`  ⏱  risposta dopo ${ora() - primoAudioDopo.t} ms`);
        primoAudioDopo = null;
      }
      coda = Buffer.concat([coda, audio]);
      break;
    }
    case 'interruption':
      log('  ✂  interruzione: l\'agente smette di parlare');
      coda = Buffer.alloc(0);
      break;
    case 'agent_response':
      log(`🤖 ${m.agent_response_event.agent_response}`);
      break;
    case 'agent_response_correction':
      log(`🤖 (corretto, detto solo) ${m.agent_response_correction_event?.corrected_agent_response}`);
      break;
    case 'user_transcript':
      log(`👤 ${m.user_transcription_event.user_transcript}`);
      break;
    case 'agent_tool_response':
      log('🔧', JSON.stringify(m.agent_tool_response || m).slice(0, 200));
      break;
    case 'ping':
      invia({ type: 'pong', event_id: m.ping_event.event_id });
      break;
  }
});

ws.on('close', (c, motivo) => { log('l\'agente ha chiuso la chiamata', c, String(motivo || '')); chiuso = true; });
ws.on('error', (e) => { console.error('errore websocket:', e.message); process.exit(1); });

function avanti() {
  let frame;
  if (stato === 'parla') {
    frame = battute[battuta].subarray(posizione, posizione + FRAME);
    posizione += FRAME;
    if (frame.length < FRAME) frame = Buffer.concat([frame, Buffer.alloc(FRAME - frame.length, SILENZIO)]);
    if (posizione >= battute[battuta].length) {
      stato = 'ascolta';
      primoAudioDopo = { battuta, t: ora() };
      haParlato = false;
    }
  } else frame = Buffer.alloc(FRAME, SILENZIO);
  sinistra.push(frame);
  invia({ user_audio_chunk: frame.toString('base64') });

  if (coda.length > 0) {
    const pezzo = coda.subarray(0, FRAME);
    coda = coda.subarray(pezzo.length);
    destra.push(pezzo.length < FRAME ? Buffer.concat([pezzo, Buffer.alloc(FRAME - pezzo.length, SILENZIO)]) : pezzo);
    ultimoAudioMs = ora();
    haParlato = true;
  } else destra.push(Buffer.alloc(FRAME, SILENZIO));

  if (stato === 'ascolta' && haParlato && coda.length === 0 && ora() - ultimoAudioMs > FINE_TURNO_MS - PAUSA_UMANA_MS) {
    if (battuta + 1 < battute.length) {
      stato = 'pausa';
      setTimeout(() => { battuta++; posizione = 0; stato = 'parla'; log(`👤 (dice) ${COPIONE[battuta]}`); }, PAUSA_UMANA_MS);
    } else if (stato !== 'fine') {
      stato = 'fine';
      setTimeout(chiudi, 5000);
    }
  }

  tick++;
  if (chiuso && coda.length === 0) return chiudi();
  if (ora() > 240000) { log('troppo lunga, chiudo'); return chiudi(); }
  setTimeout(avanti, Math.max(0, tick * 20 - ora()));
}

let finito = false;
function chiudi() {
  if (finito) return;
  finito = true;
  ws.close();
  const out = join(qui, 'out');
  mkdirSync(out, { recursive: true });
  const n = Math.min(sinistra.length, destra.length);
  const stereo = Buffer.alloc(n * FRAME * 2);
  for (let i = 0; i < n; i++) for (let j = 0; j < FRAME; j++) {
    stereo[(i * FRAME + j) * 2] = sinistra[i][j];
    stereo[(i * FRAME + j) * 2 + 1] = destra[i][j];
  }
  const grezzo = join(out, `${etichetta}.ulaw`);
  writeFileSync(grezzo, stereo);
  const mp3 = join(out, `${etichetta}.mp3`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'mulaw', '-ar', '8000', '-ac', '2', '-i', grezzo, mp3]);
  const ms = misure.map((m) => m.ms);
  const riepilogo = {
    etichetta, agente: idAgente(), saluto_ms: salutoMs, ritardi_ms: misure,
    medio_ms: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null,
    mediano_ms: ms.length ? [...ms].sort((a, b) => a - b)[Math.floor(ms.length / 2)] : null,
    registrazione: mp3,
  };
  writeFileSync(join(out, `${etichetta}.json`), JSON.stringify(riepilogo, null, 2));
  console.log('\nRITARDI (fine frase del cliente → primo audio del receptionist):', ms.join(', '), 'ms');
  console.log('medio', riepilogo.medio_ms, 'ms · mediano', riepilogo.mediano_ms, 'ms');
  console.log('registrazione:', mp3);
  setTimeout(() => process.exit(0), 200);
}
