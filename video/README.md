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

## A day in the life

The second video (`public/video/day-in-the-life.mp4`, 112 seconds, `DayVideo` in `src/day/`), shown on the
landing page while `FEATURES.dayVideo` is on: a café owner's day before Business Agent, drawn (06:45 to 23:10:
the phone that never stops, a paper checklist, calls about stock, a chalk sign, a pile of bills, the laptop
at night, the letter about the terrace licence), the rewind, then the same day in the app (recorded by
`capture/day.mjs`: the opening checklist and the music on the phone, one inbox, the order written, the
last-day offer, the week's posts, bills paid and tax filed, the licence renewed in time, the closing
checklist), the two days side by side, and the brand. Its music is `music/day.py`.

```bash
npm run capture:day                  # the app's scenes for it (the dev server running)
npm run music:day
npm run render:day && npm run web:day
```

## Run your café from one place

The third video (`public/video/run-your-cafe.mp4`, 114 seconds, `OwnerVideo` in `src/owner/`), shown on the
Demos page while `FEATURES.ownerVideo` is on: how the owner uses the app in the café, one morning, from the two
places that say what to do. It's made to be easy to follow for any business owner: each of its four chapters is
made the same way (the advisor's tip, one click to the page, the change made once, then everywhere it shows).

| Time | Scene | What it shows |
|---|---|---|
| 0:00 | The title | "Run your café from one place." |
| 0:04 | The map | Today and the advisor in the middle; Google Maps, the website, Google reviews, the café TV, printed menus and Instagram round them |
| 0:10 | Today | The first page each morning: what's been taken, what's running low, the jobs, the advisor's first tip |
| 0:19 | The advisor | Everything it found, by area; then this morning's four things to do, the list the chapters follow |
| 0:32 | 1 Opening hours | "Closing an hour earlier could pay" → Sunday closes at 15:00 → Google Maps and the website |
| 0:48 | 2 Prices | "Some prices don't reach your margin" → Pain au chocolat to €2,90 on Menu costing → Google Maps, the café TV's menu board, the printed menu |
| 1:06 | 3 Offers | Leftover croissants on offer by themselves (the last-day rule), and the story drawn from it → the café TV, Instagram |
| 1:22 | 4 Reviews | "Reviews waiting for a reply" → a reply drafted in the review's language, posted → Google Maps |
| 1:38 | The close | Four changes, made once; the rest of the café in the same place; the brand |

The app's scenes are recorded by `capture/owner.mjs` (Square and Google Drive connected off camera, so the
advisor reads the takings and the story has somewhere to keep its picture); the café's TV is the app's own
screen link, recorded full screen, with the bakery added to its menu board off camera; the printed menu is the
app's print page. Google Maps, the website's opening hours and the phone round the story are drawn, as the other
videos' cards are. The advisor's hours tip comes from the demo's takings, whose last hour on Sundays is quiet.
Its music is `music/owner.py`.

```bash
npm run capture:owner                # the app's scenes for it (the dev server running)
npm run music:owner
npm run render:owner && npm run web:owner
```

## Just say it

The fourth video (`public/video/just-say-it.mp4`, 106 seconds, `SayVideo` in `src/say/`), shown on the Demos
page while `FEATURES.sayVideo` is on: Business Agent used from the owner's own AI, added once as a custom
connector, then typed to or talked to, whichever suits; each change lands in the app at once and goes on to
everywhere it shows. Each of its two changes is made the same way (what's asked, the AI calling Business Agent
through the connector, its answer, then where it shows), and it ends on the question.

| Time | Scene | What it shows |
|---|---|---|
| 0:00 | The title | "Just say it." Type it or say it, the way it comes to you |
| 0:04 | Connect it once | The AI's settings, Connectors: add a custom connector (Easy Beans Coffee, the app's `/mcp` address), connect, sign in as Aron. Works in Claude, ChatGPT or any AI with connectors; acts as you; every change logged as made via AI |
| 0:16 | Typed | At the counter: "We're closing at 3 on Sundays from now on." → *Update business details* → Business Agent's opening hours, Google Maps, the website |
| 0:40 | Said | On the phone, the microphone: "Put two for one on croissants from one o'clock today, on the café TV." → *Save an offer* → Business Agent's Offers & specials, the café TV |
| 1:04 | Ask it anything | Who's working on Saturday, which licences run out, last week's hours: said or typed, each answered through the connector |
| 1:20 | The usual way | Six places and fifteen minutes, or one sentence and ten seconds |
| 1:30 | The close | "How much is your time worth?", and Business Agent coming in under it: it ends on both |

All of it is drawn: the AI's chat (not a picture of any one app; the tools it calls are the connector's own,
`worker/tools.ts` and `worker/offerTools.ts`), the app's pages, Google Maps, the website and the TV, as the
other videos' cards are. It needs no recordings. Its music, and the key and microphone sounds, are
`music/say.py`.

```bash
npm run music:say
npm run render:say && npm run web:say
```

## Don't bin it. Sell it.

The fifth video (`public/video/food-waste.mp4`, 90 seconds, `WasteVideo` in `src/waste/`), played on the Sales
page's food waste card (`/sell/cafes`, its `film` in `src/pages/marketing/salesPlaybook.ts`): food waste, and how
the app turns it into sales. Easy Beans in demo mode, with its sample data.

| Time | Scene | What it shows |
|---|---|---|
| 0:00 | The title | "Don't bin it. Sell it." |
| 0:04 | Closing time | 18:00, what's left on the counter (banana bread, pain au chocolat, croissants) goes in the bin: €33,40 tonight |
| 0:18 | 1 Log it once | Stock → Freshly made → Record a batch: banana bread × 12, keeps 3 days, 50% off from a day before the end, on the screens. Recorded, with its offer |
| 0:38 | Two days later | The calendar turns to Friday; nobody touches a thing; on its last day it's on offer by itself |
| 0:44 | 2 On offer by itself | Its card says "On offer now: 50% off", and Offers & specials has it live, €2,00 instead of €4,00, on the counter TV |
| 0:56 | 3 On the café TV | The TV's own recording: the banana bread's offer in its slideshow |
| 1:08 | Sold, not binned | The same tray without the app (7 sold, 5 in the bin, €28,00) and with it (the 5 sold at half price, €38,00): +€10,00 from one tray |
| 1:22 | The close | The brand |

The app's scenes are recorded by `capture/waste.mjs`: off camera, banana bread goes on the menu at €4,00 (so its
offer has a price to cross out) and the demo's sample batches are sold out (so the counter has only the new one);
then the batch is logged on camera, and the page's clock is moved on two days (Playwright's clock), nothing else.
The TV is the window slideshow's own screen link, recorded full screen after the same steps. Closing time, the
calendar and the two trays are drawn, with the demo's prices. Its music, a clock under closing time and the days
going by, is `music/waste.py`.

```bash
npm run capture:waste                # the app's scenes for it (the dev server running)
npm run music:waste
npm run render:waste && npm run web:waste
```

## Right on Google.

The sixth video (`public/video/google-listing.mp4`, 72 seconds, `ListingVideo` in `src/listing/`), played on the
Sales page's Google reviews & opening hours card: the café's opening hours and its reviews, each changed once in
the app, and Google Maps and the website following. Its two chapters are made as the owner video's are (its
`Chapter`, `MapsHours`, `WebsiteHours` and `MapsReview`), from recordings of their own.

| Time | Scene | What it shows |
|---|---|---|
| 0:00 | The title | "Right on Google. Every time." |
| 0:04 | Sunday, 15:30 | Google Maps on a phone says open until four, as the hours were; the door says closed; Tom's two-star review has no reply |
| 0:16 | 1 Opening hours | Sunday closes at 15:00, saved once, Google Maps kept in step → Google Maps and the website, "Updated" |
| 0:34 | 2 Reviews | Tom's review, the reply drafted in his language, posted → Google Maps, "Response from the owner" |
| 0:52 | The listing, right | The same phone: closed when it says, the review answered |
| 1:04 | The close | The brand |

The app's scenes are recorded by `capture/listing.mjs` (Square and Google Drive connected off camera, as for the
owner video). The phone's Google Maps listing and the door are drawn. Its music is `music/listing.py`.

```bash
npm run capture:listing              # the app's scenes for it (the dev server running)
npm run music:listing
npm run render:listing && npm run web:listing
```

## Know your competition.

The seventh video (`public/video/competitors.mp4`, 88 seconds, `CompetitorsVideo` in `src/competitors/`), played on the
Sales page's "Not knowing the competition" card (`/sell/cafes`): competitor insights, on the Competitors page
(Marketing). Easy Beans in demo mode, with its five made-up places round San Pedro de Alcántara
(`src/data/demoCompetitors.ts`), so no real business is shown with invented prices or ratings.

| Time | Scene | What it shows |
|---|---|---|
| 0:00 | The title | "Know your competition. Every week." |
| 0:04 | The street | Easy Beans and the five places round it, the owner's guesses on a sticky note (a €2,90 cappuccino, too dear? who opens before us?); then a new café opens 150 m away and nobody says |
| 0:16 | 1 At a glance | Five followed, the nearest 180 m away, prices against the area, the highest Google rating; then What it means for you, in plain words |
| 0:32 | 2 Prices | The cappuccino at every place, €2,90 against the street's €2,70, yours in purple; the croissant; every price rise nearby in the last 90 days |
| 0:50 | 3 New nearby | Google looks around every week; Nuevo Rincón Café, new, 150 m away, followed, and in Places with the others |
| 1:08 | The street, known | The same street with every place's rating, the new café followed, and what the owner gets |
| 1:20 | The close | The brand |

The app's scenes are recorded by `capture/competitors.mjs`, nothing set up off camera: the demo already has the places,
their prices and the weekly look around. The street and the sticky note are drawn. Its music is `music/competitors.py`
(the listing video's instruments, to its own bars).

```bash
npm run capture:competitors          # the app's scenes for it (the dev server running)
npm run music:competitors
npm run render:competitors && npm run web:competitors
```

## Bring them back.

The eighth video (`public/video/regulars.mp4`, 94 seconds, `RegularsVideo` in `src/regulars/`), played on the Sales
page's "Customers who never come back" card (`/sell/cafes`): bringing regulars back on the quiet days, with Customers,
Loyalty & gift cards, Campaigns and Competitions. Easy Beans in demo mode, the till (Square) connected off camera, so the
stamp card is there and the takings say which day is quiet: Mondays, 36% under the average day.

| Time | Scene | What it shows |
|---|---|---|
| 0:00 | The title | "Bring them back. On the quiet days." |
| 0:04 | A quiet Monday | The week's takings by day, a rush on Saturday, Monday 36% down; the regulars the owner knows by their order, with no number or email for any of them |
| 0:16 | 1 Your regulars | Customers searched for "regular": three, all said yes to marketing; then the stamp card from the till, its 40 members and when each last came in |
| 0:34 | 2 A message | Campaigns' ready-made quiet-day boost, to the customers tagged regular who said yes (3), how Pablo gets it, planned for Monday 14 Dec at 10:00 with a reminder; saved, in the list |
| 0:56 | 3 A draw | Competitions' Mondays draw, from the takings; its prize, how to enter, the bases legales and the post, written; saved |
| 1:14 | Monday, ten o'clock | The message on a regular's phone, and what the owner gets |
| 1:26 | The close | The brand |

The app's scenes are recorded by `capture/regulars.mjs`. Until Brevo or Mailchimp is on Connections, Campaigns doesn't
send by itself: it writes the message, picks who it goes to, reminds you on the day and exports the list to send. So
the film plans the message, and the phone it reaches is drawn, with the campaign's own words. The week's takings and
the notebook are drawn too. Its music is `music/regulars.py`.

```bash
npm run capture:regulars             # the app's scenes for it (the dev server running)
npm run music:regulars
npm run render:regulars && npm run web:regulars
```

Everything is made here from scratch, so it can be made again whenever the app changes, and in Spanish.

## How it's made

1. **Recordings** (`capture/`): Playwright drives the app in demo mode (the Easy Beans sample data, the
   clock fixed at Wednesday 9 December 2026, 09:55 in Madrid) and the café's live website, and records
   Chrome's own screencast at 1.5× (2160 × 1350, about 35 fps) into constant-30fps MP4s in
   `public/clips/`, each with a JSON log of where every click landed. A cursor is drawn into the page;
   the demo's own banner is hidden. A few stills for the cards are cut from the recordings into
   `public/stills/`. Both folders are made by the capture and aren't kept in git.
2. **Music and sound** (`music/compose.py`, its instruments in `music/synth.py`): an original 120 bpm track written in code (numpy), so
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
