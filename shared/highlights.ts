// Instagram highlights (Content, admins): the circles under the business's Instagram profile ("Reviews ⭐",
// "Doggos"). Instagram lets no app read highlights or add to them, so the circles are kept in Business Agent,
// and a photo or video goes into one in two steps: it goes up as a story (one each, on the Social planner,
// posting itself or as a reminder), and once it's up the admins are told to add it to the highlight in the
// Instagram app (open the story, tap Highlight, choose the circle), then mark it added on the Content page.
// The `instagram_highlights` migration has the same rules.
import type { PostMedia, SocialPost } from './types'
import { msg } from './i18n'

/** Characters in a highlight's name (Business Agent's limit; Instagram shows about 15 under the circle). */
export const MAX_HIGHLIGHT_NAME = 30
/** How many go into a highlight at once: one story each. */
export const MAX_HIGHLIGHT_BATCH = 20

/**
 * Where a highlight's story is: waiting for its time (or going up), due (a reminder: your turn to post it),
 * up on Instagram (to add to the highlight there), added, or it didn't go up.
 */
export type StoryState = 'waiting' | 'due' | 'up' | 'added' | 'failed'

export interface HighlightStory {
  id: string
  post_id: string
  media: PostMedia
  state: StoryState
  scheduled_at: string | null
  published_at: string | null
  /** The story on Instagram, when Instagram said where. */
  url: string | null
  /** When an admin marked it added to the highlight in Instagram. */
  added_at: string | null
}

export interface InstagramHighlight {
  id: string
  name: string
  /** The circle's picture: the first photo put in it (null: none yet, or only videos). */
  cover_url: string | null
  created_at: string
  /** Oldest first, as Instagram shows a highlight's stories. */
  stories: HighlightStory[]
}

/** The state of a highlight's story, from its post on the Social planner (the database's instagram_story_up()). */
export function storyState(post: Pick<SocialPost, 'status' | 'results'>, addedAt: string | null): StoryState {
  if (addedAt) return 'added'
  const instagram = post.results.instagram?.status
  if ((post.status === 'published' || post.status === 'partly') && (instagram ?? 'published') === 'published') return 'up'
  if (post.status === 'failed' || post.status === 'partly' || instagram === 'failed') return 'failed'
  if (post.status === 'due') return 'due'
  return 'waiting'
}

/** How many of its stories are up and still to add to it in Instagram. */
export const toAdd = (h: Pick<InstagramHighlight, 'stories'>) => h.stories.filter(s => s.state === 'up').length

/** A name as kept: trimmed, single spaces. */
export const tidyHighlightName = (name: string) => name.trim().replace(/\s+/g, ' ')

/** What's wrong with a highlight's name (null: nothing): one, of up to 30 characters, not another one's. */
export function highlightNameProblem(name: string, others: readonly Pick<InstagramHighlight, 'id' | 'name'>[], id?: string): string | null {
  const n = tidyHighlightName(name)
  if (!n) return msg('Give the highlight a name')
  // Characters as the database counts them (an emoji is one).
  if ([...n].length > MAX_HIGHLIGHT_NAME) return msg('Keep the name to 30 characters')
  if (others.some(o => o.id !== id && o.name.toLowerCase() === n.toLowerCase())) return msg('There’s a highlight with that name already')
  return null
}

/** When each of several stories goes up: a second apart from `at`, in order (the database does the same). */
export const storyTimes = (at: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(at) + i * 1000).toISOString())

/** The circle's picture for photos and videos put in a highlight: the first photo (videos have none). */
export const coverOf = (media: readonly PostMedia[]) => media.find(m => m.type === 'image')?.url ?? null
