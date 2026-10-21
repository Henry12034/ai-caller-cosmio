// Il server del receptionist: risponde a Twilio quando arriva una chiamata e la collega
// alla versione scelta (1 = la più veloce, 2 = la voce più realistica).
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { CONFIG, RADICE, twilioConfigurato } from './config.mjs';
import { ChiamataTwilio } from './twilio-stream.mjs';
import { gestisciV1, preriscalda as preriscaldaV1 } from './v1-realtime.mjs';
import { twimlV2, idAgente } from './v2-elevenlabs.mjs';
import { confermaAppuntamento, chiamaNumero } from './strumenti.mjs';
import { paginaPannello } from './pannello.mjs';

const segreto = process.env.SEGRETO || 'locale';
if (CONFIG.urlPubblico && !process.env.SEGRETO) console.warn('⚠️ Manca SEGRETO nel .env: il webhook e il pannello hanno un indirizzo facile da indovinare.');
const gettoni = new Map(); // gettone monouso → { versione, scade }
const fileStato = join(RADICE, 'registrazioni', 'stato.json');
let versioneAttiva = existsSync(fileStato) ? JSON.parse(readFileSync(fileStato, 'utf8')).versioneAttiva : CONFIG.versioneAttiva;

function nuovoGettone(versione) {
  const g = randomBytes(12).toString('hex');
  gettoni.set(g, { versione, scade: Date.now() + 60000 });
  return g;
}

const xml = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

async function leggiCorpo(req) {
  let s = '';
  for await (const c of req) s += c;
  return s;
}

async function twimlV1({ callSid, cliente, altro, inUscita, host }) {
  // in entrata aspettiamo che il saluto sia pronto (il telefono intanto squilla);
  // in uscita il cliente ha già risposto, quindi niente attesa
  const attesa = preriscaldaV1(callSid, cliente, inUscita ? 0 : 3500);
  if (!inUscita) await attesa;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${xml(host)}/media/1/${nuovoGettone('1')}">
      <Parameter name="from" value="${xml(cliente)}"/>
      <Parameter name="to" value="${xml(altro)}"/>
    </Stream>
  </Connect>
</Response>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (codice, o) => { res.writeHead(codice, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    // Twilio: è arrivata (o è partita) una chiamata → rispondi con le istruzioni TwiML
    if (req.method === 'POST' && url.pathname === `/twilio/${segreto}/voce`) {
      const p = Object.fromEntries(new URLSearchParams(await leggiCorpo(req)));
      const versione = url.searchParams.get('v') || versioneAttiva;
      const inUscita = url.searchParams.get('uscita') === '1';
      const cliente = inUscita ? p.To : p.From;
      const numeroTwilio = inUscita ? p.From : p.To;
      console.log(`📞 ${p.CallSid} ${inUscita ? 'in uscita verso' : 'da'} ${cliente} → versione ${versione}`);
      const host = CONFIG.urlPubblico ? new URL(CONFIG.urlPubblico).host : req.headers.host;
      const twiml = versione === '2'
        ? await twimlV2({ cliente, numeroTwilio, inUscita })
        : await twimlV1({ callSid: p.CallSid, cliente, altro: numeroTwilio, inUscita, host });
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      return res.end(twiml);
    }

    // ElevenLabs (versione 2): l'agente conferma l'appuntamento → registra e manda l'SMS
    if (req.method === 'POST' && url.pathname === `/strumenti/${segreto}/conferma`) {
      const a = JSON.parse(await leggiCorpo(req) || '{}');
      const finta = { chiamante: a.telefono, versione: '2', log: (...x) => console.log('v2', ...x.map((y) => (typeof y === 'string' ? y : JSON.stringify(y)))) };
      return json(200, await confermaAppuntamento(a, finta));
    }

    // Pannello: scegli la versione che risponde e fatti chiamare
    if (url.pathname === `/pannello/${segreto}`) {
      if (req.method === 'POST') {
        const p = Object.fromEntries(new URLSearchParams(await leggiCorpo(req)));
        let messaggio = '';
        if (p.versione === '1' || p.versione === '2') {
          versioneAttiva = p.versione;
          writeFileSync(fileStato, JSON.stringify({ versioneAttiva }));
          messaggio = `Ora risponde la versione ${versioneAttiva}.`;
        }
        if (p.chiama) {
          try {
            const sid = await chiamaNumero(p.chiama.replace(/\s+/g, ''), p.versioneChiamata || versioneAttiva);
            messaggio = `Ti sto chiamando (${sid}).`;
          } catch (e) { messaggio = `Chiamata non partita: ${e.message}`; }
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(paginaPannello({ versioneAttiva, messaggio, twilio: twilioConfigurato(), v2Pronta: Boolean(CONFIG.elevenKey && idAgente()), numero: CONFIG.twilio.numero }));
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(paginaPannello({ versioneAttiva, twilio: twilioConfigurato(), v2Pronta: Boolean(CONFIG.elevenKey && idAgente()), numero: CONFIG.twilio.numero }));
    }

    if (req.method === 'GET' && url.pathname === '/salute') {
      return json(200, { ok: true, versioneAttiva, twilio: twilioConfigurato(), elevenlabs: Boolean(CONFIG.elevenKey), agenteV2: Boolean(idAgente()) });
    }

    res.writeHead(404);
    res.end();
  } catch (e) {
    console.error(e);
    // Se qualcosa va storto, chi chiama sente un messaggio invece del silenzio.
    if (url.pathname.includes('/voce')) {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      return res.end('<?xml version="1.0" encoding="UTF-8"?><Response><Say language="it-IT">Ci scusi, al momento non riusciamo a rispondere. Riprovi tra poco.</Say></Response>');
    }
    res.writeHead(500);
    res.end();
  }
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const [, primo, versione, gettone] = new URL(req.url, 'http://x').pathname.split('/');
  const locale = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !req.headers['cf-connecting-ip'];
  const g = gettoni.get(gettone);
  const valido = (g && g.versione === versione && g.scade > Date.now()) || (locale && gettone === 'prova');
  if (primo !== 'media' || versione !== '1' || !valido) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    return socket.destroy();
  }
  gettoni.delete(gettone);
  wss.handleUpgrade(req, socket, head, (ws) => gestisciV1(new ChiamataTwilio(ws, versione)));
});

setInterval(() => { for (const [g, v] of gettoni) if (v.scade < Date.now()) gettoni.delete(g); }, 60000).unref();

server.listen(CONFIG.porta, () => {
  console.log(`Receptionist in ascolto sulla porta ${CONFIG.porta} — versione attiva: ${versioneAttiva}`);
});
