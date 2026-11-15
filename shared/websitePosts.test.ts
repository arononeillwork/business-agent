// The posts feed a website reads (shared/websitePosts.ts): only posts with a picture and a link, newest
// first, the account's handle without the @.
import { describe, expect, it } from 'vitest'
import { SITE_POSTS, sitePosts } from './websitePosts'

const post = (n: number, more = {}) => ({
  id: `p${n}`, source: 'instagram' as const, caption: ` Post ${n} `, image_url: `https://cdn.test/${n}.jpg`, permalink: `https://www.instagram.com/p/${n}/`,
  posted_at: new Date(Date.UTC(2026, 10, 1) + n * 3_600_000).toISOString(), ...more,
})
const business = { id: 1, name: 'Easy Beans Coffee' }

describe('the posts feed', () => {
  it('has no posts and no account while nothing is connected', () => {
    expect(sitePosts({ business, read: null, fetchedAt: '2026-11-15T10:00:00Z', now: new Date('2026-11-15T10:00:00Z') })).toEqual({
      version: 1, business, source: null, account: null, posts: [], fetched_at: null, generated_at: '2026-11-15T10:00:00.000Z',
    })
  })

  it('gives the newest posts with a picture and a link, captions tidied', () => {
    const posts = [post(1), post(3, { video: true }), post(2, { image_url: null }), post(4, { permalink: 'http://x.test/p' }), ...Array.from({ length: 20 }, (_, i) => post(10 + i))]
    const feed = sitePosts({ business, read: { source: 'instagram', account: '@easy.beans.coffee', posts }, fetchedAt: '2026-11-15T10:00:00Z' })
    expect(feed.account).toEqual({ handle: 'easy.beans.coffee', url: 'https://www.instagram.com/easy.beans.coffee' })
    expect(feed.posts).toHaveLength(SITE_POSTS)
    expect(feed.posts[0]).toMatchObject({ id: 'p29', caption: 'Post 29', video: false })
    expect(feed.posts.map(p => p.id)).not.toContain('p2')
    expect(feed.posts.map(p => p.id)).not.toContain('p4')
  })

  it('names a Facebook Page without an Instagram address', () => {
    const feed = sitePosts({ business, read: { source: 'facebook', account: 'Easy Beans Coffee', posts: [post(1, { source: 'facebook' })] }, fetchedAt: null })
    expect(feed).toMatchObject({ source: 'facebook', account: { handle: 'Easy Beans Coffee', url: null } })
  })
})
