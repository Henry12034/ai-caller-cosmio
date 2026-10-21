// Cosa succede quando il receptionist usa uno strumento durante la chiamata.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, RADICE, twilioConfigurato } from './config.mjs';
import { testoSms, martediProssimo } from './persona.mjs';

const cartella = join(RADICE, 'registrazioni');
mkdirSync(cartella, { recursive: true });

export async function confermaAppuntamento(argomenti, chiamata) {
  const appuntamento = { ...argomenti, giorno: martediProssimo().iso, telefono: chiamata.chiamante, quando: new Date().toISOString(), versione: chiamata.versione };
  appendFileSync(join(cartella, 'appuntamenti.jsonl'), JSON.stringify(appuntamento) + '\n');
  chiamata.log('📅 appuntamento', appuntamento);

  let sms = 'non inviato';
  const destinatario = chiamata.chiamante;
  if (CONFIG.inviaSms && twilioConfigurato() && destinatario && destinatario.startsWith('+') && destinatario !== CONFIG.twilio.numero) {
    try {
      await inviaSms(destinatario, testoSms(argomenti));
      sms = 'inviato';
    } catch (e) {
      chiamata.log('⚠️ SMS non partito:', e.message);
      sms = 'errore';
    }
  }
  chiamata.log('✉️ SMS', sms);
  return { ok: true, appuntamento: 'registrato', sms: sms === 'inviato' ? 'inviato' : 'in coda, arriva a momenti' };
}

async function inviaSms(a, testo) {
  const { accountSid, apiKey, apiSecret, numero } = CONFIG.twilio;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: numero, To: a, Body: testo }),
  });
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

export async function chiamaNumero(a, versione) {
  const { accountSid, apiKey, apiSecret, numero } = CONFIG.twilio;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: numero, To: a, Url: `${CONFIG.urlPubblico}/twilio/${process.env.SEGRETO}/voce?v=${versione}&uscita=1` }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${j.message}`);
  return j.sid;
}
