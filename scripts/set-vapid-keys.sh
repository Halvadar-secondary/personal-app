#!/usr/bin/env bash
# Makes a new Web Push key pair for the evening reminder and stores it where
# it's used: GitHub's production environment (the scheduled sender) and
# Vercel production (the app). Prints no key values. Run from anywhere:
#   bash scripts/set-vapid-keys.sh
# Then redeploy (merge to main) so the app picks the keys up.
set -euo pipefail

cd "$(dirname "$0")/.."
FNM_NODE=/c/Users/Halvadar/AppData/Roaming/fnm/node-versions/v24.22.1/installation
[ -d "$FNM_NODE" ] && export PATH="$FNM_NODE:$PATH"

KEYS=$(node -e "process.stdout.write(JSON.stringify(require('web-push').generateVAPIDKeys()))")
field() {
  printf %s "$KEYS" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s)['$1']))"
}
PUB=$(field publicKey)
PRIV=$(field privateKey)
SUBJ=https://halvadar-life-goals.vercel.app
if [ ${#PUB} -ne 87 ] || [ ${#PRIV} -ne 43 ]; then
  echo "Key generation failed (lengths ${#PUB} ${#PRIV}); nothing was stored." >&2
  exit 1
fi
echo "Generated a key pair."

printf %s "$PUB" | gh secret set VAPID_PUBLIC_KEY --env production
printf %s "$PRIV" | gh secret set VAPID_PRIVATE_KEY --env production
printf %s "$SUBJ" | gh secret set VAPID_SUBJECT --env production

printf %s "$PUB" | pnpm dlx vercel@latest env add VAPID_PUBLIC_KEY \
  --environment production --force --yes
printf %s "$PRIV" | pnpm dlx vercel@latest env add VAPID_PRIVATE_KEY \
  --environment production --sensitive --force --yes
printf %s "$SUBJ" | pnpm dlx vercel@latest env add VAPID_SUBJECT \
  --environment production --force --yes
unset KEYS PUB PRIV

echo
echo "Vercel production now has:"
pnpm dlx vercel@latest env ls production | grep VAPID
