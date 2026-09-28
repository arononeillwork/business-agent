// Stand-ins for the Google, Microsoft, Spotify and Meta APIs the connections use, answering the way
// the real ones do (including their error shapes), with switches to make each one misbehave.
export type Json = Record<string, unknown>

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const googleError = (status: number, message: string, reason?: string) =>
  json({ error: { code: status, message, ...(reason ? { errors: [{ reason, message }] } : {}) } }, status)

const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/youtube.readonly openid https://www.googleapis.com/auth/userinfo.email'
const MS_SCOPES = 'Mail.Send Files.ReadWrite User.Read openid email profile'

/** Decode a Gmail `raw` message into its To, Subject and text. */
export function readGmail(raw: string) {
  const text = atob(raw.replace(/-/g, '+').replace(/_/g, '/'))
  const [head, body] = text.split('\r\n\r\n')
  const utf8 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)))
  return {
    to: head.match(/^To: (.*)$/m)?.[1],
    subject: utf8(head.match(/^Subject: =\?UTF-8\?B\?(.*)\?=$/m)?.[1] ?? ''),
    text: utf8(body.replace(/\r\n/g, '')),
  }
}

export class FakeProviders {
  google = {
    email: 'cafe@gmail.com',
    /** What the person allowed on the consent screen (default: everything asked for). */
    granted: GOOGLE_SCOPES,
    revoked: false,
    /** APIs switched off in Google Cloud: 'gmail', 'drive', 'youtube'. */
    disabled: new Set<string>(),
    sent: [] as string[],
    folders: new Map<string, { name: string; parent: string; trashed: boolean }>(),
    uploads: [] as { parent: string; name: string }[],
    channel: 'Easy Beans' as string | null,
    playlists: [{ id: 'PL1', snippet: { title: 'Morning café', channelTitle: 'Easy Beans', thumbnails: {} }, contentDetails: { itemCount: 42 } }],
    /** Answer the next N Drive calls with a 500 (a provider having a bad minute). */
    driveHiccups: 0,
    /** Google Maps listings the account manages. */
    listings: [{ name: 'locations/1', title: 'Easy Beans Coffee', storefrontAddress: { addressLines: ['Calle Mayor 1'], locality: 'San Pedro' } }] as Json[],
  }
  instagram = {
    username: 'easy.beans.coffee',
    permissions: 'instagram_business_basic,instagram_business_content_publish',
    /** Until Meta's review, only accounts added as Instagram testers can connect. */
    tester: true,
    revoked: false,
    refreshes: 0,
    /** The long-lived token the Worker should be using now. */
    current: '',
  }
  microsoft = {
    mail: 'cafe@outlook.com' as string | null,
    granted: MS_SCOPES,
    revoked: false,
    noMailbox: false,
    /** Refresh tokens that still work. Microsoft hands out a new one on every refresh and the old one stops working. */
    valid: new Set<string>(),
    sent: [] as { to: string; subject: string }[],
    folderId: null as string | null,
    files: [] as string[],
  }
  spotify = { premium: true, revoked: false }
  facebook = {
    granted: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'public_profile'],
    pages: [{ id: 'page-1', name: 'Easy Beans Coffee', access_token: 'page-token-1' }] as { id: string; name: string; access_token: string }[],
    revoked: false,
    posts: [] as { page: string; kind: 'photos' | 'feed'; caption?: string; url?: string }[],
  }
  tiktok = {
    scope: 'user.info.basic,video.publish',
    privacy: ['SELF_ONLY'] as string[],
    revoked: false,
    /** Refresh tokens that still work (TikTok may hand out a new one on refresh). */
    refreshes: 0,
    posts: [] as { caption: string; image: string; privacy: string }[],
    failPost: null as string | null,
  }
  square = {
    locations: [{ id: 'L1', name: 'Easy Beans · San Pedro', status: 'ACTIVE', currency: 'EUR' }],
    revoked: false,
    refreshes: 0,
    payments: [
      { created_at: '2026-09-28T08:15:00Z', status: 'COMPLETED', amount_money: { amount: 350, currency: 'EUR' }, tip_money: { amount: 50 } },
      { created_at: '2026-09-28T21:30:00Z', status: 'COMPLETED', amount_money: { amount: 1200, currency: 'EUR' } }, // 23:30 in Madrid, same day
      { created_at: '2026-09-28T22:30:00Z', status: 'COMPLETED', amount_money: { amount: 900, currency: 'EUR' } },  // 00:30 next day in Madrid
      { created_at: '2026-09-28T10:00:00Z', status: 'FAILED', amount_money: { amount: 9999, currency: 'EUR' } },
    ],
  }
  whatsapp = { sent: [] as { to: string; template: string }[], broken: false }
  /** Every call, as "METHOD host/path". */
  calls: string[] = []
  private nextId = 1

  handle(input: string, init: RequestInit = {}): Response | null {
    const url = new URL(input)
    const method = (init.method ?? 'GET').toUpperCase()
    this.calls.push(`${method} ${url.host}${url.pathname}`)
    const form = () => new URLSearchParams(String(init.body ?? ''))
    const body = () => JSON.parse(String(init.body ?? '{}')) as Json

    // ---- Google ----
    if (url.href === 'https://oauth2.googleapis.com/token') {
      const f = form()
      if (f.get('grant_type') === 'refresh_token' && (this.google.revoked || f.get('refresh_token') !== 'g-refresh')) {
        return json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400)
      }
      return json({ access_token: `g-access-${this.nextId++}`, expires_in: 3599, scope: this.google.granted, token_type: 'Bearer',
        ...(f.get('grant_type') === 'authorization_code' ? { refresh_token: 'g-refresh' } : {}) })
    }
    if (url.href === 'https://openidconnect.googleapis.com/v1/userinfo') return json({ email: this.google.email })
    if (url.host === 'gmail.googleapis.com') {
      if (this.google.disabled.has('gmail')) return googleError(403, 'Gmail API has not been used in project 1234 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=1234 then retry.', 'accessNotConfigured')
      if (!this.google.granted.includes('gmail.send')) return googleError(403, 'Request had insufficient authentication scopes.', 'insufficientPermissions')
      this.google.sent.push(String(body().raw))
      return json({ id: `msg-${this.nextId++}`, threadId: 't', labelIds: ['SENT'] })
    }
    if (url.host === 'www.googleapis.com' && url.pathname.startsWith('/drive/v3/')) {
      if (this.google.disabled.has('drive')) return googleError(403, 'Google Drive API has not been used in project 1234 before or it is disabled.', 'accessNotConfigured')
      if (this.google.driveHiccups > 0) { this.google.driveHiccups--; return googleError(500, 'Backend Error', 'backendError') }
      const byId = url.pathname.match(/\/drive\/v3\/files\/([^/]+)$/)
      if (byId) {
        const f = this.google.folders.get(decodeURIComponent(byId[1]))
        return f ? json({ id: byId[1], trashed: f.trashed }) : googleError(404, `File not found: ${byId[1]}.`, 'notFound')
      }
      if (method === 'GET') {
        const q = url.searchParams.get('q') ?? ''
        const name = q.match(/name = '(.*?)'/)?.[1], parent = q.match(/'([^']+)' in parents/)?.[1]
        const files = [...this.google.folders].filter(([, f]) => f.name === name && f.parent === parent && !f.trashed).map(([id]) => ({ id }))
        return json({ files })
      }
      const made = body() as { name: string; parents: string[] }
      const id = `folder-${this.nextId++}`
      this.google.folders.set(id, { name: made.name, parent: made.parents[0], trashed: false })
      return json({ id })
    }
    if (url.host === 'www.googleapis.com' && url.pathname.startsWith('/upload/drive/v3/files')) {
      const meta = JSON.parse(String(init.body).split('\r\n')[3]) as { name: string; parents: string[] }
      this.google.uploads.push({ parent: meta.parents[0], name: meta.name })
      return json({ webViewLink: `https://drive.google.com/file/d/${this.nextId++}/view` })
    }
    if (url.host === 'www.googleapis.com' && url.pathname.startsWith('/youtube/v3/')) {
      if (this.google.disabled.has('youtube')) return googleError(403, 'YouTube Data API v3 has not been used in project 1234 before or it is disabled.', 'accessNotConfigured')
      if (url.pathname.endsWith('/channels')) return json({ items: this.google.channel ? [{ snippet: { title: this.google.channel } }] : [] })
      if (url.pathname.endsWith('/playlists')) return json({ items: this.google.playlists })
    }

    if (url.host === 'mybusinessaccountmanagement.googleapis.com') return json({ accounts: [{ name: 'accounts/1' }] })
    if (url.host === 'mybusinessbusinessinformation.googleapis.com') {
      if (url.pathname.endsWith('/locations')) return json({ locations: this.google.listings })
      return json({ regularHours: { periods: [] } })
    }

    // ---- Instagram (Instagram Login) ----
    if (url.href === 'https://api.instagram.com/oauth/access_token') {
      if (!this.instagram.tester) return json({ error_type: 'OAuthException', code: 400, error_message: 'Insufficient Developer Role' }, 400)
      return json({ data: [{ access_token: 'ig-short', user_id: '17841400000000001', permissions: this.instagram.permissions }] })
    }
    if (url.host === 'graph.instagram.com' && url.pathname === '/access_token') {
      this.instagram.current = 'ig-long-0'
      return json({ access_token: this.instagram.current, token_type: 'bearer', expires_in: 5_184_000 })
    }
    if (url.host === 'graph.instagram.com' && url.pathname === '/refresh_access_token') {
      if (this.instagram.revoked || url.searchParams.get('access_token') !== this.instagram.current) return json({ error: { message: 'Error validating access token: Session has expired.', type: 'OAuthException', code: 190 } }, 400)
      this.instagram.current = `ig-long-${++this.instagram.refreshes}`
      return json({ access_token: this.instagram.current, token_type: 'bearer', expires_in: 5_184_000 })
    }
    if (url.host === 'graph.instagram.com') {
      const token = new Headers(init.headers).get('authorization')?.replace('Bearer ', '')
      if (this.instagram.revoked || token !== this.instagram.current) {
        return json({ error: { message: 'Error validating access token: The user has not authorized application 123.', type: 'OAuthException', code: 190 } }, 400)
      }
      if (url.pathname.endsWith('/me')) return json({ user_id: '17841400000000001', username: this.instagram.username, account_type: 'BUSINESS', followers_count: 1284, media_count: 57 })
      if (url.pathname.endsWith('/me/media')) return json({ data: [{ id: 'm1', caption: 'Iced oat latte season', permalink: 'https://instagram.com/p/1', timestamp: '2026-09-27T10:00:00Z' }] })
    }

    // ---- Microsoft ----
    if (url.href === 'https://login.microsoftonline.com/common/oauth2/v2.0/token') {
      const f = form()
      if (f.get('grant_type') === 'refresh_token') {
        if (this.microsoft.revoked || !this.microsoft.valid.delete(f.get('refresh_token') ?? '')) {
          return json({ error: 'invalid_grant', error_description: 'AADSTS70000: The provided grant has expired due to it being revoked.\r\nTrace ID: x' }, 400)
        }
      }
      const refresh = `ms-refresh-${this.nextId++}`
      this.microsoft.valid.add(refresh)
      return json({ access_token: `ms-access-${this.nextId++}`, refresh_token: refresh, scope: this.microsoft.granted, token_type: 'Bearer' })
    }
    if (url.host === 'graph.microsoft.com') {
      const path = url.pathname.replace('/v1.0', '')
      if (path === '/me') return json({ displayName: 'Easy Beans', mail: this.microsoft.mail, userPrincipalName: this.microsoft.mail ?? 'cafe@outlook.com' })
      if (path === '/me/sendMail') {
        if (this.microsoft.noMailbox) return json({ error: { code: 'MailboxNotEnabledForRESTAPI', message: 'The mailbox is either inactive, soft-deleted, or is hosted on-premise.' } }, 404)
        if (!/mail\.send/i.test(this.microsoft.granted)) return json({ error: { code: 'ErrorAccessDenied', message: 'Access is denied. Check credentials and try again.' } }, 403)
        const m = body() as { message: { subject: string; toRecipients: { emailAddress: { address: string } }[] } }
        this.microsoft.sent.push({ to: m.message.toRecipients[0].emailAddress.address, subject: m.message.subject })
        return new Response(null, { status: 202 })
      }
      if (path === '/me/drive/root:/Business%20Agent' || path === '/me/drive/root:/Business Agent') {
        return this.microsoft.folderId ? json({ id: this.microsoft.folderId, name: 'Business Agent', folder: {} }) : json({ error: { code: 'itemNotFound', message: 'The resource could not be found.' } }, 404)
      }
      if (path === '/me/drive/root/children' && method === 'POST') {
        this.microsoft.folderId = `ms-folder-${this.nextId++}`
        return json({ id: this.microsoft.folderId, name: 'Business Agent', folder: {} }, 201)
      }
      if (path.startsWith('/me/drive/root:/') && path.endsWith(':/content') && method === 'PUT') {
        this.microsoft.files.push(decodeURIComponent(path.slice('/me/drive/root:/'.length, -':/content'.length)))
        return json({ id: `item-${this.nextId++}`, webUrl: `https://onedrive.live.com/?id=${this.nextId}` }, 201)
      }
    }

    // ---- Spotify ----
    if (url.href === 'https://accounts.spotify.com/api/token') {
      const f = form()
      if (f.get('grant_type') === 'refresh_token' && this.spotify.revoked) return json({ error: 'invalid_grant', error_description: 'Refresh token revoked' }, 400)
      return json({ access_token: `sp-access-${this.nextId++}`, token_type: 'Bearer', expires_in: 3600, ...(f.get('grant_type') === 'authorization_code' ? { refresh_token: 'sp-refresh' } : {}) })
    }
    if (url.host === 'api.spotify.com') {
      if (url.pathname === '/v1/me') return json({ id: 'easybeans', display_name: 'Easy Beans', product: this.spotify.premium ? 'premium' : 'free' })
      if (url.pathname === '/v1/me/playlists') return json({ items: [{ id: 'sp1', name: 'Café mornings', tracks: { total: 30 }, images: [], external_urls: { spotify: 'https://open.spotify.com/playlist/sp1' }, owner: { display_name: 'Easy Beans' } }] })
      if (url.pathname === '/v1/me/player') return new Response(null, { status: 204 })
    }

    // ---- Facebook Pages (Meta Graph) ----
    if (url.host === 'graph.facebook.com' && /\/oauth\/access_token$/.test(url.pathname)) {
      if (url.searchParams.get('grant_type') === 'fb_exchange_token') return json({ access_token: 'fb-user-long', token_type: 'bearer', expires_in: 5_184_000 })
      return json({ access_token: 'fb-user-short', token_type: 'bearer', expires_in: 3600 })
    }
    if (url.host === 'graph.facebook.com' && /\/me\/permissions$/.test(url.pathname)) return json({ data: this.facebook.granted.map(permission => ({ permission, status: 'granted' })) })
    if (url.host === 'graph.facebook.com' && /\/me\/accounts$/.test(url.pathname)) return json({ data: this.facebook.pages })
    const pageCall = url.host === 'graph.facebook.com' && url.pathname.match(/\/v[\d.]+\/(page-[\w-]+)(\/photos|\/feed)?$/)
    if (pageCall) {
      const token = new Headers(init.headers).get('authorization')?.replace('Bearer ', '')
      const page = this.facebook.pages.find(p => p.id === pageCall[1])
      if (this.facebook.revoked || !page || token !== page.access_token) return json({ error: { message: 'Error validating access token: The session has been invalidated.', code: 190 } }, 400)
      if (!pageCall[2]) return json({ id: page.id, name: page.name, followers_count: 812 })
      const f = form()
      this.facebook.posts.push({ page: page.id, kind: pageCall[2] === '/photos' ? 'photos' : 'feed', caption: f.get('caption') ?? f.get('message') ?? undefined, url: f.get('url') ?? undefined })
      return json({ id: `${this.nextId++}`, post_id: `${page.id}_${this.nextId++}` })
    }

    // ---- TikTok ----
    if (url.href === 'https://open.tiktokapis.com/v2/oauth/token/') {
      const f = form()
      if (f.get('grant_type') === 'refresh_token' && (this.tiktok.revoked || f.get('refresh_token') !== `tt-refresh-${this.tiktok.refreshes}`)) {
        return json({ error: 'invalid_grant', error_description: 'Refresh token is invalid or expired.' }, 400)
      }
      if (f.get('grant_type') === 'refresh_token') this.tiktok.refreshes++
      return json({ access_token: `tt-access-${this.nextId++}`, refresh_token: `tt-refresh-${this.tiktok.refreshes}`, expires_in: 86_400, open_id: 'open-1', scope: this.tiktok.scope, token_type: 'Bearer' })
    }
    if (url.host === 'open.tiktokapis.com') {
      if (this.tiktok.revoked) return json({ data: {}, error: { code: 'access_token_invalid', message: 'The access token is invalid or not found in the request.' } }, 401)
      if (url.pathname === '/v2/user/info/') return json({ data: { user: { open_id: 'open-1', display_name: 'Easy Beans' } }, error: { code: 'ok', message: '' } })
      if (url.pathname === '/v2/post/publish/creator_info/query/') {
        return json({ data: { creator_username: 'easybeanscoffee', creator_nickname: 'Easy Beans', privacy_level_options: this.tiktok.privacy }, error: { code: 'ok', message: '' } })
      }
      if (url.pathname === '/v2/post/publish/content/init/') {
        const b = body() as { post_info: { description: string; privacy_level: string }; source_info: { photo_images: string[] } }
        this.tiktok.posts.push({ caption: b.post_info.description, image: b.source_info.photo_images[0], privacy: b.post_info.privacy_level })
        return json({ data: { publish_id: 'p_pub_1' }, error: { code: 'ok', message: '' } })
      }
      if (url.pathname === '/v2/post/publish/status/fetch/') {
        if (!this.tiktok.failPost) return new Response(JSON.stringify({ data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['POST_ID'] }, error: { code: 'ok', message: '' } }).replace('"POST_ID"', '7400000000000000001'), { headers: { 'content-type': 'application/json' } })
        return json({ data: this.tiktok.failPost ? { status: 'FAILED', fail_reason: this.tiktok.failPost } : { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['POST_ID'] }, error: { code: 'ok', message: '' } })
      }
    }

    // ---- Square ----
    if (url.href === 'https://connect.squareup.com/oauth2/token') {
      const b = body() as { grant_type: string; refresh_token?: string }
      if (b.grant_type === 'refresh_token' && (this.square.revoked || b.refresh_token !== 'sq-refresh')) return json({ message: 'Invalid refresh token', type: 'service.not_authorized' }, 401)
      if (b.grant_type === 'refresh_token') this.square.refreshes++
      return json({ access_token: `sq-access-${this.nextId++}`, token_type: 'bearer', expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), merchant_id: 'M1', refresh_token: 'sq-refresh' })
    }
    if (url.host === 'connect.squareup.com') {
      if (this.square.revoked) return json({ errors: [{ category: 'AUTHENTICATION_ERROR', code: 'ACCESS_TOKEN_REVOKED', detail: 'The access token has been revoked.' }] }, 401)
      if (url.pathname === '/v2/merchants/me') return json({ merchant: { id: 'M1', business_name: 'Easy Beans Coffee', country: 'ES', currency: 'EUR' } })
      if (url.pathname === '/v2/locations') return json({ locations: this.square.locations })
      if (url.pathname === '/v2/payments') {
        const from = url.searchParams.get('begin_time')!, to = url.searchParams.get('end_time')!
        return json({ payments: this.square.payments.filter(p => p.created_at >= from && p.created_at < to) })
      }
    }

    // ---- WhatsApp (Meta Graph) ----
    if (url.host === 'graph.facebook.com') {
      if (this.whatsapp.broken) return json({ error: { message: 'Error validating access token: Session has expired.', code: 190 } }, 401)
      if (url.pathname.endsWith('/messages')) {
        const m = body() as { to: string; template: { name: string } }
        this.whatsapp.sent.push({ to: m.to, template: m.template.name })
        return json({ messaging_product: 'whatsapp', messages: [{ id: `wamid.${this.nextId++}` }] })
      }
      return json({ display_phone_number: '+34 600 000 000', verified_name: 'Easy Beans', id: '555' })
    }
    return null
  }
}
