---
name: dev-board
description: Opens the Feature board, the owner's overview of every feature of the app (working, needs setting up, or switched off, and the keys and connections each needs) and of the work in progress through review & the merge queue, deploying and live, and says in a few lines what needs the owner. Use for /dev-board, or when asked for the feature board, dev board, feature status, what a feature needs, which keys to set up, or what's in progress, in the merge queue, deploying or live.
---

# Feature board

The board is a claude.ai dashboard: https://claude.ai/artifact/GRDA4CrD6doezGej8dS6Pg

A toggle at the top switches between two views. Overview: every feature of the app at a glance (a
tile each, by area), then a card each: working, needs setting up or switched off, and what it needs
(connections, app keys, switches) with a tick where it's in place; at the bottom, every key and
connection, whether it's set up, and the features that need it. What each feature needs is
`ops/features.json`. Development: every branch and change in one of six stages (To do, In
development, Code review, Deploy ready, Deploying, Live), with what it waits on and what needs the
owner. Its data is one row, `ops.dev_board`, in the BusinessAgent Supabase
project (`lhakrmmoxaareykglmtx`), written by `.github/workflows/dev-board.yml`
(`scripts/ops/dev-board.mjs`) after every CI, merge queue and Deploy run starts or finishes, and
every day at 9:00 and 18:00 in Spain.

1. Open it: the Artifact tool with `action: "open"` and the link above. Without that tool, give
   the link.
2. Read the latest board with the Supabase connector's `execute_sql` on project
   `lhakrmmoxaareykglmtx`. Without that connector, or without access to the project, stop
   here: the board itself shows everything, once its owner has shared it with you.

   ```sql
   select d.data->>'generatedAt' as board_at, b->>'stage' as stage, b->>'title' as title,
          b->>'deploy' as deploy, b->'ci'->>'state' as ci, b->'pr'->>'queue' as queue,
          b->'pr'->>'url' as pr_url, b->>'headDate' as head_date, b->'merged'->>'at' as merged_at
   from ops.dev_board d cross join lateral jsonb_array_elements(d.data->'branches') b
   where d.id = 1 and (b->>'stage' <> 'deployed' or (b->'merged'->>'at')::timestamptz > now() - interval '14 days')
   ```

   And the features that need setting up, with what's missing:

   ```sql
   select f->>'name' as feature, f->>'status' as status,
          (select string_agg(n->>'label', ', ') from jsonb_array_elements(f->'needs') n
           where (n->>'met')::boolean is false and not (n->>'optional')::boolean) as missing
   from ops.dev_board d cross join lateral jsonb_array_elements(d.data->'catalogue') f
   where d.id = 1 and f->>'status' = 'setup'
   ```
3. Answer in five lines at most: how many are in each stage, how many features need setting up
   (each by name, with what's missing), then each thing that needs the owner by its title:
   - a deploy whose tests, deploy or live checks failed (`deploy` is `tests_failed`,
     `deploy_failed` or `checks_failed`);
   - a pull request the merge queue stopped (`queue` is `conflict`, `failed`, `blocked` or `hold`);
   - a branch whose tests fail (`ci` is `failed`);
   - work that's built, with nothing pushed for two hours, but has no pull request yet.

   Point to the board for the rest.
4. If `board_at` is more than 12 hours old, say so. The GitHub tool `actions_run_trigger`
   (`run_workflow`, workflow `dev-board.yml`, ref `main`) brings it up to date in about a minute.
