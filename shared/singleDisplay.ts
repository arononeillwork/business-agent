// A single display: a screen that shows one thing at a time, full screen (an Instagram post, a
// picture, a digital menu, a page). Everything it has shown stays in its slides, newest first and
// switched off, so it goes back on with one switch. Switching one on switches the rest off: one
// thing on at a time (several on take turns, which is a slideshow). Shared by the app and its tests.
import { MAX_SLIDES, instagramCode, type Slide } from './screens'
import type { SourcePost } from './offerFromPost'

/** Only that one on; the rest stay in the list, off. */
export const showOnly = (slides: Slide[], id: string): Slide[] => slides.map(s => ({ ...s, active: s.id === id }))

/** The one already in the list that shows the same thing: the same post, the same digital menu, or the same address. */
export function sameAs(slides: Slide[], s: Pick<Slide, 'kind' | 'url' | 'design_id' | 'post'>): Slide | undefined {
  return slides.find(x => (s.post ? x.post === s.post
    : s.kind === 'menu' ? x.kind === 'menu' && !!s.design_id && x.design_id === s.design_id
      : x.kind === s.kind && !!s.url && x.url === s.url))
}

/**
 * That on the screen, on its own: the one in the list that shows the same thing goes back on, or
 * else it goes first in the list. A full list loses its oldest (last) to make room.
 */
export function show(slides: Slide[], slide: Slide): Slide[] {
  const same = sameAs(slides, slide)
  if (same) return showOnly(slides, same.id)
  const rest = slides.map(s => ({ ...s, active: false })).slice(0, MAX_SLIDES - 1)
  return [{ ...slide, active: true }, ...rest]
}

/** What's on the screen now: the switched-on ones (more than one take turns). */
export const onNow = (slides: Slide[]) => slides.filter(s => s.active)

/** A post's name in the list: its caption's first line, without hashtags, kept short. */
export function postTitle(caption: string | null): string | null {
  const line = (caption ?? '').split('\n').map(l => l.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim()).find(Boolean)
  if (!line) return null
  return line.length > 80 ? `${line.slice(0, 79).trimEnd()}…` : line
}

/**
 * The slide that shows a post: its photo full screen, once it's kept in the café's storage (`kept`:
 * its address there); else the post itself on Instagram, which never runs out and plays a reel; else
 * (a Facebook post, nowhere to keep it) the photo at its own address. Null: nothing to show.
 */
export function postSlide(p: Pick<SourcePost, 'caption' | 'image_url' | 'permalink' | 'video'>, kept: string | null, id: string = crypto.randomUUID()): Slide | null {
  const base = { id, design_id: null, title: postTitle(p.caption), seconds: null, live: false, active: true, post: p.permalink ?? null }
  if (kept && !p.video) return { ...base, kind: 'image', url: kept }
  if (p.permalink && instagramCode(p.permalink)) return { ...base, kind: 'instagram', url: p.permalink }
  if (p.image_url && !p.video) return { ...base, kind: 'image', url: p.image_url }
  return null
}

/** The slide in the list made from that post, if there is one. */
export const fromPost = (slides: Slide[], p: Pick<SourcePost, 'permalink'>) => (p.permalink ? slides.find(s => s.post === p.permalink) : undefined)
