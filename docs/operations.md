# Operations

How the running app is looked after: backups, errors, clean-up and
updates. Everything here runs from GitHub Actions or from the owner's own
terminal; nothing needs a server of its own.

## Backups and restore drill

`backup.yml` runs every night at 03:00 UTC (and on demand from the Actions
tab). It dumps production's `public` and `drizzle` schemas with
`pg_dump` 18, fails if the dump is missing the main tables' data, encrypts
it with [age](https://age-encryption.org) to the owner's public key, and
keeps it as a workflow artifact for 30 days. The repository is public, so
only the encrypted file ever leaves the runner, and the logs show its size
and nothing else.

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
4. Make a scratch branch:
   `neonctl branches create --project-id withered-hill-17786740 --name restore-drill-<date>`.
5. Get its URL: `neonctl connection-string restore-drill-<date> --project-id withered-hill-17786740`.
6. Restore over it:
   `pg_restore --clean --if-exists --no-owner --no-acl --single-transaction -d "<url>" backup.dump`.
7. Check it: `pnpm restore:check "<url>"`. Expect "restore looks whole",
   and counts close to production's (production may have changed since).
8. Clean up: `neonctl branches delete restore-drill-<date> --project-id withered-hill-17786740`
   and delete `backup.dump`.

### A real restore

Follow the drill into a fresh branch, check it, then make that branch the
project's primary branch in the Neon console and point
`DATABASE_URL`/`MIGRATION_DATABASE_URL` at it (Vercel env and GitHub
secrets). Redeploy by re-running the latest `deploy` workflow.
