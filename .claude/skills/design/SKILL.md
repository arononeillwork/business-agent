---
name: design
description: Pulls up the designs for Business Agent (claude.ai design canvases), grouped by label such as onboarding, the complete view of the site, and the café view. Use for /design, /design <label>, or when asked to show, open, list, find or label the designs, mockups or screens for the site.
---

# Designs

The designs are claude.ai Design canvases. Which ones belong to the site, and under which labels,
is kept in `designs.json` next to this file:

- `labels`: each label's key, its title and what belongs under it. The starting ones are
  `onboarding`, `site` (complete view of the site) and `cafe` (café view). Add more as needed.
- `designs`: one entry per canvas, with its `url`, its `labels` (one or more), what it shows
  (`about`) and, once built, the pull request that built it (`built`).

## /design (no label): everything, grouped

1. Read `designs.json`.
2. List the account's canvases: the Artifact tool, `action: "list"`, `type: "Design"`. Any canvas
   there that isn't in `designs.json` is new. Ask whether it belongs to the site and under which
   label; add it to the file if the owner says so.
3. Answer with one short section per label, in the file's order. Each section has the label's
   title, then each design as a link with a line on what it shows. A design with several labels
   appears under each one. A label with nothing yet says so in one line, and offers to make a
   design for it. Unlabelled canvases come last, under "Not labelled yet".
4. If there is exactly one design in total, open it (the Artifact tool, `action: "open"`).

## /design <label>: open that label's designs

- Match the label by its key or title, loosely: "onboarding", "setup" → `onboarding`;
  "site", "complete", "whole site", "all pages" → `site`; "café", "cafe", "Easy Beans" → `cafe`.
- Open each of its designs (`action: "open"`) and list them with their links.
- No match: show the labels there are, and ask which one was meant.
- A label with no designs yet: say so and offer to make one.

## Labelling

- To label, relabel or add a design (`/design label <link> <label>`, or "put this under café"):
  - edit `designs.json`;
  - create a new label when asked, with a short key, a title and one line on what it holds.
- Whenever a new design canvas is made for this site, add it to `designs.json` with its labels in
  the same change.
- Changing `designs.json` is a change to the repo: it goes on a branch and through a pull request,
  like any other (see CLAUDE.md).

## Making a design for a label

- Ask what it should show if the label alone doesn't make that clear.
- Build it as a claude.ai Design canvas (the Artifact tool's design flow).
- Then add it to `designs.json` under the label.
- For `site` and `cafe`, start from the real app rather than invent screens. Run it in demo mode
  (`npm run dev`, then `/?demo`), whose sample data is the Easy Beans café, and work from there.
