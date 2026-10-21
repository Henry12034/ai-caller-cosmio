import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = join(RADICE, '.env');
if (existsSync(env)) process.loadEnvFile(env);

const numero = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const CONFIG = {
  porta: numero(process.env.PORTA, 5050),
  // Indirizzo pubblico del server (https://...), serve a Twilio per raggiungerci.
  urlPubblico: (process.env.URL_PUBBLICO || '').replace(/\/$/, ''),
  versioneAttiva: process.env.VERSIONE_ATTIVA || '1',

  openaiKey: process.env.OPENAI_API_KEY,
  elevenKey: process.env.ELEVENLABS_API_KEY,

  // Versione 1: voce di OpenAI, latenza minima
  v1: {
    modello: process.env.V1_MODELLO || 'gpt-realtime',
    ragionamento: process.env.V1_RAGIONAMENTO || 'minimal', // solo per i modelli 2.x
    voce: process.env.V1_VOCE || 'cedar',
    velocita: numero(process.env.V1_VELOCITA, 1.0),
    vad: process.env.V1_VAD || 'server_vad', // 'server_vad' | 'semantic_vad'
    silenzioMs: numero(process.env.V1_SILENZIO_MS, 350),
    soglia: numero(process.env.V1_SOGLIA, 0.6),
    eagerness: process.env.V1_EAGERNESS || 'high',
    rumore: process.env.V1_RUMORE || 'near_field', // 'near_field' | 'far_field' | 'off'
  },

  // Versione 2: voce ElevenLabs, massimo realismo
  v2: {
    voce: process.env.V2_VOCE || '', // voice_id ElevenLabs (voce italiana madrelingua)
    modelloVoce: process.env.V2_MODELLO_VOCE || 'eleven_v4_turbo',
    // il più naturale in italiano a parità di prontezza (confronto del 21/10: README)
    llm: process.env.V2_LLM || 'claude-haiku-5-5',
    stabilita: numero(process.env.V2_STABILITA, 0.45),
    somiglianza: numero(process.env.V2_SOMIGLIANZA, 0.8),
    eagerness: process.env.V2_EAGERNESS || 'eager', // 'patient' | 'normal' | 'eager'
    speculativo: process.env.V2_SPECULATIVO !== '0',
    // Claude e Gemini "pensano" prima di rispondere se non glielo si vieta: al telefono sono
    // secondi di silenzio sulle domande difficili (fino a 2,8 s nelle chiamate vere del 21/10)
    thinking: process.env.V2_THINKING ?? '0',
    // se il modello di testo tarda comunque, dopo questi secondi dice un "Mmh, allora..." (-1 = mai)
    riempitivoSecondi: numero(process.env.V2_RIEMPITIVO_S, 1.8),
    asr: process.env.V2_ASR || 'scribe_realtime', // 'scribe_realtime' | 'scribe_v2_turbo'
    pazienzaNomi: process.env.V2_PAZIENZA_NOMI || 'auto', // 'auto' | 'off'
    // rumore d'ambiente durante la chiamata: '' (niente), 'office1', 'office2', 'typing'...
    sottofondo: process.env.V2_SOTTOFONDO || '',
    volumeSottofondo: numero(process.env.V2_VOLUME_SOTTOFONDO, 0.1),
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    apiKey: process.env.TWILIO_API_KEY,
    apiSecret: process.env.TWILIO_API_SECRET,
    numero: process.env.TWILIO_NUMERO || '', // il numero Twilio che risponde, es. +15551234567
  },
  inviaSms: process.env.INVIA_SMS !== '0',
};

export const twilioConfigurato = () => Boolean(CONFIG.twilio.accountSid && CONFIG.twilio.apiKey && CONFIG.twilio.apiSecret);
