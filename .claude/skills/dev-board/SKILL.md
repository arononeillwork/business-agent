---
name: dev-board
description: Opens the Feature board, the owner's kanban of every feature from development through review & merge, deploying and live, and says in a few lines what needs the owner. Use for /dev-board, or when asked for the feature board, dev board, feature status, or what's in progress, waiting to merge, deploying or live.
---

# Feature board

The board is a claude.ai dashboard: https://claude.ai/artifact/GRDA4CrD6doezGej8dS6Pg

It shows every feature branch in four columns (In development, Review & merge, Deploying,
Deployed) and three lanes (Needs you, On track, Parked), named from its commits. Its data is
one row, `ops.dev_board`, in the BusinessAgent Supabase project
(`lhakrmmoxaareykglmtx`), written by `.github/workflows/dev-board.yml` (`scripts/ops/dev-board.mjs`)
after every CI and Deploy run starts or finishes, and every 20 minutes.

1. Open it: the Artifact tool with `action: "open"` and the link above. Without that tool, give
   the link.
2. Read the latest board with the Supabase connector's `execute_sql` on project
   `lhakrmmoxaareykglmtx`. Without that connector, or without access to the project, stop
   here: the board itself shows everything, once its owner has shared it with you.

   ```sql
   select d.data->>'generatedAt' as board_at, b->>'stage' as stage, b->>'title' as title,
          b->>'deploy' as deploy, b->'ci'->>'state' as ci, b->'merged'->>'at' as merged_at
   from ops.dev_board d cross join lateral jsonb_array_elements(d.data->'branches') b
   where d.id = 1 and (b->>'stage' <> 'deployed' or (b->'merged'->>'at')::timestamptz > now() - interval '14 days')
   ```
3. Answer in five lines at most: how many are in each stage, then each thing that needs the
   owner by its title: a deploy whose tests, deploy or live checks failed (`deploy` is
   `tests_failed`, `deploy_failed` or `checks_failed`), a branch whose tests fail (`ci` is
   `failed`), and work that is built but not merged. Point to the board for the rest.
4. If `board_at` is more than an hour old, say so. The GitHub tool `actions_run_trigger`
   (`run_workflow`, workflow `dev-board.yml`, ref `main`) brings it up to date in about a minute.
