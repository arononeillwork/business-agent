import { afterEach, describe, expect, it, vi } from 'vitest'
import { alertEmail, base64url, mimeMessage } from '../shared/alertText'
import { ensureDriveFolder, saveToDrive, sendGmail } from './providers/google'
import { authUrl, ensureFolder, saveFile, MS_SCOPES } from './providers/microsoft'

afterEach(() => vi.unstubAllGlobals())
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('alert emails', () => {
  it('turns each alert into a subject and a message', () => {
    expect(alertEmail('shift_reminder', ['Julio', '09:00', 'Barista'], 'Easy Beans')).toEqual({
      subject: 'Your shift starts at 09:00', text: 'Hi Julio,\n\nyour shift starts at 09:00 (Barista). See you soon!',
    })
    expect(alertEmail('time_off_decided', ['Maria', '12–14 Oct', 'approved'], 'Easy Beans').subject).toBe('Your time off was approved')
  })

  it('builds a UTF-8 message Gmail accepts (accents survive)', () => {
    const raw = mimeMessage({ to: 'lucia@example.com', subject: 'Turno mañana', text: 'Hola Lucía' })
    expect(raw).toContain('To: lucia@example.com')
    expect(raw).toContain(`Subject: =?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode('Turno mañana')))}?=`)
    const body = raw.split('\r\n\r\n')[1].replace(/\r\n/g, '')
    expect(new TextDecoder().decode(Uint8Array.from(atob(body), ch => ch.charCodeAt(0)))).toBe('Hola Lucía')
    expect(base64url('a?b>')).not.toMatch(/[+/=]/)
  })
})

describe('Gmail and Google Drive', () => {
  it('sends the raw message', async () => {
    const f = vi.fn(async () => json({ id: 'msg-1' }))
    vi.stubGlobal('fetch', f)
    expect(await sendGmail('tok', 'abc')).toBe('msg-1')
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ raw: 'abc' })
  })

  it('saves into The Business Agent/<folder>, making the folders the first time', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url.split('?')[0]}`)
      if (url.includes('/drive/v3/files?q=')) return json({ files: [] })
      if (url.includes('/drive/v3/files?fields=id')) return json({ id: `folder-${calls.length}` })
      return json({ webViewLink: 'https://drive.google.com/file/x' })
    }))
    expect(await saveToDrive('tok', 'Timecards', 'week.csv', 'a;b', 'text/csv')).toBe('https://drive.google.com/file/x')
    expect(calls).toEqual([
      // The app's folder: not there, nor under its old name, so made.
      'GET https://www.googleapis.com/drive/v3/files', 'GET https://www.googleapis.com/drive/v3/files', 'POST https://www.googleapis.com/drive/v3/files',
      'GET https://www.googleapis.com/drive/v3/files', 'POST https://www.googleapis.com/drive/v3/files',
      'POST https://www.googleapis.com/upload/drive/v3/files',
    ])
  })

  it('the folder made under the old name ("Business Agent") is renamed, not made again', async () => {
    const calls: { method: string; url: string; body?: unknown }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const q = new URL(url).searchParams.get('q') ?? ''
      if (q.includes("name = 'The Business Agent'")) return json({ files: [] })
      if (q.includes("name = 'Business Agent'")) return json({ files: [{ id: 'old-folder' }] })
      return json({ id: 'old-folder' })
    }))
    expect(await ensureDriveFolder('tok')).toBe('old-folder')
    expect(calls.map(c => c.method)).toEqual(['GET', 'GET', 'PATCH'])
    expect(calls[2]).toMatchObject({ url: 'https://www.googleapis.com/drive/v3/files/old-folder?fields=id', body: { name: 'The Business Agent' } })
  })

  it('a folder already called The Business Agent is used as it is', async () => {
    const f = vi.fn(async () => json({ files: [{ id: 'new-folder' }] }))
    vi.stubGlobal('fetch', f)
    expect(await ensureDriveFolder('tok')).toBe('new-folder')
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe('Outlook and OneDrive', () => {
  it('asks only for what each connection needs, with offline access', () => {
    const url = new URL(authUrl({ clientId: 'c', clientSecret: 's', redirectUri: 'https://x/cb' }, 'st', MS_SCOPES.onedrive))
    expect(url.searchParams.get('scope')).toBe('offline_access openid email User.Read Files.ReadWrite')
    expect(url.searchParams.get('scope')).not.toContain('Mail')
  })

  /** The PUTs a stubbed fetch saw: saving first makes sure of the app's folder (a GET). */
  const puts = (f: ReturnType<typeof vi.fn>) => (f.mock.calls as unknown as [string, RequestInit?][]).filter(c => c[1]?.method === 'PUT').map(c => c[0])

  it('saves into The Business Agent/<folder> in OneDrive', async () => {
    const f = vi.fn(async () => json({ id: 'folder', webUrl: 'https://onedrive.live.com/x' }))
    vi.stubGlobal('fetch', f)
    expect(await saveFile('tok', 'Timecards', 'week 40.csv', 'a;b', 'text/csv')).toBe('https://onedrive.live.com/x')
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('https://graph.microsoft.com/v1.0/me/drive/root:/The%20Business%20Agent')
    expect(puts(f)).toEqual(['https://graph.microsoft.com/v1.0/me/drive/root:/The%20Business%20Agent/Timecards/week%2040.csv:/content'])
  })

  it('the OneDrive folder made under the old name ("Business Agent") is renamed, keeping what is in it', async () => {
    const calls: { method: string; url: string; body?: unknown }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.endsWith('/root:/The%20Business%20Agent')) return json({ error: { code: 'itemNotFound' } }, 404)
      return json({ id: 'old-folder', name: 'Business Agent' })
    }))
    expect(await ensureFolder('tok')).toBe('old-folder')
    expect(calls.map(c => `${c.method} ${c.url.replace('https://graph.microsoft.com/v1.0', '')}`)).toEqual([
      'GET /me/drive/root:/The%20Business%20Agent', 'GET /me/drive/root:/Business%20Agent', 'PATCH /me/drive/items/old-folder',
    ])
    expect(calls[2].body).toEqual({ name: 'The Business Agent' })
  })

  it('a folder in a folder ("Marketing/Competitions"), never above The Business Agent', async () => {
    const f = vi.fn(async () => json({ webUrl: 'https://onedrive.live.com/x' }))
    vi.stubGlobal('fetch', f)
    await saveFile('tok', 'Marketing/Competitions', 'bases.txt', 'x', 'text/plain')
    await saveFile('tok', '../Marketing', 'bases.txt', 'x', 'text/plain')
    expect(puts(f)).toEqual([
      'https://graph.microsoft.com/v1.0/me/drive/root:/The%20Business%20Agent/Marketing/Competitions/bases.txt:/content',
      'https://graph.microsoft.com/v1.0/me/drive/root:/The%20Business%20Agent/Marketing/bases.txt:/content',
    ])
  })
})

describe('Google Drive folders', () => {
  it('a folder in a folder ("Marketing/Competitions") is made one inside the other', async () => {
    const made: { name: string; parents: string[] }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/drive/v3/files?q=')) return json({ files: [] })
      if (url.includes('/drive/v3/files?fields=id')) { made.push(JSON.parse(String(init!.body))); return json({ id: `id-${made.length}` }) }
      return json({ webViewLink: 'https://drive.google.com/file/x' })
    }))
    await saveToDrive('tok', 'Marketing/Competitions', 'bases.txt', 'x', 'text/plain')
    expect(made.map(m => [m.name, m.parents[0]])).toEqual([['The Business Agent', 'root'], ['Marketing', 'id-1'], ['Competitions', 'id-2']])
  })
})
