// The Contacts tools for AI assistants: finding someone to call, and adding or changing a contact; the
// owners' own. The database's rule is proven in supabase/tests/zz_y_business_contacts.test.sql.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOLS, runTool, toolsFor } from './tools'
import { serviceClient, type Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { EASY_BEANS_CONTACTS } from '../shared/contacts'
import type { Profile } from '../shared/types'

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' } as unknown as Env
const owner = { id: 'u-owner', full_name: 'Aron', role: 'admin', active: true, can_see_pay: true } as Profile
const manager = { id: 'u-manager', full_name: 'Manu', role: 'admin', active: true, can_see_pay: false } as Profile
const employee = { id: 'u-staff', full_name: 'Julio', role: 'employee', active: true, can_see_pay: false } as Profile
const partner = { id: 'u-partner', full_name: 'Laura', role: 'partner', active: true, partner_access: ['finances', 'payroll'] } as Profile

let db: FakeSupabase
const run = (name: string, args: unknown, me = owner) => runTool(TOOLS.find(t => t.name === name)!, { sb: serviceClient(env), me }, args)
type Out = { contacts: Row[]; note?: string }

beforeEach(() => {
  db = new FakeSupabase()
  db.tables.business_contacts = EASY_BEANS_CONTACTS.map((c, i) => ({ id: `c${i + 1}`, ...c }))
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const row = (name: string) => db.table('business_contacts').find(c => c.name === name)!

describe('contact tools', () => {
  it('lists the contacts in order of what they do, with how to reach them', async () => {
    const out = await run('list_contacts', {}) as Out
    expect(out.contacts.map(c => c.name)).toEqual(['Daniel Cruz Luna', 'Eduardo Torquino', 'Miguel'])
    expect(out.contacts[0]).toEqual({ id: 'c2', name: 'Daniel Cruz Luna', what_they_do: 'Bank advisor', company: 'BBVA', phone: '+34 955 677 963', whatsapp: false,
      email: 'daniel.cruz.luna@bbva.com', website: 'https://www.bbva.es', notes: null })
  })

  it('finds someone to call by what they do or their number', async () => {
    expect((await run('list_contacts', { search: 'plumber' }) as Out).contacts.map(c => [c.name, c.phone])).toEqual([['Miguel', '+34 632 042 132']])
    expect((await run('list_contacts', { search: '758 327' }) as Out).contacts.map(c => c.name)).toEqual(['Eduardo Torquino'])
    const none = await run('list_contacts', { search: 'locksmith' }) as Out
    expect(none.contacts).toEqual([])
    expect(none.note).toMatch(/Nobody matches "locksmith"\. On file: Daniel Cruz Luna, Eduardo Torquino, Miguel/)
  })

  it('adds someone, tidied: a usual job by its English name, the phone and website the usual way', async () => {
    const out = await run('save_contact', { name: 'Cerrajería Rápida', what_they_do: 'locksmith', phone: '600123456', whatsapp: true, website: 'cerrajeria.example' }) as { added: Row }
    expect(out.added).toMatchObject({ name: 'Cerrajería Rápida', what_they_do: 'Locksmith', phone: '+34 600 123 456', whatsapp: true,
      website: 'https://cerrajeria.example' })
    expect(row('Cerrajería Rápida')).toMatchObject({ job: 'Locksmith', phone: '+34 600 123 456' })
    await expect(run('save_contact', { name: 'miguel' })).rejects.toThrow(/already on file/)
    await expect(run('save_contact', { phone: '600' })).rejects.toThrow(/needs a name/)
  })

  it('changes one found by name, leaving the rest as it was; "" clears a field', async () => {
    const out = await run('save_contact', { contact: 'Miguel', notes: 'Comes the same day for leaks.' }) as { updated: Row }
    expect(out.updated).toMatchObject({ name: 'Miguel', what_they_do: 'Plumber & electrician', phone: '+34 632 042 132', whatsapp: true, notes: 'Comes the same day for leaks.' })
    await run('save_contact', { contact: 'Daniel', website: '' })
    expect(row('Daniel Cruz Luna')).toMatchObject({ website: null, company: 'BBVA', email: 'daniel.cruz.luna@bbva.com' })
    await expect(run('save_contact', { contact: 'Miguel' })).rejects.toThrow('Nothing to change')
    await expect(run('save_contact', { contact: 'nobody', phone: '600123456' })).rejects.toThrow(/No contact matches/)
    await expect(run('save_contact', { contact: 'Miguel', phone: '12' })).rejects.toThrow(/country code/)
    await expect(run('save_contact', { contact: 'Miguel', email: 'miguel@' })).rejects.toThrow(/full email address/)
  })

  it('is for the owners only: not shop managers, employees or partners', async () => {
    const names = (me: Profile) => toolsFor(me).map(t => t.name).filter(n => ['list_contacts', 'save_contact'].includes(n))
    expect(names(owner)).toEqual(['list_contacts', 'save_contact'])
    expect(names(employee)).toEqual([])
    expect(names(partner)).toEqual([])
    // A shop manager is an admin without pay access: offered the admins' tools, but turned away.
    await expect(run('list_contacts', {}, manager)).rejects.toThrow('Only the owners see the contacts')
    await expect(run('save_contact', { contact: 'Miguel', notes: 'x' }, manager)).rejects.toThrow('Only the owners see the contacts')
    await expect(run('list_contacts', {}, employee)).rejects.toThrow('Only admins can do that')
    expect(row('Miguel').notes).toBeNull()
  })
})
