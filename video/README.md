# The landing page video

The 108-second demo on the landing page (`public/video/business-agent-demo.mp4`, shown by
`src/pages/marketing/DemoVideo.tsx` while `FEATURES.demoVideo` is on). Easy Beans Coffee, in the real app
and on its own website, each page shown whole:

| Time | Scene | What it shows |
|---|---|---|
| 0:00 | 18:00 | "Your café closed at three. But you're still working." To-do lists, phone reminders and the same change in app after app pile up; the 1-star review when one's missed |
| 0:10 | The turn | "What if you changed it in one place?" Business Agent |
| 0:14 | Onboarding | The set-up guide, unzoomed and slow: a ready-made setup, each kind of business, the café's apps, five connected one by one, all set |
| 0:42 | Opening hours | Closed on Sundays; the calendar with the bank holidays already in; Christmas added as a closure, then up close; then the change drawn out to Google Maps, the café's website and the team's calendar |
| 1:04 | Menu & prices | Flat White goes to €3.80 on the till (Square); the till, the café TV, the website's click & collect and Google Maps all show it |
| 1:16 | The team | Maria clocks in on her phone; the owner's day at a glance; the Business advisor: "Make data-driven decisions for your business" |
| 1:36 | The close | 18:00 back to 15:30: "Closed at three. Home by half past." "How much is your time worth?" Your entire business in one place. Less admin, more enjoyment. |

Everything is made here from scratch, so it can be made again whenever the app changes, and in Spanish.

## How it's made

1. **Recordings** (`capture/`): Playwright drives the app in demo mode (the Easy Beans sample data, the
   clock fixed at Wednesday 9 December 2026, 09:55 in Madrid) and the café's live website, and records
   Chrome's own screencast at 1.5× (2160 × 1350, about 35 fps) into constant-30fps MP4s in
   `public/clips/`, each with a JSON log of where every click landed. A cursor is drawn into the page;
   the demo's own banner is hidden. A few stills for the cards are cut from the recordings into
   `public/stills/`. Both folders are made by the capture and aren't kept in git.
2. **Music and sound** (`music/compose.py`): an original 120 bpm track written in code (numpy), so
   there's no licence to buy or keep: a quiet clock, once a second, under 18:00, warm chords on "What if you changed
   it once?", an uplifting groove under the product, drums out for "How much is your time worth?", and
   home on the logo. Plus soft clicks, pings, pops, a whoosh and a chime. Mastered to -17 LUFS.
3. **The video** (`src/`, [Remotion](https://www.remotion.dev)): the scenes as React components over a
   fixed timeline (`src/timeline.ts`, every scene on a bar line of the music). The recordings play in a
   browser window or a phone, cut and sped up; the camera zooms onto each logged click; the cards that
   show the change elsewhere (Google Maps, the website, the calendar, the till) are drawn or cut from the
   stills. Fonts: Fraunces, Figtree and Caveat (the handwriting) from `public/fonts` (SIL Open Font Licence).
4. **For the web** (`web.mjs`): H.264 at CRF 23 with the index first (about 9 MB), and the poster.

```bash
npm run dev                          # in the repo root: the app at http://127.0.0.1:5173
```

```bash
cd video && npm install
npm run capture                      # all scenes, or: npm run capture -- hours menu
npm run music                        # needs python3 with numpy and scipy, and ffmpeg
npm run studio                       # preview and edit in Remotion Studio
npm run render && npm run web        # out/landing-master.mp4, then public/video/
```

The capture reads `https://www.easybeanscoffee.com` for the website scenes; behind a proxy it uses
`HTTPS_PROXY`. Remotion uses the cloud sessions' preinstalled Chrome headless shell when it's there
(`remotion.config.ts`), or fetches its own.

## Things to know

- **Remotion's licence**: free for individuals and companies of up to 3 people; a company of 4 or more
  needs a [company licence](https://www.remotion.dev/docs/license).
- **What the video claims**: the app's scenes are recorded, not mocked. The website and its click &
  collect read the till's menu themselves. The Google Maps menu card shows the menu reaching Google,
  as the Menu page's "Google Maps is kept in step" does. The till, and the opening's to-dos and
  notifications, are drawn: not photos of any brand's hardware or apps.
- The Remotion agent skill is in `.claude/skills/remotion-best-practices` (from
  `remotion-dev/skills`): sessions working here load it for Remotion's API.
