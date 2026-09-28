import { afterEach, describe, expect, it, vi } from 'vitest'
import { alertEmail, base64url, mimeMessage } from '../shared/alertText'
import { saveToDrive, sendGmail } from './providers/google'
import { authUrl, saveFile, MS_SCOPES } from './providers/microsoft'

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

  it('saves into Business Agent/<folder>, making the folders the first time', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url.split('?')[0]}`)
      if (url.includes('/drive/v3/files?q=')) return json({ files: [] })
      if (url.includes('/drive/v3/files?fields=id')) return json({ id: `folder-${calls.length}` })
      return json({ webViewLink: 'https://drive.google.com/file/x' })
    }))
    expect(await saveToDrive('tok', 'Timecards', 'week.csv', 'a;b', 'text/csv')).toBe('https://drive.google.com/file/x')
    expect(calls).toEqual([
      'GET https://www.googleapis.com/drive/v3/files', 'POST https://www.googleapis.com/drive/v3/files',
      'GET https://www.googleapis.com/drive/v3/files', 'POST https://www.googleapis.com/drive/v3/files',
      'POST https://www.googleapis.com/upload/drive/v3/files',
    ])
  })
})

describe('Outlook and OneDrive', () => {
  it('asks only for what each connection needs, with offline access', () => {
    const url = new URL(authUrl({ clientId: 'c', clientSecret: 's', redirectUri: 'https://x/cb' }, 'st', MS_SCOPES.onedrive))
    expect(url.searchParams.get('scope')).toBe('offline_access openid email User.Read Files.ReadWrite')
    expect(url.searchParams.get('scope')).not.toContain('Mail')
  })

  it('saves into Business Agent/<folder> in OneDrive', async () => {
    const f = vi.fn(async () => json({ webUrl: 'https://onedrive.live.com/x' }))
    vi.stubGlobal('fetch', f)
    expect(await saveFile('tok', 'Timecards', 'week 40.csv', 'a;b', 'text/csv')).toBe('https://onedrive.live.com/x')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/drive/root:/Business%20Agent/Timecards/week%2040.csv:/content')
    expect(init.method).toBe('PUT')
  })
})
