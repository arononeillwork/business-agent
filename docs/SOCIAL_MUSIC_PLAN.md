# Music on social posts — plan

Goal: when an admin plans a story or reel in **Social planner**, the composer offers music the way
Instagram does: suggested tracks pop up, you pick one, choose the part of the song, set the
volume, preview it on the photo or video, and it goes out with the post. Alongside that, the
business can **make its own tracks with AI**, shaped by its brand and the post.

Written 23 Oct 2026 against the live branch (`claude/easy-beans-architecture-plan-dknqka`).
Nothing here is built yet.

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
- No AI model is called from the Worker today. Claude reaches the app through the MCP connector
  (`worker/mcp.ts`, `worker/tools.ts`).

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
♫ Add music?   [▶ Sunday Morning · chill]  [▶ Café Terraza · acoustic]  [▶ Golden Hour · latin]   More…   ✨ Make one
```

- Each chip plays a preview of its best part, over the post's photo or video.
- **More…** opens the Music sheet. **✨ Make one** opens it on *Create with AI*, filled in from
  the post.
- Closing the strip leaves the post without music. Nothing is added on its own.
- For a post or carousel the strip says *"Instagram adds music to photos only in its app"* and
  offers **Add it in Instagram** (switches to Remind me) or, from Phase 3, **Make it a reel**.

### The Music sheet

Full screen on phones (like the composer). It has a search box and these tabs:

| Tab | What's in it |
|---|---|
| For you | The ranked suggestions (below) |
| Browse | Moods (Chill, Upbeat, Acoustic, Lo-fi, Jazz, Latin, Summer, Festive…) and genres |
| Saved | Tracks the business starred |
| Create with AI | Make a track for this post |
| In Instagram | Type the song and the start time, to add it in the app (reminders) |

Each track row shows its cover, title, artist (or *Made with AI*), length, ▶ preview, ☆ save, and
**Use**.

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

## Making tracks with AI

On the *Create with AI* tab:

- **Mood** chips, filled in from Brand → *Our sound* (new: up to five moods, plus moods to avoid).
- **Energy**: calm to lively. **Instruments**: acoustic guitar, Spanish guitar, piano, lo-fi beats,
  jazz trio, house… **Vocals** off by default.
- **Describe it** (optional), pre-filled from the caption, the kind of post and the time, e.g. *"Warm
  acoustic morning music for a specialty café in Marbella, coffee being poured"*.
- Length: the clip's length plus two seconds for the fade.
- **Make 2 versions**, preview them over the post, then **Keep** (saved to the library and used)
  or **Try again**. A counter shows the monthly allowance: *7 of 30 this month*.
- Artist names are refused with *"Describe the feel instead: AI music can't copy a real artist"*
  (the providers refuse these too).

The prompt is built by a plain function in `shared/music.ts` from the brand, post and choices,
so it costs nothing and is tested. The owner's own Claude can do more through the MCP tools
(Phase 3).

**Provider.** Write it behind one interface (`worker/providers/musicAi.ts`:
`generate({ prompt, seconds, instrumental }) → audio bytes`), and choose in Phase 0 from:

| | Why | Watch |
|---|---|---|
| ElevenLabs Music (`POST /v1/music`) | One API key. Exact lengths from 3 s to 10 min. Commercial use on paid plans. | Music API needs a paid plan; confirm the v2 model terms |
| Google Lyria 3 (Vertex AI / Gemini API) | 30-second clips, about $0.04 each on Vertex; instrumental mode | Needs a Google Cloud project and billing; check output rights |
| Stable Audio 2.5 | Trained on licensed music | Check per-generation price and terms |

Each track keeps its licence record: provider, model, prompt, terms link and date, and who made
it. If a post is ever claimed, that record is the proof.

## Where tracks come from

1. **Made with AI** (above): the business has the rights under the provider's paid terms.
2. **Starter pack**: about 40 short tracks across the moods, made by us with the chosen AI provider
   under our own commercial account and shipped with the app, so *For you* isn't empty on day
   one.
3. **Uploaded** by the business (MP3 or M4A, up to 20 MB), with a required tick: *"We have the
   right to use this on social media"*. The tick is saved with the track.
4. **Stock catalogue** (Phase 3, only after a commercial agreement): Epidemic Sound, Artlist or
   Soundstripe behind the same `MusicSource` interface. Ordinary "royalty-free" licences usually
   don't cover handing tracks to *our* customers inside an app, so this needs a partner deal.
5. **Instagram's library**: by name for reminders (way 2), or through the API later (way 3).

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
- **Starred**: saved tracks get a lift.
- **What worked** (Phase 3): tracks on posts with the most reach, from Instagram insights.
- **Fresh**: a track used in the last five posts goes down the list.

If fewer than three tracks score well, the strip's last chip becomes **✨ Make one for this post**.

## Rendering (putting the music into the file)

The Worker can't run ffmpeg, so a small **Cloudflare Container** does. Containers are generally
available on the Workers Paid plan since April 2026. The rest of the flow stays as it is: the
result is stored with `storeMedia()` and served from `/media/…` like any upload.

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

Doing this in the browser instead with WebCodecs (the `mediabunny` library) would avoid the
container. But AAC encoding isn't available in every browser, and a long reel is slow on a phone.
Keep it as a later option for short photo stories.

## Changes, file by file

| Where | Change |
|---|---|
| `supabase/migrations/<next>_social_music.sql` | `music_tracks` (source, title, artist, `url`, `duration_s`, bpm, energy, moods, genre, vocals, `highlight_s`, waveform peaks, cover, licence, saved, hidden). `music_generations` (prompt, provider, model, seconds, status, track ids, error, who, when) for the allowance and audit. `social_posts.music jsonb`. `social_post_rules()`: mixed-in music only on reels and stories; *in Instagram* only with Remind me; a scheduled automatic post with music must have its rendered file. `queue_due_social_posts` puts `audio_name` in the Instagram payload. Allowance checked in SQL like posts per month. RLS: admins. |
| `shared/types.ts` | `MusicTrack`, `PostMusic` (`mode: 'mixed' \| 'in_instagram'`, track, start, seconds, volumes, fades, `audio_name`, `source_media`, `rendered_for`), `SocialPost.music`. |
| `shared/social.ts` | `postProblem()` gets the same music rules as the trigger, with the same wording. |
| `shared/music.ts` (new) | Moods, occasion words (en/es), `suggest()`, `aiPrompt()`, part-window clamping, `renderKey()` (the hash of the choices). |
| `shared/plans.ts` + migration | `aiTracksPerMonth` (suggested Free 0, Starter 5, Pro 30, Business 100). `plans.test.ts` keeps them matched. |
| `worker/media.ts` | Audio types (`audio/mpeg`, `audio/mp4`), a `Music` folder, `mp3`/`m4a` in `CONTENT_TYPE`. |
| `worker/music.ts` or new `worker/socialMusic.ts` | Routes: list, search, star, upload, generate, render. |
| `worker/providers/musicAi.ts` (new) | The chosen AI provider. Its key becomes a GitHub secret copied by `scripts/ops/worker-secrets.mjs`. |
| `render/` (new) + `wrangler.jsonc` | Container image (ffmpeg and a small HTTP handler) and its binding. |
| `worker/providers/instagram.ts` | `publish()` passes `audio_name` for reels. |
| `src/pages/SocialPlannerPage.tsx` | Suggestion strip, music row, ♫ badge in list and calendar, music line on reminders. Split the Music sheet and part picker into `src/components/MusicPicker.tsx`. |
| `src/lib/media.ts` | Waveform peaks and highlight from an audio file (Web Audio), worked out once when a track is saved. |
| `src/pages/BrandPage.tsx` | *Our sound*: moods, moods to avoid. |
| `src/data/api.ts`, `supabaseApi.ts`, `demoApi.ts` | New calls. Demo mode gets six sample tracks and a fake render. |
| `src/i18n/es/…` | Spanish for every new string. |
| `worker/tools.ts` | MCP tools (Phase 3): `suggest_music`, `make_music`, `set_post_music`. |
| `docs/INTEGRATIONS.md` | Setting up the AI music key and the render container. |

## Licensing rules (built into the app)

- Only tracks with a licence record can be used: AI-made, starter pack, uploaded with the tick, or
  a stock catalogue with an agreement.
- The Music page's Spotify and YouTube Music connections are never offered as post music.
- AI prompts can't name artists.
- Uploads keep who confirmed the rights, and when.
- Instagram's own library is only used by name, inside Instagram (or through its API if it's
  confirmed), so Instagram's licence covers it.

## Phases

| Phase | Ships | Size |
|---|---|---|
| 0 Checks | (a) ffmpeg in a Container: a photo story and a video reel with music, posted to the test Instagram account with today's `publish()`. (b) AI bake-off: the same 10 café prompts on ElevenLabs and Lyria 3; quality, time, price, terms. (c) Meta and TikTok: look for official docs and App Review permissions for attaching library audio through the API. | 2–3 days |
| 1 Library and AI | Tables, audio storage, upload with rights tick, AI generation with allowance, waveform and highlight, Brand *Our sound*, starter pack, a Sounds tab on Social planner | ~1 week |
| 2 Music in the composer | Suggestion strip, Music sheet, part picker, mix, preview, render on save, *in Instagram* for reminders, `audio_name`, badges, reminder line | 1–1.5 weeks |
| 3 Extras | Photos or a carousel made into a reel cut to the beat; suggestions that learn from reach; a "now playing" label on photo stories; MCP tools; a stock catalogue | per item |
| 4 Platform music through the API | Instagram reels with library audio (needs a Facebook Login connection next to today's Instagram Login), TikTok Commercial Music Library once TikTok video posting exists. Only if 0(c) confirms them. | ~1 week each |

## Tests

- `shared/music.test.ts`: ranking, occasion words in both languages, part windows, prompt builder
  refusing artist names, `postProblem()` music rules.
- `supabase/tests/zz_social_music.test.sql`: trigger rules and the monthly AI allowance.
- Worker: render route with a fake container, the AI provider with a fake `fetch`,
  `instagram.publish()` sending `audio_name`.
- Browser (demo mode): Story → add a photo → the strip appears → pick a track → move the part →
  save → ♫ in the list.

## Open questions

1. AI provider: ElevenLabs (simplest) or Google Lyria (cheapest)? Monthly budget?
2. OK to add a Cloudflare Container (Workers Paid plan) for rendering?
3. Which plans get AI tracks, and how many a month?
4. Worth a paid stock catalogue agreement, or are AI tracks plus the business's own uploads enough?

## Sources (checked 23 Oct 2026)

- Meta, IG User Media reference (`audio_name`; music tagging for original audio only; story and
  reel limits): <https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/>
- Reported Instagram audio through the API, unconfirmed by Meta:
  <https://noobclaw.com/blog/schedule-reels-trending-audio-api-2026/>,
  <https://bundle.social/instagram-music-api>
- TikTok Commercial Music Library through the API, unconfirmed by TikTok:
  <https://bundle.social/tiktok-commercial-music-library>,
  <https://zernio.com/blog/tiktok-developer-api>
- ElevenLabs Music API: <https://elevenlabs.io/docs/api-reference/music/compose>
- Google Lyria: <https://ai.google.dev/gemini-api/docs/music-generation>,
  <https://cloud.google.com/vertex-ai/generative-ai/pricing>
- Cloudflare Containers GA: <https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/>
- Mediabunny: <https://mediabunny.dev/guide/introduction>
