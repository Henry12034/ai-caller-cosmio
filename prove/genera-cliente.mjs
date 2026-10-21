// Genera l'audio delle battute del cliente finto (voce sintetica italiana) in μ-law 8 kHz,
// lo stesso formato audio delle telefonate Twilio. Uso: node prove/genera-cliente.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPIONI } from './copione.mjs';

const qui = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(join(qui, '..', '.env'));

for (const [nome, battute] of Object.entries(COPIONI)) {
  const cartella = join(qui, 'audio-cliente', nome);
  mkdirSync(cartella, { recursive: true });
  for (const [i, frase] of battute.entries()) {
    const ulaw = join(cartella, `${i + 1}.ulaw`);
    if (existsSync(ulaw)) continue;
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: 'ash',
        input: frase,
        instructions: "Uomo italiano sui quarant'anni al telefono con l'officina. Accento italiano nativo, tono colloquiale e rilassato, ritmo naturale.",
        response_format: 'pcm',
      }),
    });
    if (!r.ok) throw new Error(`TTS ${r.status}: ${await r.text()}`);
    const pcm = join(cartella, `${i + 1}.pcm`);
    writeFileSync(pcm, Buffer.from(await r.arrayBuffer()));
    // 24 kHz PCM → 8 kHz μ-law, togliendo il silenzio iniziale e finale
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcm,
      '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',
      '-ar', '8000', '-ac', '1', '-f', 'mulaw', ulaw]);
    unlinkSync(pcm);
    console.log(`${nome} ${i + 1}. ${frase}`);
  }
}
console.log('Audio del cliente pronto.');
