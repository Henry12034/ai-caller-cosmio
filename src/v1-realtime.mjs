// VERSIONE 1 — la più veloce: la telefonata va dritta al modello realtime di OpenAI,
// che ascolta e risponde a voce da solo (niente trascrizione + testo + sintesi in mezzo).
// L'audio del telefono (μ-law 8 kHz) passa così com'è, senza conversioni.
import WebSocket from 'ws';
import { CONFIG } from './config.mjs';
import { istruzioni, saluto, strumenti } from './persona.mjs';
import { confermaAppuntamento } from './strumenti.mjs';

// Connessioni a OpenAI aperte in anticipo, appena Twilio ci avvisa della chiamata.
// Il server risponde a Twilio solo quando il saluto è già pronto: nel frattempo chi chiama
// sente squillare, e appena la chiamata parte il saluto si sente subito, senza silenzio.
const preriscaldate = new Map();

export async function preriscalda(callSid, chiamante, attesaMassimaMs = 3500) {
  if (!callSid || preriscaldate.has(callSid)) return;
  const s = apriSessione(chiamante);
  preriscaldate.set(callSid, s);
  setTimeout(() => {
    if (preriscaldate.get(callSid) === s) { preriscaldate.delete(callSid); s.ws.close(); }
  }, 30000);
  await Promise.race([s.salutoPronto, new Promise((r) => setTimeout(r, attesaMassimaMs))]);
}

function configurazioneSessione(chiamante) {
  const v = CONFIG.v1;
  const turni = v.vad === 'semantic_vad'
    ? { type: 'semantic_vad', eagerness: v.eagerness, create_response: true, interrupt_response: true }
    : { type: 'server_vad', threshold: v.soglia, prefix_padding_ms: 300, silence_duration_ms: v.silenzioMs, create_response: true, interrupt_response: true };
  return {
    type: 'realtime',
    model: v.modello,
    output_modalities: ['audio'],
    // i modelli 2.x "ragionano" prima di parlare: al minimo per rispondere prima
    ...(v.modello.startsWith('gpt-realtime-2') ? { reasoning: { effort: v.ragionamento } } : {}),
    instructions: istruzioni({ chiamante }),
    audio: {
      input: {
        format: { type: 'audio/pcmu' },
        turn_detection: turni,
        ...(v.rumore !== 'off' ? { noise_reduction: { type: v.rumore } } : {}),
        // trascrizione solo per i log (gira in parallelo, non rallenta le risposte)
        transcription: { model: 'gpt-4o-transcribe', language: 'it' },
      },
      output: { format: { type: 'audio/pcmu' }, voice: v.voce, speed: v.velocita },
    },
    tools: strumenti(),
    tool_choice: 'auto',
  };
}

function apriSessione(chiamante) {
  const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(CONFIG.v1.modello)}`, {
    headers: { Authorization: `Bearer ${CONFIG.openaiKey}` },
  });
  const s = { ws, pronta: false, inAttesa: [], eventi: [], tAperta: Date.now() };
  s.salutoPronto = new Promise((r) => {
    const guarda = (d) => { if (String(d).includes('"response.output_audio.delta"')) { ws.off('message', guarda); r(); } };
    ws.on('message', guarda);
    ws.on('close', r);
  });
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'session.update', session: configurazioneSessione(chiamante) }));
    // Il saluto parte subito: il suo audio aspetta in coda finché il telefono non è collegato.
    ws.send(JSON.stringify({
      type: 'response.create',
      response: { instructions: `Rispondi al telefono dicendo, con tono cordiale e naturale: "${saluto()}"` },
    }));
    s.pronta = true;
    for (const m of s.inAttesa) ws.send(m);
    s.inAttesa = [];
  });
  // finché la chiamata non è agganciata, gli eventi si accumulano qui
  s.ascoltatore = (dati) => s.eventi.push(dati);
  ws.on('message', s.ascoltatore);
  return s;
}

export function gestisciV1(chiamata) {
  let sessione = null;
  let ultimoItem = null; // risposta del receptionist in corso
  let inizioRispostaMs = null; // msTwilio quando è partito il suo audio
  let primoAudio = true;
  let tFineParlato = null;
  let chiudereDopo = false;
  let salutoInCorso = false;
  const risposteConAudio = new Set();
  const turni = [];

  const invia = (o) => {
    const m = JSON.stringify(o);
    if (sessione?.pronta) sessione.ws.send(m); else sessione?.inAttesa.push(m);
  };

  chiamata.alPartire = () => {
    sessione = preriscaldate.get(chiamata.callSid);
    if (sessione) {
      preriscaldate.delete(chiamata.callSid);
      chiamata.log(`connessione OpenAI preriscaldata (${Date.now() - sessione.tAperta} ms fa)`);
    } else {
      sessione = apriSessione(chiamata.chiamante);
    }
    sessione.ws.off('message', sessione.ascoltatore);
    sessione.ws.on('message', (d) => evento(JSON.parse(d)));
    for (const d of sessione.eventi) evento(JSON.parse(d));
    sessione.eventi = [];
    sessione.ws.on('close', (c, r) => { chiamata.log('OpenAI chiuso', c, String(r || '')); chiamata.riaggancia(); });
    sessione.ws.on('error', (e) => chiamata.log('errore OpenAI', e.message));
  };

  chiamata.alAudio = (payload) => {
    if (sessione?.pronta) sessione.ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: payload }));
  };

  chiamata.allaFine = () => {
    sessione?.ws.close();
    if (turni.length) chiamata.log('⏱ ritardi lato server (fine frase rilevata → primo audio):', turni.join(', '), 'ms');
  };

  async function evento(e) {
    switch (e.type) {
      case 'session.created':
      case 'session.updated':
        break;

      case 'input_audio_buffer.speech_started':
        // Il cliente parla sopra al receptionist: smetti di farlo sentire e taglia la risposta
        // al punto in cui il cliente l'ha davvero sentita.
        if (ultimoItem && inizioRispostaMs !== null && chiamata.sta_parlando) {
          const sentitoMs = Math.max(0, chiamata.msTwilio - inizioRispostaMs);
          invia({ type: 'conversation.item.truncate', item_id: ultimoItem, content_index: 0, audio_end_ms: sentitoMs });
          chiamata.svuota();
          chiamata.log(`✂ interrotto dopo ${sentitoMs} ms di risposta`);
        }
        ultimoItem = null;
        inizioRispostaMs = null;
        break;

      case 'input_audio_buffer.speech_stopped':
        tFineParlato = Date.now();
        break;

      case 'response.output_audio.delta':
      case 'response.audio.delta':
        risposteConAudio.add(e.response_id);
        if (e.item_id !== ultimoItem) {
          ultimoItem = e.item_id;
          inizioRispostaMs = chiamata.msTwilio;
          if (tFineParlato) {
            const ms = Date.now() - tFineParlato;
            turni.push(ms);
            chiamata.log(`⏱ primo audio ${ms} ms dopo la fine della frase`);
            tFineParlato = null;
          } else if (primoAudio) {
            chiamata.log(`⏱ saluto: primo audio a ${Date.now() - chiamata.t0} ms dall'inizio dello stream`);
          }
          primoAudio = false;
        }
        chiamata.inviaAudio(e.delta);
        chiamata.marca();
        break;

      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        chiamata.log(`🤖 ${e.transcript}`);
        break;

      case 'conversation.item.input_audio_transcription.completed':
        chiamata.log(`👤 ${e.transcript?.trim()}`);
        break;

      case 'response.done': {
        const r = e.response;
        if (r?.status === 'failed') chiamata.log('risposta fallita', r.status_details);
        if (salutoInCorso) {
          // ha appena detto il saluto finale che gli abbiamo chiesto: ora si può riattaccare
          salutoInCorso = false;
          await riattaccaDopoAverParlato();
          break;
        }
        const chiamate = (r?.output || []).filter((o) => o.type === 'function_call');
        for (const c of chiamate) await strumento(c, risposteConAudio.has(r.id));
        break;
      }

      case 'error':
        chiamata.log('errore OpenAI', e.error);
        break;
    }
  }

  async function riattaccaDopoAverParlato() {
    if (chiudereDopo) return;
    chiudereDopo = true;
    await chiamata.finitoDiParlare();
    await new Promise((r) => setTimeout(r, 600)); // un attimo di silenzio prima di riagganciare, come una persona
    chiamata.riaggancia();
  }

  async function strumento(c, haParlato) {
    let argomenti = {};
    try { argomenti = JSON.parse(c.arguments || '{}'); } catch {}
    chiamata.log(`🔧 ${c.name}`, argomenti);
    if (c.name === 'termina_chiamata') {
      invia({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: c.call_id, output: '{"ok":true}' } });
      if (haParlato) return riattaccaDopoAverParlato();
      // Vuole chiudere senza aver salutato (gpt-realtime lo fa spesso): prima il saluto, poi si riattacca.
      chiamata.log('👋 chiude senza salutare: gli faccio dire il saluto finale');
      salutoInCorso = true;
      invia({
        type: 'response.create',
        response: {
          tool_choice: 'none',
          instructions: "Saluta il cliente con UNA sola frase breve e calorosa che usa il suo nome e ricorda giorno e ora dell'appuntamento, per esempio \"Perfetto Marco, allora ci vediamo martedì alle nove. Buona giornata!\". Non dire nient'altro.",
        },
      });
      return;
    }
    let risultato = { ok: false, errore: 'strumento sconosciuto' };
    if (c.name === 'conferma_appuntamento') risultato = await confermaAppuntamento(argomenti, chiamata);
    invia({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: c.call_id, output: JSON.stringify(risultato) } });
    invia({ type: 'response.create' });
  }
}
