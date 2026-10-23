# Music on social posts — plan

Goal: when an admin plans a story or reel in **Social planner**, the composer offers music the way
Instagram does: suggested tracks pop up, you pick one, choose the part of the song, set the
volume, preview it on the photo or video, and it goes out with the post. Alongside that, the
business can **make its own tracks with AI** (ElevenLabs), paid per use.

Written 23 Oct 2026 against the live branch (`claude/easy-beans-architecture-plan-dknqka`).

**Status (23 Oct 2026): Phases 0–3 are built** on `claude/awesome-pasteur-vciu2c`, tested in unit,
database and browser (demo) tests. Phase 4 is not built: neither Instagram nor TikTok documents a
way to add their library music through the API (Phase 0 (d)). To switch it on for real:

1. Add the `ELEVENLABS_API_KEY` repository secret (an ElevenLabs Starter plan or higher, for
   commercial use), then run **Actions → Music check** once to hear the models and, if wanted, set
   `ELEVENLABS_MUSIC_MODEL`. With the key, the starter pack is made by itself once Instagram and
   Google Drive/OneDrive are connected (`MUSIC_STARTER=off` stops it).
2. Run **Actions → Deploy render service** once (needs Cloudflare Workers Paid, for Containers). It
   deploys `business-agent-render` and gives both Workers `RENDER_URL` and `RENDER_KEY`. Until then
   the composer offers *Add it in Instagram* instead of putting music into files.
3. Merge to the live branch: migration 62 runs on deploy, and the pricing page goes live with it.
4. On the first real paid track, check the invoice item on Stripe's dashboard (tested only against a
   fake Stripe so far).

## Decisions (23 Oct 2026)

| Topic | Decision |
|---|---|
| AI music | **ElevenLabs Music API** |
| How it's paid for | **Pay per use**: €0.99 a track (up to 60 seconds, two versions to choose from), on any paid plan, billed monthly with the plan |
| Free uses | **Business** (the top plan) includes **1 free AI track every month**. Starter and Pro pay for each one. Free can't make AI tracks. |
| Free option | Music on stories and reels from the starter pack, the business's own uploads or Instagram's library (by reminder), with suggestions, choosing the part and mixing. On **every plan** at no charge. |
| Putting music into the file | A **Cloudflare Container** running ffmpeg (the recommended way, below) |
| Stock catalogue (Epidemic Sound, Artlist…) | Not now. AI tracks and the business's own uploads cover it; revisit only if customers ask |

## Phase 0 results (23 Oct 2026)

| Check | Result |
|---|---|
| (a) Putting music into the file | **Works.** `render/` is the service: `ffmpeg.ts` (the recipes, unit-tested), `server.ts` (the container), `worker.ts` (the Cloudflare Worker in front, with the key). The container image was built and run here at half a CPU (`--cpus 0.5`, like `standard-1`): a 15 s photo story in 8 s, a 60 s one in 12 s, music mixed into a 12 s H.264 reel in 1.7 s, an iPhone HEVC video in 1.2 s (copied, tagged `hvc1`), a 4-photo 30 s reel cut to the beat in 25 s. Every file is 1080×1920 (or the video's own size), H.264/HEVC + AAC 44.1 kHz stereo, `faststart`, exactly the length asked (a 60 s story is 1,800 frames, never longer). A photo is encoded once as a 1-second clip and then copied, which made a 60 s story 9× faster than encoding every frame. Posting a rendered file to the test Instagram account happens on the first real use, after **Actions → Deploy render service**. |
| (b) ElevenLabs | **API confirmed** from the reference: `POST /v1/music?output_format=mp3_44100_128`, `xi-api-key` header, `prompt`, `music_length_ms` (3,000–600,000), `model_id` (`music_v1` default, `music_v2`, `music_v2_5`), `force_instrumental`. `worker/providers/elevenlabs.ts` calls it; refused prompts are never charged. Listening to it needs our key: **Actions → Music check** makes the same three café prompts on two models (about $0.30) for choosing `ELEVENLABS_MUSIC_MODEL`. |
| (c) Stripe | **Confirmed** from the reference: an invoice item with `customer`, `amount`, `currency` (our pinned API version, 2024-06-20) goes on the subscription's next invoice by itself; `pending_invoice_item_interval: {interval: month}` (set on the subscription) bills pending items monthly for yearly subscribers. Tested with a fake Stripe in `worker/socialMusic.test.ts`; no test charge was made from here. |
| (d) Platform music through the API | **Not confirmed.** Meta's Content Publishing guide and IG User Media reference, and TikTok's Direct Post reference, have no way to attach library music (checked 23 Oct 2026). Phase 4 is not built; revisit when either platform documents it. |

## Where we start

- `shared/social.ts`: four kinds of post (post, carousel, reel, story). Reels and stories go to
  Instagram only. The story hint says music is added "in the Instagram app"
  (`SocialPlannerPage.tsx`, Composer: *"Add stickers, music or a link in the Instagram app (choose
  Remind me)"*).
- `worker/providers/instagram.ts` `publish()`: one container per photo or video, then
  `media_publish`. No audio options are sent.
- `worker/providers/tiktok.ts`: photo posts only, already with `auto_add_music: true` (TikTok picks
  the music).
- `worker/media.ts`: JPEG, MP4 and MOV only, kept in the café's Drive or OneDrive (or R2) under
  `Business Agent/Social/<folder>` and handed out at signed `/media/…` addresses that the
  networks fetch from.
- `src/lib/media.ts`: photos are made ready in the browser (JPEG, 1440 px, feed crop) before upload.
- The Music page (Spotify, YouTube Music) plays music **in the venue**. Those tracks can't be used
  in posts (see Licensing).
- Billing (`docs/billing.md`, `worker/billing.ts`): one Stripe subscription per business, monthly
  or yearly. Nothing is charged per use yet.

## What the platforms allow

| | In the app | Through the API (what we can automate) |
|---|---|---|
| Instagram reel | Music library, choose the part, mix with original sound | Upload a video with the music already in it. `audio_name` names the reel's sound (once). Meta's reference says music tagging is for original audio only. |
| Instagram story | Music sticker, choose the part | Upload a photo or video (story video 3–60 s, up to 100 MB). No audio options. |
| Instagram post / carousel | Music on photos | None. |
| TikTok photo post | Sound picker | `auto_add_music` only (TikTok chooses). |
| TikTok video | Sound picker, Commercial Music Library for business accounts | The app doesn't post TikTok videos yet. |

Two unconfirmed reports to check before relying on them (Phase 0):

- **Instagram audio for reels through the API.** Third-party scheduling tools say Meta opened part
  of the Instagram audio library to apps in May 2026: search, then attach an audio id to a reel,
  with separate volumes for the music and the original sound. They say it only works for accounts
  connected **with Facebook Login** (we use Instagram Login), only for reels, and only for tracks
  cleared for third-party use. I could not find this in Meta's own reference or changelog.
- **TikTok Commercial Music Library through the API** for video posts (`song_clip_id`). Same
  situation: vendor pages only, nothing on developers.tiktok.com.

So the plan doesn't depend on either. **We put the music into the file ourselves** (works today,
for every network that takes video), and keep Instagram's own library for posts the owner
finishes in the app.

## How music gets onto a post

Three ways, all chosen from the same Music sheet in the composer:

1. **Mixed in by us** (reels and stories, posting automatically or by reminder). The track is mixed
   into the video, or a photo becomes a short video with the track. The networks get an ordinary
   MP4. Reels also get `audio_name`, e.g. "Easy Beans · Sunday Morning", so the sound carries the
   café's name when others reuse it.
2. **Added in Instagram** (any kind, reminder posts only). We save the song and the start time
   ("Bailando — from 0:45"). The reminder shows them with a **Copy song name** button.
   Instagram's library is the one people know, but business accounts only see its
   commercially licensed part, so a popular song may not be there.
3. **Instagram's audio library through the API** (reels, Phase 4). Only if Phase 0 confirms it.

Posts and carousels can only use way 2, or (Phase 3) **Turn into a reel with music**: the photos
become a reel, cut to the beat.

## What the composer does

### The pop-up (suggestions)

When the post is a story or a reel and a photo or video has been added, a strip appears under the
media, like Instagram's suggested music bar:

```
♫ Add music?   [▶ Sunday Morning · chill]  [▶ Café Terraza · acoustic]  [▶ Golden Hour · latin]   More…   ✨ Make one · €0.99
```

- Each chip plays a preview of its best part, over the post's photo or video.
- **More…** opens the Music sheet. **✨ Make one** opens it on *Create with AI*, filled in from
  the post. The chip shows what it costs: *Free this month* on Business while the free one is
  unused, otherwise *€0.99*. On Free it says *Paid plans* and leads to Billing.
- Closing the strip leaves the post without music. Nothing is added on its own.
- For a post or carousel the strip says *"Instagram adds music to photos only in its app"* and
  offers **Add it in Instagram** (switches to Remind me) or, from Phase 3, **Make it a reel**.

### The Music sheet

Full screen on phones (like the composer). It has a search box and these tabs:

| Tab | What's in it |
|---|---|
| For you | The ranked suggestions (below) |
| Browse | Moods (Chill, Upbeat, Acoustic, Lo-fi, Jazz, Latin, Summer, Festive…) and genres |
| Saved | Tracks the business starred, its uploads and the AI tracks it kept |
| Create with AI | Make a track for this post (pay per use) |
| In Instagram | Type the song and the start time, to add it in the app (reminders) |

Each track row shows its cover, title, artist (or *Made with AI*), length, ▶ preview, ☆ save, and
**Use**. Using a track that's already in the library never costs anything, AI-made ones included.

### Choosing the part

After **Use**:

- A waveform with a window the length of the clip, which you drag to choose the part. Videos use
  the video's length. Photo stories offer 5, 10, 15 (default), 30 or 60 seconds.
- **Best part** moves the window to the track's highlight (the loudest stretch, worked out once
  when the track is saved; for AI tracks made to length it's the start).
- A 9:16 preview plays the part on a loop over the photo (slow zoom) or video.
- **Mix**: music volume and original sound (videos only), fade in and fade out.
- **Sound name** (reels): defaults to "{business} · {track title}".

**Done** leaves a row in the composer: *♫ Sunday Morning · 0:45–1:00 · Change · Remove*.

The preview needs no rendering: the browser plays an `<audio>` element in step with the
`<video>`, at the chosen volumes.

### Saving

If music is mixed in and the file doesn't match the current choices yet, **Save** first shows
*"Adding the music…"* and renders it (below). The post's media becomes the rendered MP4. The
original photo or video is kept in `music.source_media`, so a later change re-renders from the
original and the music is never mixed in twice. What you previewed is what gets posted.

## Making tracks with AI (ElevenLabs, pay per use)

On the *Create with AI* tab:

- **Mood** chips, filled in from Brand → *Our sound* (new: up to five moods, plus moods to avoid).
- **Energy**: calm to lively. **Instruments**: acoustic guitar, Spanish guitar, piano, lo-fi beats,
  jazz trio, house… **Vocals** off by default.
- **Describe it** (optional), pre-filled from the caption, the kind of post and the time, e.g. *"Warm
  acoustic morning music for a specialty café in Marbella, coffee being poured"*.
- Length: the clip's length plus two seconds for the fade.
- The button says what it costs before anything happens: **Make 2 versions · Free (1 left this
  month)** on Business, otherwise **Make 2 versions · €0.99**.
- Preview both over the post, then **Keep** (saved to the library and used) or **Try again** (a
  new use, priced the same way).
- Artist names are refused with *"Describe the feel instead: AI music can't copy a real artist"*
  (ElevenLabs refuses these too). A refused prompt isn't charged.

The prompt is built by a plain function in `shared/music.ts` from the brand, post and choices, so
it costs nothing and is tested. The owner's own Claude can do more through the MCP tools (Phase 3).

**ElevenLabs** (`worker/providers/elevenlabs.ts`):

- `POST https://api.elevenlabs.io/v1/music` with the prompt and `music_length_ms` (3 s to 10 min).
  Two calls per use, one for each version. MP3 back, stored in `Business Agent/Social/Music`.
- Our ElevenLabs account must be on a paid plan (Starter or above: the Music API and commercial
  use need one), with usage-based billing switched on so it doesn't stop at the plan's allowance.
- The key is a GitHub secret, `ELEVENLABS_API_KEY`, copied to the Worker by
  `scripts/ops/worker-secrets.mjs` like the others. One ElevenLabs account serves every business;
  the business never sees it.
- Each kept track records its licence: ElevenLabs, model, prompt, the terms' address and date,
  and who made it. If a post is ever claimed, that record is the proof.

## Pricing and margin

ElevenLabs charges **$0.15 per minute** of music (API price page, Oct 2026). A use makes two
versions, each the clip's length plus two seconds. At about $1.16 to the euro:

| Clip | Audio made | ElevenLabs | Stripe (on the monthly invoice) | Our cost | Price | Margin |
|---|---|---|---|---|---|---|
| 15 s story | 34 s | €0.07 | ~€0.02 | ~€0.09 | €0.99 | **~91%** |
| 30 s reel | 64 s | €0.14 | ~€0.02 | ~€0.16 | €0.99 | **~84%** |
| 60 s story or reel | 124 s | €0.27 | ~€0.02 | ~€0.29 | €0.99 | **~71%** |

- **One use = one track up to 60 seconds.** A longer reel counts one use per started minute, so the
  margin never drops below ~71%. The composer shows the price before you press the button.
- Rendering in the container costs about a tenth of a cent a post and isn't charged.
- Business's free track costs us at most €0.29 a month, about 0.2% of its €129.
- **Why €0.99**: under a euro feels like a small extra rather than a purchase, and it is less than
  a single stock-music licence usually costs, with nothing monthly. It still clears ~70–90% after
  ElevenLabs and Stripe.
- Prices exclude VAT, like the plans. The price lives in `PAY_PER_USE` (`shared/plans.ts`): change
  it there and the pricing page, the composer and the charge all follow.

## Charging per use (Stripe)

Recommended: **Stripe invoice items on the business's existing subscription**. Every paid
business already has a Stripe customer and subscription, so nothing new is needed at checkout.

- **When a use succeeds** (both versions came back), the Worker adds an invoice item:
  `POST /v1/invoiceitems { customer, currency: 'eur', amount: 99, description: 'AI music track: Sunday Morning', metadata: { generation_id } }`,
  with the generation's id as the **idempotency key**, so a retry never charges twice. Failed or
  refused generations are never charged.
- Stripe adds pending invoice items to the next invoice by itself. **Yearly subscribers** would wait
  a year, so their subscription gets `pending_invoice_item_interval: { interval: 'month' }`: the
  uses go on a small invoice each month. That is what "billed monthly with your plan" on the
  pricing page means.
- **Free uses first**: the month's included use (Business: 1) is taken before anything is charged,
  counted per calendar month in the business's time zone.
- **Monthly spending limit**: €25 by default, changed by admins on the Billing page. At the limit,
  *Create with AI* says so and links there. Nobody gets a surprise bill.
- **Billing page**: *This month: 3 AI music tracks · 1 free · €1.98 so far*, with the list.
- **Free plan**: no subscription to charge, so *Create with AI* shows the price and **Upgrade**.
  Library tracks, uploads, mixing and Instagram reminders still work.
- **Complimentary accounts** (Founding account, Friends & family, no Stripe subscription): they get
  Business's free track each month. Beyond that, *Create with AI* says the month's free track is
  used, unless we raise their allowance by hand (`grant_ai_music(n)`, service role).
- **Payment problems**: when a paid plan isn't in force (`paymentProblem`), making AI tracks
  pauses like the other paid features. Tracks already made stay usable.
- **Why not the alternatives**: charging the card each time costs Stripe's fixed fee (~€0.25) on
  every €0.99. Stripe meters need an extra subscription item and the same billing interval as the
  plan. Prepaid credit packs add a top-up step. Invoice items ride on the invoice the business
  already pays.

## Where tracks come from

| Source | Cost to the business | Plans |
|---|---|---|
| **Starter pack**: about 40 short tracks across the moods, made by us with ElevenLabs under our own commercial account and shipped with the app, so *For you* isn't empty on day one | Free | All |
| **Uploaded** by the business (MP3 or M4A, up to 20 MB), with a required tick: *"We have the right to use this on social media"*, saved with the track | Free | All |
| **Instagram's library**, by name for reminders (way 2), or through the API later (way 3) | Free | All |
| **Made with AI** (ElevenLabs) | €0.99 a use; Business 1 free a month | Starter, Pro, Business |

Never from Spotify or YouTube Music: a streaming licence covers listening, not using the song in a
video.

## Suggestions: what "For you" ranks

`suggest(tracks, context)` in `shared/music.ts`, a pure function with tests:

- **Brand sound**: moods shared with Brand → *Our sound*. Moods to avoid rule a track out.
- **Occasion**: words in the caption, in English and Spanish (brunch/desayuno → morning acoustic;
  partido/match → upbeat; navidad/Christmas → festive; verano/playa/summer → latin, tropical;
  lluvia/rain → lo-fi jazz; nuevo/new menu → bright pop), plus that day's holiday from the
  calendar.
- **Time**: mornings calmer, evenings livelier (from `scheduled_at` in the café's time zone).
- **Fit**: the track is at least as long as the clip.
- **Starred and kept**: saved tracks and the business's own AI tracks get a lift.
- **What worked** (Phase 3, built): tracks on reels and posts with the most likes and comments
  (comments count twice), read from Instagram nightly into `social_posts.insights`
  (`syncMusicInsights` in `worker/socialMusic.ts`). Stories have no likes or comments Instagram
  shares, and their reach needs the `instagram_business_manage_insights` permission, which the app
  doesn't ask for, so stories don't count yet.
- **Fresh**: a track used in the last five posts goes down the list.

The strip always ends with **More music…**, **✨ Make one with AI** and **Add it in Instagram**.

## Rendering: putting the music into the file

**Decided: a Cloudflare Container running ffmpeg.** The Worker can't run ffmpeg itself.
Containers are generally available on the Workers Paid plan since April 2026. The rest of the flow
stays as it is: the result is stored with `storeMedia()` and served from `/media/…` like any upload.

```
composer ──POST /api/social/render──▶ Worker ──▶ RENDER container (ffmpeg)
  { source, track, start, seconds,     │          fetches both /media addresses,
    volumes, fades, kind }             │          returns the MP4
                                       └──▶ storeMedia(Stories|Reels) ──▶ PostMedia
```

- Photo story: a 1080×1920 video of the photo over a blurred fill of itself, with a slow zoom, the
  chosen part of the track, fades, H.264 + AAC, `faststart`.
- Video: the video stream is copied when it's already H.264. The original sound and the music are
  mixed at the chosen volumes (just the music if the video is silent), AAC, cut to the video's length.
- Same limits as today: 100 MB, stories up to 60 s, reels 3 s to 15 min.

Why not in the browser (WebCodecs, the `mediabunny` library)? It would avoid the container, but
AAC encoding (which Instagram needs) isn't available in every browser, and a long reel is slow on
a phone. Every post would come out the same on the container, from any device.

## Changes, file by file

All built as listed, with these differences: the library is read and changed by the app straight
through Supabase (RLS and migration 62's rules), so `worker/socialMusic.ts` only has `status`,
`generate` and `render`, plus the starter pack and the nightly insights; the charge is
`chargeAiMusic()` / `chargePendingAiMusic()`; the render service is its own Worker
(`render/wrangler.jsonc`, `business-agent-render`); the library opens from a **Music** button on
Social planner rather than a tab; the MCP tools need the Worker's settings, so `ToolContext` carries
`env` and `origin`.

| Where | Change |
|---|---|
| `shared/plans.ts` | **Done**: `PAY_PER_USE` (AI music, €0.99, Business 1 free a month), `perUsePrice()`, its rows in the comparison |
| `src/pages/marketing/plans.tsx`, `PricingPage.tsx` | **Done**: *Pay per use* on each paid plan's card (landing page and `/pricing`), a note under the cards, a *Pay per use* section in the comparison, a FAQ answer |
| `supabase/migrations/<next>_social_music.sql` | `music_tracks` (source, title, artist, `url`, `duration_s`, bpm, energy, moods, genre, vocals, `highlight_s`, waveform peaks, cover, licence, saved, hidden). `music_generations` (prompt, seconds, status, track ids, error, who, when, `free`, `price_cents`, `stripe_invoice_item`). `billing.ai_music_spend_limit_cents` (default 2500) and `billing.ai_music_extra_free` (comped allowance). `ai_music_quote()`: free left, price, room under the limit. `social_posts.music jsonb`. `social_post_rules()`: mixed-in music only on reels and stories; *in Instagram* only with Remind me; a scheduled automatic post with music must have its rendered file. `queue_due_social_posts` puts `audio_name` in the Instagram payload. RLS: admins. |
| `shared/types.ts` | `MusicTrack`, `PostMusic` (`mode: 'mixed' \| 'in_instagram'`, track, start, seconds, volumes, fades, `audio_name`, `source_media`, `rendered_for`), `SocialPost.music`, `AiMusicQuote` |
| `shared/social.ts` | `postProblem()` gets the same music rules as the trigger, with the same wording |
| `shared/music.ts` (new) | Moods, occasion words (en/es), `suggest()`, `aiPrompt()`, part-window clamping, `usesFor(seconds)` (one per started minute), `renderKey()` |
| `worker/media.ts` | Audio types (`audio/mpeg`, `audio/mp4`), a `Music` folder, `mp3`/`m4a` in `CONTENT_TYPE` |
| `worker/socialMusic.ts` (new) | Routes: list, search, star, upload, quote, generate, render |
| `worker/providers/elevenlabs.ts` (new) | `compose(prompt, ms)` → MP3 bytes |
| `worker/billing.ts` | `chargeUse()`: the Stripe invoice item (idempotent), `pending_invoice_item_interval` set on yearly subscriptions at checkout and in the nightly copy |
| `render/` (new) + `wrangler.jsonc` | Container image (ffmpeg and a small HTTP handler) and its binding |
| `worker/providers/instagram.ts` | `publish()` passes `audio_name` for reels |
| `src/pages/SocialPlannerPage.tsx` | Suggestion strip, music row, ♫ badge in list and calendar, music line on reminders. The Music sheet and part picker go in `src/components/MusicPicker.tsx`. |
| `src/pages/BillingPage.tsx` | This month's AI tracks and cost, the spending limit, *Pay per use* lines on the plan cards |
| `src/lib/media.ts` | Waveform peaks and highlight from an audio file (Web Audio), worked out once when a track is saved |
| `src/pages/BrandPage.tsx` | *Our sound*: moods, moods to avoid |
| `src/data/api.ts`, `supabaseApi.ts`, `demoApi.ts` | New calls. Demo mode gets six sample tracks, a fake render and a fake quote. |
| `src/i18n/es/…` | Spanish for every new string |
| `worker/tools.ts` | MCP tools (Phase 3): `suggest_music`, `make_music` (same quote and charge), `set_post_music` |
| `docs/INTEGRATIONS.md`, `docs/billing.md` | Setting up ElevenLabs and the render container; how pay per use is charged |

## Licensing rules (built into the app)

- Only tracks with a licence record can be used: AI-made, starter pack, or uploaded with the tick.
- The Music page's Spotify and YouTube Music connections are never offered as post music.
- AI prompts can't name artists.
- Uploads keep who confirmed the rights, and when.
- Instagram's own library is only used by name, inside Instagram (or through its API if it's
  confirmed), so Instagram's licence covers it.

## Phases

| Phase | Ships | Status |
|---|---|---|
| 0 Checks | (a) ffmpeg in a Container: a photo story and a video reel with music, posted to the test Instagram account with today's `publish()`. (b) ElevenLabs: the same 10 café prompts for quality and time, and the current model's commercial terms. (c) Stripe: an invoice item on a test subscription, monthly and yearly, lands on the next monthly invoice. (d) Meta and TikTok: official docs and App Review permissions for attaching library audio through the API. | Done (results above; listening and the real post need the keys) |
| 1 Library, AI and charging | Tables, audio storage, upload with rights tick, ElevenLabs generation, quote and charge, spending limit, Billing page usage, waveform and highlight, Brand *Our sound*, starter pack, a Music button on Social planner | Built |
| 2 Music in the composer | Suggestion strip, Music sheet, part picker, mix, preview, render on save, *in Instagram* for reminders, `audio_name`, badges, reminder line | Built |
| 3 Extras | Photos or a carousel made into a reel cut to the beat (*Make it a reel*); suggestions that learn from likes and comments; a "now playing" label on photo stories (*Show the song on the photo*); MCP tools `suggest_music`, `make_music`, `set_post_music` | Built |
| 4 Platform music through the API | Instagram reels with library audio (needs a Facebook Login connection next to today's Instagram Login), TikTok Commercial Music Library once TikTok video posting exists. Only if 0(d) confirms them. | Not built: not documented by either platform (23 Oct 2026) |

The pricing page lists AI music and music on stories and reels now. Merge it to the live branch
together with Phases 1 and 2, not before, so the site doesn't sell what isn't there yet.

## Tests

- `src/data/plans.test.ts` (**done**): pay per use is on every paid plan and not Free (the page says
  "any paid plan"), Business gets 1 free a month, the comparison rows match.
- `e2e/demo.spec.ts` pricing test (**done**): the table row, each card's *Pay per use* line, the note.
- `shared/music.test.ts` (**done**): ranking, occasion words in both languages, part windows, uses
  per started minute (a 60 s clip stays one use), prompt builder refusing artist names, beat cuts,
  recent tracks and engagement; `shared/social.test.ts`: `postProblem()` music and photo-reel rules.
- `supabase/tests/zz_social_music.test.sql` (**done**): trigger rules, free use first, spending
  limit, complimentary allowance.
- `worker/socialMusic.test.ts` (**done**): ElevenLabs with a fake `fetch`, the charge sent once per
  generation (idempotency) and never on failure, the render route with a fake container,
  `instagram.publish()` sending `audio_name`, the starter pack, the nightly insights, and the three
  MCP tools. `render/ffmpeg.test.ts` (**done**): the recipes, and real ffmpeg when it's installed.
- Browser, demo mode (**done**): our sound; the starter pack and Create with AI; pay per use on a
  paid plan; Story → add a photo → suggestions → choose the part → schedule → edit again; a song
  from Instagram's library becoming a reminder; a carousel made into a reel on the beat.

## Sources (checked 23 Oct 2026)

- ElevenLabs API pricing (Music $0.15 a minute; commercial use from Starter):
  <https://elevenlabs.io/pricing/api>
- ElevenLabs Music API: <https://elevenlabs.io/docs/api-reference/music/compose>
- Meta, IG User Media reference (`audio_name`; music tagging for original audio only; story and
  reel limits): <https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/>
- Reported Instagram audio through the API, unconfirmed by Meta:
  <https://noobclaw.com/blog/schedule-reels-trending-audio-api-2026/>,
  <https://bundle.social/instagram-music-api>
- TikTok Commercial Music Library through the API, unconfirmed by TikTok:
  <https://bundle.social/tiktok-commercial-music-library>,
  <https://zernio.com/blog/tiktok-developer-api>
- Cloudflare Containers GA: <https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/>
- Mediabunny: <https://mediabunny.dev/guide/introduction>
