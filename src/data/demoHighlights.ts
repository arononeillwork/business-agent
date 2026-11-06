// The demo's Instagram highlights (Content): none to start with. Putting photos and videos into one makes a
// story each on the demo's Social planner (which "posts" them when Instagram is connected), and once one is up
// the admins are told to add it in Instagram, as the `instagram_highlights` migration does.
import type { Api } from './api'
import type { SocialPost } from '../../shared/types'
import { MAX_HIGHLIGHT_BATCH, coverOf, highlightNameProblem, storyState, storyTimes, tidyHighlightName, type InstagramHighlight } from '../../shared/highlights'

interface Who {
  isAdmin: () => boolean
  uid: () => string
  nowIso: () => string
  /** A story on the demo's Social planner (its own rules apply); returns its id. */
  saveStory: (post: Partial<SocialPost> & { caption: string; targets: ['instagram']; status: 'scheduled' }) => Promise<string>
  /** The Social planner's posts, brought up to date (what's due "goes out"). */
  posts: () => SocialPost[]
  /** Tell every admin (once while they haven't read it). */
  tellAdmins: (title: string, body: string, link: string) => void
}

type HighlightsApi = Pick<Api, 'instagramHighlights' | 'createHighlight' | 'addToHighlight' | 'renameHighlight' | 'deleteHighlight' | 'markStoryAdded'>

const RLS = 'new row violates row-level security policy for table "instagram_highlights"'

export function demoHighlights(w: Who): { api: HighlightsApi; news: () => void } {
  const highlights: (Omit<InstagramHighlight, 'stories'>)[] = []
  const links: { id: string; highlight_id: string; post_id: string; added_at: string | null }[] = []
  // Stories the admins were told about already.
  const told = new Set<string>()

  const needAdmin = () => { if (!w.isAdmin()) throw new Error(RLS) }
  const add = (name: string) => {
    const problem = highlightNameProblem(name, highlights)
    if (problem) throw new Error(problem)
    const h = { id: w.uid(), name: tidyHighlightName(name), cover_url: null, created_at: w.nowIso() }
    highlights.push(h)
    return h
  }
  const list = (): InstagramHighlight[] => {
    const posts = w.posts()
    return highlights.map(h => ({
      ...h,
      stories: links.filter(l => l.highlight_id === h.id).flatMap(l => {
        const p = posts.find(x => x.id === l.post_id)
        return p?.media[0] ? [{ id: l.id, post_id: l.post_id, media: p.media[0], state: storyState(p, l.added_at), scheduled_at: p.scheduled_at,
          published_at: p.published_at, url: p.results.instagram?.url ?? null, added_at: l.added_at }] : []
      }).sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')),
    }))
  }
  /** Stories that went up since last time: the admins are told to add each in Instagram. */
  const news = () => {
    for (const h of list()) {
      for (const s of h.stories) {
        if (s.state !== 'up' || told.has(s.id)) continue
        told.add(s.id)
        w.tellAdmins(`Add your story to ${h.name}`, `It’s up on Instagram. Instagram doesn’t let apps add to highlights: in the Instagram app, open the story, tap Highlight and choose ${h.name}. The Content page shows which are still to add.`, '/content')
      }
    }
  }

  return {
    news,
    api: {
      async instagramHighlights() {
        if (!w.isAdmin()) return []
        news()
        return structuredClone(list())
      },
      async createHighlight(name) {
        needAdmin()
        return add(name).id
      },
      async addToHighlight({ highlight, media, at, auto }) {
        needAdmin()
        if (!media.length) throw new Error('Choose the photos and videos')
        if (media.length > MAX_HIGHLIGHT_BATCH) throw new Error('Up to 20 at a time')
        const h = 'id' in highlight ? highlights.find(x => x.id === highlight.id) : add(highlight.name)
        if (!h) throw new Error('That highlight isn’t here any more')
        // Posting now: a second apart up to now, so all go out straight away, in order.
        const from = Date.parse(at) <= Date.now() ? new Date(Date.parse(at) - (media.length - 1) * 1000).toISOString() : at
        const times = storyTimes(from, media.length)
        for (const [i, m] of media.entries()) {
          const post_id = await w.saveStory({ kind: 'story', caption: '', media: [m], targets: ['instagram'], status: 'scheduled', scheduled_at: times[i], auto })
          links.push({ id: w.uid(), highlight_id: h.id, post_id, added_at: null })
        }
        h.cover_url ??= coverOf(media)
        return h.id
      },
      async renameHighlight(id, name) {
        needAdmin()
        const h = highlights.find(x => x.id === id)
        if (!h) return
        const problem = highlightNameProblem(name, highlights, id)
        if (problem) throw new Error(problem)
        h.name = tidyHighlightName(name)
      },
      async deleteHighlight(id) {
        needAdmin()
        const i = highlights.findIndex(x => x.id === id)
        if (i >= 0) highlights.splice(i, 1)
        for (let j = links.length - 1; j >= 0; j--) if (links[j].highlight_id === id) links.splice(j, 1)
      },
      async markStoryAdded(id, added) {
        needAdmin()
        const l = links.find(x => x.id === id)
        if (!l) throw new Error('That story isn’t in the highlight any more')
        const p = w.posts().find(x => x.id === l.post_id)
        if (added && (!p || storyState(p, null) !== 'up')) throw new Error('Add it to the highlight once the story is up on Instagram')
        l.added_at = added ? (l.added_at ?? w.nowIso()) : null
      },
    },
  }
}
