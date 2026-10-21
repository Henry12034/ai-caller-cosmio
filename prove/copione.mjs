// Le battute del cliente nelle prove automatiche. Il receptionist parla per primo,
// poi il cliente dice queste frasi una alla volta, aspettando che lui finisca.
export const COPIONI = {
  // lo stesso percorso del video originale
  base: [
    'Buongiorno! Volevo sapere se avete posto per un appuntamento.',
    'Le nove vanno benissimo.',
    'Marco Rossi.',
    "Un'Alfa Romeo Giulia del duemiladiciannove.",
    "Allora: devo fare il tagliando, cambiare le pastiglie dei freni davanti, mi si è accesa la spia del motore, il clima non fa più freddo... e già che ci siete controllatemi tutti i liquidi.",
    'Sì è tutto.',
    'No no, a posto così. Grazie mille!',
  ],
  // il cliente scorbutico che chiede se è un robot (come rude_caller dell'originale)
  scorbutico: [
    'Pronto. Avete un buco per un appuntamento o siete messi male come sembra?',
    'Solo martedì? Ma che officina è che ha libero un giorno solo?',
    'Vabbè. Le nove.',
    "Marco Rossi. Sei un po' simpaticone tu, eh?",
    'Ma aspetta un attimo... sto parlando con un robot?',
    "Vabbè, va bene uguale. Un'Alfa Romeo Giulia del duemiladiciannove.",
    'Tagliando, pastiglie davanti, la spia del motore accesa, il clima che non va, e controllate i liquidi.',
    'Sì, è tutto.',
    'No, a posto.',
  ],
  // fuori copione, con domande difficili (come una vera chiamata di prova del 21/10)
  improvvisato: [
    'Sì, buongiorno. Ho fatto un incidente con la macchina e mi si è staccata una gomma. Cosa posso fare?',
    'No, la macchina me la sono già fatta portare a casa. Però dovrei portarla da voi per sistemarla.',
    'Ma prima mi racconti meglio di voi: mi posso fidare? Non è che mi fate un prezzo alto?',
    'Avete un esempio di quanto hanno speso altri clienti per una cosa simile alla mia?',
    'Ok. Mi dà il sito, così ci guardo e poi prenoto?',
    'Vorrei pensarci un attimo. A che numero posso richiamare?',
    'Va bene, grazie. Ci sentiamo.',
  ],
  // il cliente che dice tutto subito, in disordine (come service_first dell'originale)
  disordine: [
    "Buongiorno, sono Marco Rossi, ho un'Alfa Giulia del duemiladiciannove e devo fare il tagliando. Quando potete prendermi?",
    'Non avete proprio niente prima?',
    'Va bene, alle undici e mezza.',
    'Ah, e più o meno quanto viene?',
    'Ok. Sì, solo il tagliando, è tutto.',
    'No, nient\'altro, grazie.',
  ],
};
export const COPIONE = COPIONI.base;
