#!/usr/bin/env bash
# One-time (re-runnable) setup of production on Google Cloud Run, used while
# the Vercel account is blocked. See docs/operations.md, "Hosting".
#
#   bash scripts/cloudrun-setup.sh <gcp-project-id>
#
# Needs: gcloud signed in as the project's owner, gh signed in, and a
# gitignored .env.secrets in the repo root with
#   DATABASE_URL=        Neon main branch, pooled connection string
#   OWNER_EMAIL=         the Google account that owns the app
#   GOOGLE_CLIENT_ID=
#   GOOGLE_CLIENT_SECRET=
#   ANTHROPIC_API_KEY=
#   SENTRY_DSN=          optional
#   BETTER_AUTH_SECRET=  optional: the one Vercel had, if you saved it
# It makes a new BETTER_AUTH_SECRET and Web Push key pair on the first run
# (Vercel won't reveal the old ones) and keeps them on later runs. Prints no
# secret values.
set -euo pipefail

PROJECT=${1:?usage: cloudrun-setup.sh <gcp-project-id>}
REGION=us-east4 # northern Virginia, next to Neon's aws-us-east-1
SERVICE=life-goals
REPO=Halvadar-secondary/personal-app
cd "$(dirname "$0")/.."
FNM_NODE=/c/Users/Halvadar/AppData/Roaming/fnm/node-versions/v24.22.1/installation
[ -d "$FNM_NODE" ] && export PATH="$FNM_NODE:$PATH"

[ -f .env.secrets ] || { echo "Missing .env.secrets (see the top of this script)." >&2; exit 1; }
set -a; . ./.env.secrets; set +a
for v in DATABASE_URL OWNER_EMAIL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET ANTHROPIC_API_KEY; do
  [ -n "${!v:-}" ] || { echo "$v is empty in .env.secrets." >&2; exit 1; }
done

g() { gcloud --project "$PROJECT" --quiet "$@"; }

echo "== APIs"
g services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  iam.googleapis.com cloudresourcemanager.googleapis.com
NUM=$(g projects describe "$PROJECT" --format='value(projectNumber)')
URL="https://$SERVICE-$NUM.$REGION.run.app"

echo "== Image repository (keeps the 3 newest images)"
g artifacts repositories describe app --location "$REGION" >/dev/null 2>&1 ||
  g artifacts repositories create app --repository-format=docker --location "$REGION"
POLICY=$(mktemp)
cat > "$POLICY" <<'JSON'
[
  {"name": "keep-newest", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 3}},
  {"name": "delete-rest", "action": {"type": "Delete"}, "condition": {"tagState": "ANY"}}
]
JSON
g artifacts repositories set-cleanup-policies app --location "$REGION" \
  --policy "$POLICY" --no-dry-run >/dev/null
rm -f "$POLICY"

echo "== Service accounts"
RUN_SA="life-goals-run@$PROJECT.iam.gserviceaccount.com"
DEPLOY_SA="github-deploy@$PROJECT.iam.gserviceaccount.com"
g iam service-accounts describe "$RUN_SA" >/dev/null 2>&1 ||
  g iam service-accounts create life-goals-run --display-name "Life Goals app"
g iam service-accounts describe "$DEPLOY_SA" >/dev/null 2>&1 ||
  g iam service-accounts create github-deploy --display-name "GitHub Actions deploy"
g projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$DEPLOY_SA" \
  --role roles/run.developer --condition=None >/dev/null
g artifacts repositories add-iam-policy-binding app --location "$REGION" \
  --member "serviceAccount:$DEPLOY_SA" --role roles/artifactregistry.writer >/dev/null
g iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --member "serviceAccount:$DEPLOY_SA" --role roles/iam.serviceAccountUser >/dev/null

echo "== GitHub sign-in (Workload Identity: main branch of $REPO only)"
g iam workload-identity-pools describe github --location global >/dev/null 2>&1 ||
  g iam workload-identity-pools create github --location global --display-name GitHub
g iam workload-identity-pools providers describe github-oidc --location global \
  --workload-identity-pool github >/dev/null 2>&1 ||
  g iam workload-identity-pools providers create-oidc github-oidc --location global \
    --workload-identity-pool github --issuer-uri https://token.actions.githubusercontent.com \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository == '$REPO' && assertion.ref == 'refs/heads/main'"
g iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" >/dev/null
PROVIDER="projects/$NUM/locations/global/workloadIdentityPools/github/providers/github-oidc"

echo "== Secrets"
has() { g secrets describe "$1" >/dev/null 2>&1; }
put() { # put <name> <value>: a new version only when the value changed
  if has "$1"; then
    [ "$(g secrets versions access latest --secret "$1")" = "$2" ] && return
    printf %s "$2" | g secrets versions add "$1" --data-file=- >/dev/null
  else
    printf %s "$2" | g secrets create "$1" --replication-policy automatic --data-file=- >/dev/null
  fi
  g secrets add-iam-policy-binding "$1" --member "serviceAccount:$RUN_SA" \
    --role roles/secretmanager.secretAccessor >/dev/null
  echo "set $1"
}
put database-url "$DATABASE_URL"
put google-client-secret "$GOOGLE_CLIENT_SECRET"
put anthropic-api-key "$ANTHROPIC_API_KEY"
NEW_KEYS=0
# The old one if you still have it (keeps MCP signing keys readable), else new.
has better-auth-secret || put better-auth-secret "${BETTER_AUTH_SECRET:-$(openssl rand -base64 32)}"
if ! has vapid-private-key; then
  KEYS=$(node -e "process.stdout.write(JSON.stringify(require('web-push').generateVAPIDKeys()))")
  field() { printf %s "$KEYS" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s)['$1']))"; }
  put vapid-public-key "$(field publicKey)"
  put vapid-private-key "$(field privateKey)"
  NEW_KEYS=1
fi
put vapid-subject "$URL"

echo "== Service"
ENVS="APP_ENV=production,BETTER_AUTH_URL=$URL,OWNER_EMAIL=$OWNER_EMAIL,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
SECRETS="DATABASE_URL=database-url:latest,BETTER_AUTH_SECRET=better-auth-secret:latest"
SECRETS+=",GOOGLE_CLIENT_SECRET=google-client-secret:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest"
SECRETS+=",VAPID_PUBLIC_KEY=vapid-public-key:latest,VAPID_PRIVATE_KEY=vapid-private-key:latest"
SECRETS+=",VAPID_SUBJECT=vapid-subject:latest"
# Free tier: no instance kept warm, at most two, CPU only while answering.
# 15 minutes covers the longest chat turn.
SHAPE=(--region "$REGION" --service-account "$RUN_SA" --min-instances 0 --max-instances 2
  --cpu 1 --memory 512Mi --timeout 900 --cpu-boost --port 8080
  --set-env-vars "$ENVS" --set-secrets "$SECRETS")
if g run services describe "$SERVICE" --region "$REGION" >/dev/null 2>&1; then
  g run services update "$SERVICE" "${SHAPE[@]}" >/dev/null
else
  # A placeholder until the first deploy from GitHub Actions.
  g run deploy "$SERVICE" --image us-docker.pkg.dev/cloudrun/container/hello \
    --allow-unauthenticated "${SHAPE[@]}" >/dev/null
fi

echo "== GitHub variables"
gh variable set HOST --body cloudrun
gh variable set GCP_PROJECT_ID --body "$PROJECT"
gh variable set GCP_REGION --body "$REGION"
gh variable set GCP_SERVICE --body "$SERVICE"
gh variable set GCP_WIF_PROVIDER --body "$PROVIDER"
gh variable set GCP_DEPLOY_SA --body "$DEPLOY_SA"
gh variable set PROD_URL --body "$URL"
[ -n "${SENTRY_DSN:-}" ] && gh variable set SENTRY_DSN --body "$SENTRY_DSN"
# The evening reminder (remind.yml) signs pushes with the same keys.
if [ "$NEW_KEYS" = 1 ]; then
  g secrets versions access latest --secret vapid-public-key | gh secret set VAPID_PUBLIC_KEY --env production
  g secrets versions access latest --secret vapid-private-key | gh secret set VAPID_PRIVATE_KEY --env production
fi
printf %s "$URL" | gh secret set VAPID_SUBJECT --env production

echo
echo "Done. Production address: $URL"
