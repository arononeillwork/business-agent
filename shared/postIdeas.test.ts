import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { IDEA_LIMITS, ideaProblem, postFromIdea, sortIdeas, type PostIdea } from './postIdeas'

const idea = (id: string, p: Partial<PostIdea> = {}): PostIdea => ({
  id, title: id, details: null, wants: 'either', status: 'open', taken_by: null, media: [], post_id: null, created_by: null,
  created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', ...p })
const photo = { url: 'https://app.test/media/a.jpg', type: 'image' as const }
const video = { url: 'https://app.test/media/b.mp4', type: 'video' as const }

describe('post ideas', () => {
  it('needs what it’s about, kept short; handed in only with something in it', () => {
    expect(ideaProblem(idea(' '))).toBe('Say what the post is about')
    expect(ideaProblem(idea('x'.repeat(121)))).toBe('Keep the idea to 120 characters')
    expect(ideaProblem(idea('Coffees', { details: 'x'.repeat(1001) }))).toBe('Keep the details to 1,000 characters')
    expect(ideaProblem(idea('Coffees', { media: Array(11).fill(photo) }))).toBe('An idea takes up to 10 photos and videos')
    expect(ideaProblem(idea('Coffees', { status: 'ready' }))).toBe('Add the photos or video first')
    expect(ideaProblem(idea('Coffees', { status: 'ready', media: [photo] }))).toBeNull()
  })

  it('puts the ones ready to post first, then the ones being made, then the rest, newest first; done ones last', () => {
    const list = [
      idea('old open', { created_at: '2026-11-01T09:00:00Z' }),
      idea('done earlier', { status: 'done', updated_at: '2026-11-02T09:00:00Z' }),
      idea('new open', { created_at: '2026-11-03T09:00:00Z' }),
      idea('being made', { status: 'doing', taken_by: 'p-julio' }),
      idea('done later', { status: 'done', updated_at: '2026-11-04T09:00:00Z' }),
      idea('ready', { status: 'ready', media: [photo] }),
    ]
    expect(sortIdeas(list).map(i => i.id)).toEqual(['ready', 'being made', 'new open', 'old open', 'done later', 'done earlier'])
  })

  it('makes a post of what was handed in: several are a carousel, a video a reel, a photo a post', () => {
    expect(postFromIdea(idea(' The coffees we have now ', { media: [photo, video] }))).toEqual({ kind: 'carousel', media: [photo, video], caption: 'The coffees we have now' })
    expect(postFromIdea(idea('Pour', { media: [video] })).kind).toBe('reel')
    expect(postFromIdea(idea('Cake', { media: [photo] })).kind).toBe('post')
    expect(postFromIdea(idea('Pour', { wants: 'video' })).kind).toBe('reel')
    expect(postFromIdea(idea('Many', { media: Array(12).fill(photo) })).media).toHaveLength(10)
  })

  it('has the database’s limits', () => {
    const dir = join(import.meta.dirname, '../supabase/migrations')
    const sql = readFileSync(join(dir, readdirSync(dir).find(f => f.endsWith('_post_ideas.sql'))!), 'utf8')
    expect(sql).toContain(`char_length(btrim(title)) between 1 and ${IDEA_LIMITS.title}`)
    expect(sql).toContain(`char_length(details) <= ${IDEA_LIMITS.details}`)
    expect(sql).toContain(`jsonb_array_length(media) <= ${IDEA_LIMITS.media}`)
  })
})
