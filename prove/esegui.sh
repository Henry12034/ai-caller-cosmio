#!/usr/bin/env bash
# Avvia il server con le impostazioni passate come variabili d'ambiente, fa una chiamata
# simulata e spegne il server. Uso: V1_MODELLO=gpt-realtime prove/esegui.sh <etichetta> [versione] [copione]
cd "$(dirname "$0")/.."
etichetta="${1:-prova}"
versione="${2:-1}"
copione="${3:-base}"
mkdir -p prove/out
node src/server.mjs > "prove/out/server-$etichetta.log" 2>&1 &
winpid=$(cat /proc/$!/winpid)
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:5050/salute && break; sleep 0.25; done
if grep -q EADDRINUSE "prove/out/server-$etichetta.log"; then echo "porta 5050 occupata"; exit 1; fi
timeout 260 node prove/finto-twilio.mjs "http://127.0.0.1:5050/twilio/locale/voce?v=$versione" "$etichetta" "$copione" 2>&1 | grep -E "⏱|RITARDI|medio|webhook|chiuso"
taskkill //PID "$winpid" //F > /dev/null 2>&1
echo "----- server"
grep -E "🤖|👤|⏱|🔧|✂|errore|fallita" "prove/out/server-$etichetta.log"
