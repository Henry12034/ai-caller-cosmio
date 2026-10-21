// Simula una telefonata Twilio (Media Streams) verso il nostro server, senza telefono:
// manda l'audio del cliente finto in tempo reale, "riproduce" l'audio del receptionist
// come farebbe il telefono, misura il ritardo di ogni risposta e salva la registrazione.
//
// Uso: node prove/finto-twilio.mjs <url> [etichetta] [copione: base | scorbutico | disordine]
//   <url> = il websocket (ws://127.0.0.1:5050/media/1/prova) oppure il webhook Twilio
//   (http://127.0.0.1:5050/twilio/locale/voce?v=1): in quel caso prima fa la richiesta
//   che farebbe Twilio, come in una chiamata vera, e poi si collega allo stream indicato.
import WebSocket from 'ws';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPIONI } from './copione.mjs';

const qui = dirname(fileURLToPath(import.meta.url));
let url = process.argv[2] || 'ws://127.0.0.1:5050/media/1/prova';
const etichetta = process.argv[3] || 'prova';
const nomeCopione = process.argv[4] || 'base';
const COPIONE = COPIONI[nomeCopione];
const callSid = 'CAfinto' + Date.now();
const parametri = { from: '+390000000000', to: '+15550000000' };
if (url.startsWith('http')) {
  const t = Date.now();
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ CallSid: callSid, From: '+390000000000', To: '+15550000000', Direction: 'inbound' }),
  });
  const twiml = await r.text();
  const stream = twiml.match(/<Stream url="([^"]+)"/)?.[1];
  if (!stream) { console.error('TwiML senza Stream:', twiml); process.exit(1); }
  // i <Parameter> del TwiML arrivano al websocket dentro l'evento start, come fa Twilio
  for (const [, nome, valore] of twiml.matchAll(/<Parameter name="([^"]+)" value="([^"]*)"/g)) parametri[nome] = valore;
  const u = new URL(url);
  // lo stream verso il nostro server passa in locale; quello verso ElevenLabs (versione 2) va diretto
  url = new URL(stream).hostname.endsWith('elevenlabs.io') ? stream : stream.replace(/^wss:\/\/[^/]+/, `ws://${u.host}`);
  console.log(`webhook in ${Date.now() - t} ms → ${url}`);
  // Twilio apre lo stream circa 300 ms dopo aver ricevuto il TwiML
  await new Promise((r) => setTimeout(r, 300));
}
const FRAME = 160; // 20 ms di μ-law a 8 kHz
const SILENZIO = 0xff;
const PAUSA_UMANA_MS = 350; // quanto aspetta il cliente prima di rispondere
const FINE_TURNO_MS = 1100; // silenzio del receptionist dopo il quale il cliente parla (copre la pausa durante l'invio dell'SMS)

const battute = COPIONE.map((_, i) => readFileSync(join(qui, 'audio-cliente', nomeCopione, `${i + 1}.ulaw`)));
const streamSid = 'MZ' + Math.random().toString(16).slice(2).padEnd(32, '0');
const ws = new WebSocket(url);

let coda = Buffer.alloc(0); // audio del receptionist ancora da "riprodurre"
let marcheInAttesa = []; // { nome, byte } da rimandare quando l'audio prima è stato riprodotto
let byteRiprodotti = 0;
let byteRicevuti = 0;
const sinistra = []; // cliente
const destra = []; // receptionist come lo sente il cliente
let battuta = -1; // -1: aspetta il saluto
let posizione = 0; // dentro la battuta corrente
let stato = 'ascolta'; // 'ascolta' | 'pausa' | 'parla' | 'fine'
let ultimoAudioMs = 0;
let haParlato = false;
let fineParlatoMs = 0;
const misure = [];
let primoAudioDopo = null;
let salutoMs = null;
const t0 = Date.now();
const ora = () => Date.now() - t0;
let tick = 0;
let chiuso = false;
const log = (...a) => console.log(`[${(ora() / 1000).toFixed(2)}s]`, ...a);

ws.on('open', () => {
  ws.send(JSON.stringify({ event: 'connected', protocol: 'Call', version: '1.0.0' }));
  ws.send(JSON.stringify({
    event: 'start', sequenceNumber: '1', streamSid,
    start: {
      accountSid: 'ACfinto', streamSid, callSid, tracks: ['inbound'],
      customParameters: parametri,
      mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 },
    },
  }));
  log('connesso a', url);
  avanti();
});

ws.on('message', (dati) => {
  const m = JSON.parse(dati);
  if (m.event === 'media') {
    const audio = Buffer.from(m.media.payload, 'base64');
    if (salutoMs === null) { salutoMs = ora(); log(`  ⏱  saluto dopo ${salutoMs} ms dall'apertura dello stream`); }
    if (primoAudioDopo !== null) {
      misure.push({ battuta: primoAudioDopo.battuta, ms: ora() - primoAudioDopo.t });
      log(`  ⏱  risposta dopo ${ora() - primoAudioDopo.t} ms`);
      primoAudioDopo = null;
    }
    coda = Buffer.concat([coda, audio]);
    byteRicevuti += audio.length;
  } else if (m.event === 'mark') {
    marcheInAttesa.push({ nome: m.mark.name, byte: byteRicevuti });
  } else if (m.event === 'clear') {
    log('  ✂  clear: il server interrompe la riproduzione');
    byteRicevuti -= coda.length;
    coda = Buffer.alloc(0);
    for (const k of marcheInAttesa) invia({ event: 'mark', streamSid, mark: { name: k.nome } });
    marcheInAttesa = [];
  }
});

ws.on('close', () => { log('il server ha chiuso la chiamata'); chiuso = true; });
ws.on('error', (e) => { console.error('errore websocket:', e.message); process.exit(1); });

function invia(o) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); }

// Un passo ogni 20 ms, corretto sulla deriva del timer.
function avanti() {
  // audio del cliente verso il server
  let frame;
  if (stato === 'parla') {
    frame = battute[battuta].subarray(posizione, posizione + FRAME);
    posizione += FRAME;
    if (frame.length < FRAME) frame = Buffer.concat([frame, Buffer.alloc(FRAME - frame.length, SILENZIO)]);
    if (posizione >= battute[battuta].length) {
      stato = 'ascolta';
      fineParlatoMs = ora();
      primoAudioDopo = { battuta, t: fineParlatoMs };
      haParlato = false;
    }
  } else frame = Buffer.alloc(FRAME, SILENZIO);
  sinistra.push(frame);
  invia({ event: 'media', streamSid, media: { track: 'inbound', chunk: String(tick), timestamp: String(tick * 20), payload: frame.toString('base64') } });

  // riproduzione dell'audio del receptionist
  if (coda.length > 0) {
    const pezzo = coda.subarray(0, FRAME);
    coda = coda.subarray(pezzo.length);
    byteRiprodotti += pezzo.length;
    destra.push(pezzo.length < FRAME ? Buffer.concat([pezzo, Buffer.alloc(FRAME - pezzo.length, SILENZIO)]) : pezzo);
    ultimoAudioMs = ora();
    haParlato = true;
    const pronte = marcheInAttesa.filter((k) => k.byte <= byteRiprodotti);
    marcheInAttesa = marcheInAttesa.filter((k) => k.byte > byteRiprodotti);
    for (const k of pronte) invia({ event: 'mark', streamSid, mark: { name: k.nome } });
  } else destra.push(Buffer.alloc(FRAME, SILENZIO));

  // turni: quando il receptionist ha finito di parlare, il cliente dice la battuta dopo
  if (stato === 'ascolta' && haParlato && coda.length === 0 && ora() - ultimoAudioMs > FINE_TURNO_MS - PAUSA_UMANA_MS) {
    if (battuta + 1 < battute.length) {
      stato = 'pausa';
      setTimeout(() => { battuta++; posizione = 0; stato = 'parla'; log(`👤 cliente: ${COPIONE[battuta]}`); }, PAUSA_UMANA_MS);
    } else if (stato !== 'fine') {
      stato = 'fine';
      setTimeout(chiudi, 4000);
    }
  }

  tick++;
  if (chiuso && coda.length === 0) return chiudi();
  if (ora() > 240000) { log('troppo lunga, chiudo'); return chiudi(); }
  const prossimo = tick * 20 - ora();
  setTimeout(avanti, Math.max(0, prossimo));
}

let finito = false;
function chiudi() {
  if (finito) return;
  finito = true;
  invia({ event: 'stop', streamSid, stop: { accountSid: 'ACfinto', callSid: 'CAfinto' } });
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
    etichetta, url,
    saluto_ms: salutoMs,
    ritardi_ms: misure,
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
