// VERSIONE 2 — la voce più realistica: la telefonata va all'agente vocale di ElevenLabs
// (voce italiana madrelingua con Eleven v4 Turbo, turni decisi anche dall'intonazione).
// Il nostro server non sta in mezzo all'audio: chiede a ElevenLabs le istruzioni per Twilio
// ("register call") e Twilio collega la chiamata direttamente ai loro server.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, RADICE } from './config.mjs';
import { martediProssimo, oggiInItaliano } from './persona.mjs';

export const API_ELEVEN = 'https://api.elevenlabs.io';
export const FILE_AGENTE = join(RADICE, 'agente-v2.json');

export function idAgente() {
  if (process.env.ELEVENLABS_AGENT_ID) return process.env.ELEVENLABS_AGENT_ID;
  if (existsSync(FILE_AGENTE)) return JSON.parse(readFileSync(FILE_AGENTE, 'utf8')).agentId;
  return null;
}

// Valori che cambiano a ogni chiamata e che ElevenLabs inserisce nelle istruzioni ({{oggi}}...).
export function variabiliDinamiche(cliente) {
  const m = martediProssimo();
  return { oggi: oggiInItaliano(), giorno_libero: `${m.giorno} ${m.numero} ${m.mese}`, telefono_cliente: cliente || 'sconosciuto' };
}

export async function eleven(percorso, { metodo = 'GET', corpo } = {}) {
  const r = await fetch(API_ELEVEN + percorso, {
    method: metodo,
    headers: { 'xi-api-key': CONFIG.elevenKey, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const testo = await r.text();
  if (!r.ok) throw new Error(`ElevenLabs ${metodo} ${percorso} → ${r.status}: ${testo.slice(0, 500)}`);
  try { return JSON.parse(testo); } catch { return testo; }
}

// TwiML che collega la chiamata Twilio all'agente.
export async function twimlV2({ cliente, numeroTwilio, inUscita }) {
  const t = Date.now();
  const risposta = await eleven('/v1/convai/twilio/register-call', {
    metodo: 'POST',
    corpo: {
      agent_id: idAgente(),
      from_number: inUscita ? numeroTwilio : cliente,
      to_number: inUscita ? cliente : numeroTwilio,
      direction: inUscita ? 'outbound' : 'inbound',
      conversation_initiation_client_data: { dynamic_variables: variabiliDinamiche(cliente) },
    },
  });
  const twiml = typeof risposta === 'string' ? risposta : risposta.twiml || JSON.stringify(risposta);
  console.log(`v2 register-call in ${Date.now() - t} ms`);
  return twiml;
}
