# Guida tecnica

Come funziona il receptionist AI, come installarlo con il tuo numero e come adattarlo. Il README racconta cosa fa; qui c'è il come.

## Come funziona

**Versione 1, la più veloce: OpenAI Realtime.**
- Il numero Twilio chiama il webhook di questo server, che risponde con un `<Connect><Stream>`. L'audio della telefonata (G.711 μ-law, 8 kHz) passa via WebSocket dal server al modello realtime di OpenAI, che ascolta e risponde a voce senza conversioni.
- Mentre il telefono squilla, il server apre già la sessione con OpenAI e genera il saluto, così parte appena la chiamata viene presa.
- Fine frase: `server_vad` con 350 ms di silenzio.
- Se il cliente parla sopra al receptionist, il server svuota l'audio di Twilio (`clear`) e taglia la risposta nel punto in cui il cliente l'ha sentita (`conversation.item.truncate`).

**Versione 2, la più umana: ElevenLabs Agents.**
- Quando arriva la chiamata, il server chiede a ElevenLabs di registrarla (`register-call`) e passa a Twilio il TwiML che riceve. Da lì Twilio parla direttamente con l'agente ElevenLabs: il nostro server non sta nel percorso dell'audio.
- L'agente usa Claude Haiku 5.5 per il testo, Eleven v4 Turbo per la voce (in modalità espressiva) e il modello di turni `turn_v3`, con prontezza `eager` e generazione anticipata.
- Se la risposta tarda più di 1,8 s, dice un "Mmh, allora…".

**Pannello.** `URL_PUBBLICO/pannello/<SEGRETO>` sceglie quale versione risponde. Con la chiave API Twilio fa anche partire una chiamata verso il tuo telefono.

```
src/
  server.mjs              webhook Twilio, pannello, WebSocket della versione 1
  v1-realtime.mjs         ponte Twilio ↔ OpenAI Realtime
  v2-elevenlabs.mjs       register-call verso ElevenLabs
  prepara-agente-v2.mjs   crea o aggiorna l'agente ElevenLabs
  persona.mjs             chi è il receptionist, come parla, cosa sa, come va la chiamata
  strumenti.mjs           SMS di conferma, chiamate in uscita (Twilio)
  twilio-stream.mjs       lato Twilio della chiamata: audio, interruzioni, riaggancio
  pannello.mjs            pagina del pannello
prove/                    chiamate simulate, misure dei ritardi, campioni delle voci
demo/                     due telefonate dimostrative
```

## Cosa serve

- Node.js 20.12 o più recente (consigliato il 22).
- Un account Twilio **non in prova** (in prova Twilio legge un avviso all'inizio di ogni chiamata) con un numero di telefono.
- Per la versione 1, una chiave API OpenAI con accesso ai modelli realtime.
- Per la versione 2, un account ElevenLabs a pagamento. Il piano gratuito non permette di usare via API le voci della libreria, che comprendono tutte quelle italiane madrelingua, e consente solo un uso non commerciale.
- Un indirizzo HTTPS pubblico che porti al server: una VPS con reverse proxy, oppure Cloudflare Tunnel.

## Installazione

1. `npm install`
2. Copia `.env.example` in `.env` e riempilo. `SEGRETO` è una stringa casuale lunga: compare nell'indirizzo del webhook e del pannello.
3. Rendi il server raggiungibile da internet e metti l'indirizzo in `URL_PUBBLICO`. Per provare basta `cloudflared tunnel --url http://localhost:5050`, che però cambia indirizzo a ogni avvio.
4. `npm start`
5. Su Twilio vai in **Phone Numbers → il tuo numero → Voice configuration → A call comes in** e imposta Webhook `URL_PUBBLICO/twilio/<SEGRETO>/voce`, metodo **HTTP POST**.
6. Per la versione 2:
   1. Scegli una voce italiana nella Voice Library di ElevenLabs e metti il suo `voice_id` in `V2_VOCE` (i campioni in qualità telefono si fanno con `node prove/campioni-v2.mjs`).
   2. Lancia `node src/prepara-agente-v2.mjs`: crea l'agente e salva gli id in `agente-v2.json`. Rilancialo ogni volta che cambi la persona o le impostazioni della versione 2.
7. Apri il pannello, scegli la versione e chiama il numero.

## Adattarlo alla tua attività

Tutto il personaggio è in `src/persona.mjs`:
- `OFFICINA`: nome, indirizzo, orari;
- `RECEPTIONIST`: nome e genere, presi dal `.env`;
- `martediProssimo()`: il giorno con i posti liberi;
- `istruzioni()`: tono, flusso della chiamata, cosa non deve mai dire o promettere;
- `saluto()`: la prima frase.

Le istruzioni sono scritte in italiano parlato apposta: esempi sciolti e regole chiare funzionano meglio di frasi da copiare.

Dopo una modifica riavvia il server (versione 1) e rilancia `prepara-agente-v2.mjs` (versione 2).

## Prove senza telefono

| Comando | Cosa fa |
|---|---|
| `node prove/genera-cliente.mjs` | crea la voce del cliente di prova per i quattro copioni (`base`, `scorbutico`, `disordine`, `improvvisato`) |
| `prove/esegui.sh <nome> 1 base` | telefonata simulata alla versione 1 in locale: ritardo di ogni risposta e registrazione in `prove/out/<nome>.mp3` |
| `prove/esegui.sh <nome> 2 base` | la versione 2 con lo stesso percorso di Twilio (webhook, register-call, stream verso ElevenLabs) |
| `node prove/finto-elevenlabs.mjs <nome> improvvisato` | parla direttamente con l'agente della versione 2 |
| `node prove/metriche.mjs` | tempi turno per turno dell'ultima conversazione: attesa di fine frase, modello di testo, voce |
| `node prove/ttfa.mjs` | velocità dei modelli realtime di OpenAI a confronto |

## Cosa abbiamo misurato

**Versione 1.**
- Tempo prima del primo audio: `gpt-realtime` ~0,45–0,6 s, `gpt-realtime-1.5` ~0,6 s, `gpt-realtime-2.1` ~0,8 s.
- `semantic_vad` aspetta che la frase sia "finita" e aggiunge ~0,5 s rispetto a `server_vad`.
- `gpt-realtime` a volte chiude la chiamata senza salutare: il server se ne accorge, gli fa dire il saluto e riattacca dopo.

**Versione 2.** Su ogni turno l'attesa di fine frase vale ~0,25 s, la prima frase del modello di testo ~0,4 s e la voce ~0,075 s.
- Claude Haiku 5.5 sulle domande complicate può arrivare a 1–2,8 s.
- Qwen (`qwen36-35b-a3b`, ospitato da ElevenLabs) resta sotto 0,35 s ma parla in modo più rigido. Si cambia con `V2_LLM`.

## Note

- **Trasparenza.** Il receptionist ammette sempre di essere un'AI se glielo chiedono. Nell'Unione Europea l'AI Act chiede di dirlo subito a chi chiama: per un uso reale aggiungilo al saluto.
- **Privacy.** In `registrazioni/` finiscono i numeri di chi chiama e il testo delle telefonate, quindi vanno trattati secondo il GDPR.
- **Crediti.** L'idea e il flusso della chiamata vengono da [jasonc00person/bland-ai-receptionist](https://github.com/jasonc00person/bland-ai-receptionist), che usa Bland AI. Questo progetto è riscritto da zero per Twilio, OpenAI ed ElevenLabs, in italiano.
