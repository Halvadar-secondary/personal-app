# Operations

How the running app is looked after: backups, errors, clean-up and
updates. Everything here runs from GitHub Actions or from the owner's own
terminal; nothing needs a server of its own.

## Backups and restore drill

`backup.yml` runs every night at 03:00 UTC (and on demand from the Actions
tab). It dumps production's `public` and `drizzle` schemas with
`pg_dump` 18, restores the dump into a throwaway Postgres 18 on the runner
and runs the same check as the drill below (one owner, some areas, every
migration), so a backup that can't be restored or holds no data fails the
run. It then encrypts it with [age](https://age-encryption.org) to the owner's public key, and
keeps it as a workflow artifact for 30 days. The repository is public, so
only the encrypted file ever leaves the runner, and the logs show row counts
and the file size, nothing else.

Neon's own point-in-time restore covers "undo the last few hours". The
nightly backup is for losing the database, the Neon project or the account.

### One-time setup (owner)

1. Install age (`winget install FiloSottile.age`, `brew install age`).
2. Make a key pair and keep it offline, in your password manager:
   `age-keygen -o life-goals-backup.key`. The file holds the private key;
   the line `# public key: age1…` is the public one.
3. Give GitHub the **public** key only:
   `gh variable set BACKUP_AGE_RECIPIENT --body "age1…"`.
4. Run the workflow once: `gh workflow run backup.yml`, then
   `gh run watch`.

Lose the private key and every backup is unreadable. Keep two copies.

### Restore drill (do it once now, then a few times a year)

Needs `age`, `neonctl` (signed in) and PostgreSQL 18 client tools.

1. Pick a run: `gh run list --workflow backup.yml`.
2. Download it: `gh run download <run-id> -n life-goals-backup-<date>`.
3. Decrypt:
   `age -d -i life-goals-backup.key -o backup.dump life-goals-<date>.dump.age`.
4. Make a scratch branch with a new, **empty** database in it. Restoring
   over a copy of production would hide anything the backup is missing.
   `neonctl branches create --project-id withered-hill-17786740 --name restore-drill-<date>`
   then
   `neonctl databases create --project-id withered-hill-17786740 --branch restore-drill-<date> --name drill`.
5. Get its URL:
   `neonctl connection-string restore-drill-<date> --project-id withered-hill-17786740 --database-name drill`.
6. Restore into it. A new database has its own `public` schema, and the
   dump brings one:
   `psql "<url>" -c "drop schema public"`, then
   `pg_restore --no-owner --no-acl --exit-on-error --single-transaction -d "<url>" backup.dump`.
7. Check it: `pnpm restore:check "<url>"`. Expect "restore looks whole",
   and counts close to production's (production may have changed since).
8. Clean up: `neonctl branches delete restore-drill-<date> --project-id withered-hill-17786740`
   and delete `backup.dump`.

### A real restore

Follow the drill into a fresh branch, check it, then make that branch the
project's primary branch in the Neon console and point
`DATABASE_URL`/`MIGRATION_DATABASE_URL` at its `drill` database (Vercel env and GitHub
secrets). Redeploy by re-running the latest `deploy` workflow.

## Errors (Sentry)

Browser, server and MCP errors go to Sentry, in production only (only
production has a DSN). Events are scrubbed before they leave the app: no
cookies, request bodies, query strings, auth headers or user details, so goal
titles and search terms stay out of Sentry. No performance tracing and no
session replay. Reports reach Sentry through the app's own `/monitoring`
route, so the CSP stays same-origin. `deploy.yml` uploads source maps so
stack traces show the original TypeScript; builds without the token skip it.

### One-time setup (owner)

1. In Sentry, create a project with platform **Next.js**. Note the org slug,
   project slug and the DSN.
2. `vercel env add NEXT_PUBLIC_SENTRY_DSN production` and paste the DSN.
3. Create an auth token (Settings → Auth Tokens, scope
   `project:releases` + `org:read`) and pipe it in:
   `gh secret set SENTRY_AUTH_TOKEN` (paste at the prompt).
4. `gh variable set SENTRY_ORG --body <org-slug>` and
   `gh variable set SENTRY_PROJECT --body <project-slug>`.
5. Redeploy (re-run the latest `deploy` workflow).

### Check it works

Signed in on production, open `/api/debug/error`. Within a minute Sentry
shows "Sentry test error", environment `production`, release = the commit
sha, and a stack trace pointing at `src/app/api/debug/error/route.ts`.

## Purge of deleted items

Deleting anything in the app is a soft delete, so it can be undone from
History. `purge.yml` runs every Sunday at 04:00 UTC (after that night's
backup) and permanently removes rows deleted more than 90 days ago, together
with the History entries that name them. A deleted item that something live
still points at is kept until a later run. Undoing a change older than that
may refuse with "Something changed since", because what it would restore is
gone. Run it by hand with `gh workflow run purge.yml`; the log shows counts
only.

## Dependency updates (Renovate)

`renovate.json` asks Renovate for one weekly batch (Monday before 6am UTC)
of non-major updates, plus a monthly lockfile refresh. New releases wait 3
days first. Patch updates merge on their own once the required checks pass
(branch protection on `main`); minor and major updates wait for review.
Better Auth packages and Next.js each move as one group. Node majors are
off: Node 24 is pinned by `engines` and `.nvmrc`.

One-time setup (owner): install the [Renovate GitHub
App](https://github.com/apps/renovate) on this repository only. Its first
PR ("Configure Renovate") confirms it sees `renovate.json`; merge it.
