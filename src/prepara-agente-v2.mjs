// Crea (la prima volta) o aggiorna l'agente vocale ElevenLabs della versione 2:
// stesse istruzioni della versione 1, voce italiana, Eleven v4 Turbo, SMS di conferma
// tramite il nostro server e chiusura della chiamata da sola.
// Uso: node src/prepara-agente-v2.mjs   (legge .env: ELEVENLABS_API_KEY, V2_VOCE, URL_PUBBLICO, SEGRETO)
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { CONFIG } from './config.mjs';
import { istruzioni, saluto, OFFICINA, CON_SMS } from './persona.mjs';
import { eleven, FILE_AGENTE } from './v2-elevenlabs.mjs';

const stato = existsSync(FILE_AGENTE) ? JSON.parse(readFileSync(FILE_AGENTE, 'utf8')) : {};
const v = CONFIG.v2;
// chi risponde nella versione 2: Luca in italiano neutro, oppure V2_PERSONAGGIO=napoletano (con V2_NOME)
const personaggio = { personaggio: v.personaggio, ...(v.nome ? { nome: v.nome } : {}) };
if (!CONFIG.elevenKey) throw new Error('Manca ELEVENLABS_API_KEY nel file .env');
if (!v.voce) throw new Error('Manca V2_VOCE (voice_id della voce italiana) nel file .env');
if (!CONFIG.urlPubblico || !process.env.SEGRETO) throw new Error('Servono URL_PUBBLICO e SEGRETO (gli stessi del server online)');

const strumento = {
  tool_config: {
    type: 'webhook',
    name: 'conferma_appuntamento',
    description: "Registra l'appuntamento e manda al cliente l'SMS di conferma. Va chiamato una sola volta, quando orario, nome, macchina e lista dei lavori sono confermati.",
    response_timeout_secs: 10,
    pre_tool_speech: 'force', // prima di usarlo dice "le mando subito l'SMS"
    tool_call_sound: 'typing', // e intanto si sente battere sulla tastiera
    tool_call_sound_behavior: 'auto',
    api_schema: {
      url: `${CONFIG.urlPubblico}/strumenti/${process.env.SEGRETO}/conferma`,
      method: 'POST',
      request_body_schema: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome del cliente' },
          ora: { type: 'string', description: 'Ora scelta: 9:00, 11:30 o 14:00' },
          auto: { type: 'string', description: 'Marca e modello, es. Alfa Romeo Giulia' },
          telefono: { type: 'string', dynamic_variable: 'telefono_cliente' },
        },
        required: ['nome', 'ora', 'auto', 'telefono'],
      },
    },
  },
};

if (stato.toolId) {
  await eleven(`/v1/convai/tools/${stato.toolId}`, { metodo: 'PATCH', corpo: strumento });
  console.log('strumento aggiornato', stato.toolId);
} else {
  const t = await eleven('/v1/convai/tools', { metodo: 'POST', corpo: strumento });
  stato.toolId = t.id;
  console.log('strumento creato', stato.toolId);
}

const agente = {
  name: `Centralino ${OFFICINA.nome} (versione 2)`,
  conversation_config: {
    agent: {
      language: 'it',
      first_message: saluto(personaggio),
      prompt: {
        prompt: istruzioni({ perTts: true, oggi: '{{oggi}}', slot: '{{giorno_libero}}', fine: 'end_call', ...personaggio }),
        llm: v.llm,
        temperature: 0.7,
        // niente "ragionamento" prima di rispondere: al telefono conta la prontezza.
        // Vanno sempre scritti (anche vuoti), altrimenti resta il valore del modello di prima
        // e cambiando modello ElevenLabs rifiuta la configurazione.
        reasoning_effort: process.env.V2_RAGIONAMENTO || null,
        thinking_budget: /^(claude|gemini)/.test(v.llm) && v.thinking !== '' ? Number(v.thinking) : null,
        tool_ids: CON_SMS ? [stato.toolId] : [], // senza SMS l'agente non ha bisogno del nostro server durante la chiamata
        built_in_tools: {
          end_call: {
            type: 'system',
            name: 'end_call',
            description: 'Chiude la telefonata. Va usato subito dopo il saluto finale, quando al cliente non serve altro.',
            params: { system_tool_type: 'end_call' },
          },
        },
        timezone: 'Europe/Rome',
      },
    },
    tts: {
      model_id: v.modelloVoce,
      voice_id: v.voce,
      agent_output_audio_format: 'ulaw_8000',
      stability: v.stabilita,
      similarity_boost: v.somiglianza,
      suggested_audio_tags: [
        { tag: 'chuckles', description: 'risatina leggera dopo una battuta, raramente' },
        { tag: 'sighs', description: "sospiro, per esempio quando dice che l'officina è piena" },
      ],
    },
    asr: {
      provider: v.asr,
      user_input_audio_format: 'ulaw_8000',
      // V2_PAROLE: parole in più da riconoscere bene, separate da virgola (es. il nome di chi chiama nella demo)
      keywords: ['tagliando', 'pastiglie', 'libretto', 'Marchetti', 'Giulia', 'climatizzatore', ...v.paroleExtra],
    },
    // spelling_patience 'off': niente attesa in più quando il cliente dice nomi e numeri
    turn: {
      turn_eagerness: v.eagerness,
      speculative_turn: v.speculativo,
      turn_model: 'turn_v3',
      spelling_patience: v.pazienzaNomi,
      // come una persona che ci pensa un attimo, solo se la risposta tarda
      soft_timeout_config: {
        timeout_seconds: v.riempitivoSecondi,
        message: 'Mmh, allora...',
        additional_soft_timeout_messages: ['Eh, vediamo...', 'Sì, sì...', v.personaggio === 'napoletano' ? 'Allora, guardate...' : 'Allora, guardi...'],
        randomize_fillers: true,
        use_llm_generated_message: false,
        max_soft_timeouts_per_generation: 1,
      },
    },
    conversation: {
      max_duration_seconds: 600,
      background_sound: v.sottofondo
        ? { source_type: 'preset', source_id: v.sottofondo, volume: v.volumeSottofondo, crossfade_loop: true }
        : { source_type: null, source_id: null },
    },
  },
};

if (stato.agentId) {
  await eleven(`/v1/convai/agents/${stato.agentId}`, { metodo: 'PATCH', corpo: agente });
  console.log('agente aggiornato', stato.agentId);
} else {
  const a = await eleven('/v1/convai/agents/create', { metodo: 'POST', corpo: agente });
  stato.agentId = a.agent_id;
  console.log('agente creato', stato.agentId);
}
writeFileSync(FILE_AGENTE, JSON.stringify(stato, null, 2));
