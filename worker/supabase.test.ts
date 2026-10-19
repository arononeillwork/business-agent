import { afterEach, describe, expect, it, vi } from 'vitest'
import { userClient, type Env } from './supabase'

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' } as Env

afterEach(() => vi.unstubAllGlobals())

describe('userClient', () => {
  it('sends the person\'s token exactly once, for auth and data calls', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get('authorization') ?? '')
      return new Response(JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' }),
        { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    const sb = userClient(env, 'user-jwt', 'ai')
    await sb.auth.getUser('user-jwt')
    await sb.from('profiles').select('id')
    expect(seen).toEqual(['Bearer user-jwt', 'Bearer user-jwt'])
  })
})
