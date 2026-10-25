# Migrations held back from production

A migration here is built and tested but not live yet: CI's database tests run these after
`supabase/migrations` (`scripts/test-db.sh`), and deploys never apply them (`scripts/ops/migrate.mjs`
only reads `supabase/migrations`). Keep the feature that needs it switched off in `src/app/features.ts`.

To switch it on: move the file into `supabase/migrations` and turn the feature on, in one pull request.
The merge queue gives it the next free number, and the deploy after it lands applies it.

- `20261031000073_tips.sql`: the Tips page (`FEATURES.tips`).
