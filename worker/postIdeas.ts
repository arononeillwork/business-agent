// Post ideas (Social planner → Ideas): the photos and videos the team makes for an idea. Anyone on the
// team (owners, shop managers, employees; not partners or the café tablet) keeps them in the business's
// Drive or OneDrive, in Business Agent/Social/Ideas, the same way an admin's go for a post
// (/api/integrations/media, admins only). The idea itself is a row the app saves (the `post_ideas` migration).
//   POST /api/post-ideas/media   a JPEG photo or an MP4/MOV video; { url, type }
import { Hono } from 'hono'
import { bearer, businessDb, type Env } from './supabase'
import { checkFile, MediaError, storeMedia } from './media'
import { signInCheck, signedInUser } from './signedIn'

export const postIdeas = new Hono<{ Bindings: Env }>()

postIdeas.post('/api/post-ideas/media', async c => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const [{ data: user }, { data: staff }, { data: businessId }] = await Promise.all([signedInUser(c.env, token), signInCheck(c.env, token, 'is_staff'), signInCheck(c.env, token, 'current_business_id')])
  if (!user.user || !staff || !businessId) return c.json({ error: 'Only the team adds photos and videos to ideas' }, 403)
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const declared = Number(c.req.header('content-length') ?? '') || null
  try {
    if (checkFile(type, declared, 'Ideas').type === 'audio') throw new MediaError('Add a photo or a video')
    // A known size streams straight through to storage; otherwise it's read first (up to 100 MB).
    const Fixed = (globalThis as { FixedLengthStream?: new (n: number) => TransformStream }).FixedLengthStream
    const body = declared && c.req.raw.body && Fixed ? c.req.raw.body.pipeThrough(new Fixed(declared)) : await c.req.arrayBuffer()
    const size = body instanceof ArrayBuffer ? body.byteLength : declared!
    const { url, type: kind } = await storeMedia(c.env, businessDb(c.env, businessId as number), new URL(c.req.url).origin, { type, size, body, folder: 'Ideas' })
    return c.json({ url, type: kind })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, e instanceof MediaError ? 400 : 502)
  }
})
