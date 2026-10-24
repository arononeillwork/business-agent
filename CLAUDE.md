# Working on Business Agent

Several Claude sessions work on this repo at the same time. These rules keep them from colliding;
the merge queue does the merging, testing and deploying, so no session waits on another.

## How a change gets to the live app

1. **Start from the latest `main`.** `main` is the live app. Work on your own branch (the one your
   session was given is fine), made from `origin/main`. One feature per branch. Never work on, push to
   or merge into `main`. `claude/easy-beans-architecture-plan-dknqka` is retired: it no longer deploys.
2. **Push to your branch as often as you like.** CI runs the typecheck, unit and database tests and the
   browser tests for what you touched.
3. **When the feature is done and CI on your branch is green, open a pull request into `main`**, not a
   draft. The owner asks for this standing: open it without asking. Its title becomes the merge
   commit's ("Merge #12: Stock page"), so write it the way the commit log reads. A draft pull
   request is fine for work that isn't finished; the queue leaves drafts alone.
4. **The merge queue does the rest** (`.github/workflows/merge-queue.yml`):
   - It merges `main` into a candidate together with the other ready pull requests.
   - It settles conflicts where both sides only added lines.
   - It renumbers migrations whose number another branch took.
   - It runs every test on the result, moves `main` to it and deploys.

   Don't merge other feature branches into yours to combine them; open a pull request each.
5. **Watch your pull request until it's merged** (subscribe to its activity). The queue comments when
   it needs you; a push to the branch puts it back in the queue, nothing else needed:
   - *Conflicts with main*: `git fetch origin main && git merge origin/main`, resolve the files it
     names, run the checks, push.
   - *Tests failed*: open the run it links, fix on your branch, push.
   - *Blocked*: it says why. Usually an edited or duplicate migration, or a workflow change while
     the `QUEUE_TOKEN` secret isn't set.
6. Once merged, the branch is deleted. More work on the same feature: a new branch from `main` and a
   new pull request.

Before opening the pull request, and after resolving a conflict: `npm run typecheck && npm test`, plus
`npm run test:db` if you changed SQL (needs a Postgres; see the README).

## Database migrations

- **A new migration** is a new file `supabase/migrations/<YYYYMMDD><NNNNNN>_<name>.sql`:
  - today's date;
  - the next number after the highest on `main`;
  - a name no other migration uses.

  If another branch lands the same number first, the queue renumbers yours, and the "migration NN"
  mentions you wrote along with it. Don't renumber by hand.
- **Never change or delete a migration that's on `main`**; production already ran it. Put the change
  in a new migration. The queue refuses pull requests that do either.
- **Never apply migrations to the live Supabase project** (`lhakrmmoxaareykglmtx`) yourself, with the
  Supabase connector or anything else. Deploy applies the new ones, matched by name, just before the
  Worker goes out (`scripts/ops/migrate.mjs`). So a migration must also work with the code that's
  live at that moment:
  - add tables and columns freely;
  - remove or rename one only in a later change, once nothing uses it.
- In comments, name the migration you mean ("the `customers` migration") rather than its number.

## Keeping conflicts small

Most pages add lines to the same few files:

- `src/App.tsx` (the route) and `src/app/AppShell.tsx` (the menu)
- `src/data/api.ts`, `src/data/demoApi.ts` and `src/data/supabaseApi.ts`
- `e2e/demo.spec.ts` and `scripts/ci/select-e2e.ts`
- `README.md`

What settles by itself is two branches each *adding* lines, or adding items to the same one-line list.
What needs a person is two branches *changing* the same line. In those files:

- Add what you need; don't move, rename or reformat lines you aren't otherwise changing.
- Keep prose (README, docs) in its own new paragraph rather than rewording an existing one.
