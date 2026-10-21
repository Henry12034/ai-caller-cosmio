// Il lato Twilio di una chiamata (Media Streams): riceve l'audio del telefono e ci rimanda
// quello del receptionist, tenendo il conto di cosa il cliente ha davvero già sentito.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { RADICE } from './config.mjs';

const cartellaLog = join(RADICE, 'registrazioni');
mkdirSync(cartellaLog, { recursive: true });

export class ChiamataTwilio {
  constructor(ws, versione) {
    this.ws = ws;
    this.versione = versione;
    this.streamSid = null;
    this.callSid = null;
    this.chiamante = null;
    this.parametri = {};
    this.t0 = Date.now();
    this.msTwilio = 0; // timestamp dell'ultimo pacchetto audio ricevuto dal telefono
    this.marche = []; // marche inviate e non ancora tornate (= audio non ancora riprodotto)
    this.contatoreMarche = 0;
    this.chiusa = false;
    this.alPartire = null;
    this.alAudio = null;
    this.allaFine = null;
    this.allaMarca = null;
    this.file = null;

    ws.on('message', (dati) => {
      let m;
      try { m = JSON.parse(dati); } catch { return; }
      switch (m.event) {
        case 'start':
          this.streamSid = m.start.streamSid;
          this.callSid = m.start.callSid;
          this.parametri = m.start.customParameters || {};
          this.chiamante = this.parametri.from || null;
          this.file = join(cartellaLog, `${new Date().toISOString().replace(/[:.]/g, '-')}-v${versione}.log`);
          this.log('📞 chiamata', { callSid: this.callSid, da: this.chiamante, a: this.parametri.to });
          this.alPartire?.();
          break;
        case 'media':
          this.msTwilio = Number(m.media.timestamp);
          this.alAudio?.(m.media.payload);
          break;
        case 'mark': {
          const i = this.marche.indexOf(m.mark.name);
          if (i >= 0) this.marche.splice(0, i + 1);
          this.allaMarca?.(m.mark.name);
          break;
        }
        case 'stop':
          this.log('📴 Twilio ha chiuso lo stream');
          break;
      }
    });
    ws.on('close', () => { this.chiusa = true; this.log('fine chiamata'); this.allaFine?.(); });
    ws.on('error', (e) => this.log('errore websocket Twilio', e.message));
  }

  get sta_parlando() { return this.marche.length > 0; }

  inviaAudio(base64) {
    if (this.chiusa || !this.streamSid) return;
    this.ws.send(JSON.stringify({ event: 'media', streamSid: this.streamSid, media: { payload: base64 } }));
  }

  marca(nome = `m${++this.contatoreMarche}`) {
    if (this.chiusa || !this.streamSid) return nome;
    this.marche.push(nome);
    this.ws.send(JSON.stringify({ event: 'mark', streamSid: this.streamSid, mark: { name: nome } }));
    return nome;
  }

  // Butta via l'audio non ancora riprodotto (il cliente ha interrotto).
  svuota() {
    if (this.chiusa || !this.streamSid) return;
    this.ws.send(JSON.stringify({ event: 'clear', streamSid: this.streamSid }));
    this.marche = [];
  }

  // Aspetta che il cliente abbia sentito tutto l'audio già inviato.
  async finitoDiParlare(massimoMs = 15000) {
    const fine = Date.now() + massimoMs;
    while (this.marche.length > 0 && !this.chiusa && Date.now() < fine) await new Promise((r) => setTimeout(r, 50));
  }

  riaggancia() {
    if (this.chiusa) return;
    this.log('📴 il receptionist chiude la chiamata');
    this.ws.close();
  }

  log(...a) {
    const riga = `[${((Date.now() - this.t0) / 1000).toFixed(2)}s] ` + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
    console.log(`v${this.versione} ${riga}`);
    if (this.file) appendFileSync(this.file, riga + '\n');
  }
}
