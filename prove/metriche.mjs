// Tempi turno per turno dell'ultima conversazione dell'agente della versione 2, dalle metriche
// di ElevenLabs. Uso: node prove/metriche.mjs [conversation_id]
import { CONFIG } from '../src/config.mjs';
import { idAgente } from '../src/v2-elevenlabs.mjs';

const h = { 'xi-api-key': CONFIG.elevenKey };
let id = process.argv[2];
if (!id) id = (await (await fetch(`https://api.elevenlabs.io/v1/convai/conversations?agent_id=${idAgente()}&page_size=1`, { headers: h })).json()).conversations[0].conversation_id;
const d = await (await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}`, { headers: h })).json();
const ms = (m, k) => (m[k]?.elapsed_time != null ? Math.round(m[k].elapsed_time * 1000) : '-');
const totali = [];
for (const t of d.transcript || []) {
  const testo = (t.message || '').trim();
  if (!testo) continue;
  if (t.role === 'user') { console.log(`👤 ${testo.slice(0, 100)}`); continue; }
  const m = t.conversation_turn_metrics?.metrics || {};
  const tot = ms(m, 'convai_ttf_audio_since_silence');
  if (typeof tot === 'number' && m.convai_llm_service_ttfb) totali.push(tot);
  console.log(`🤖 ${testo.slice(0, 100)}`);
  console.log(`     ⏱ ${tot} ms = attesa fine frase ${ms(m, 'convai_turn_silence_before_initiation')} + primo token ${ms(m, 'convai_llm_service_ttfb')} (prima frase ${ms(m, 'convai_llm_service_ttf_sentence')}) + voce ${ms(m, 'convai_tts_service_ttfb')}`);
}
const ord = [...totali].sort((a, b) => a - b);
if (ord.length) console.log(`\nfine frase → primo audio (lato ElevenLabs): mediana ${ord[Math.floor(ord.length / 2)]} ms, massimo ${ord.at(-1)} ms`);
