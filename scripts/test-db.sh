#!/usr/bin/env bash
# Runs the migrations and SQL tests against a scratch Postgres database.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=business_agent_test
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }
run supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do run "$f"; done
# Held back from production, still tested (supabase/pending/README.md).
for f in supabase/pending/*.sql; do if [ -e "$f" ]; then run "$f"; fi; done
# The feature tests run with every feature on; billing.test.sql switches plans itself.
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "select public.grant_complimentary('founder', 'Test café')"
for f in supabase/tests/*.test.sql; do echo "== $f"; run "$f"; done
echo "All database tests passed"
