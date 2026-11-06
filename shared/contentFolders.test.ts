import { describe, expect, it } from 'vitest'
import { RESYNC_MS, dueForSync, folderFileKind, syncPlan } from './contentFolders'

describe('folderFileKind', () => {
  it('shows JPEG, PNG and WebP photos and MP4 and MOV videos, by type or by name', () => {
    expect(folderFileKind('IMG_2041.JPG')).toEqual({ kind: 'photo', ext: 'jpg' })
    expect(folderFileKind('latte.jpeg')).toEqual({ kind: 'photo', ext: 'jpg' })
    expect(folderFileKind('photo', 'image/png')).toEqual({ kind: 'photo', ext: 'png' })
    expect(folderFileKind('clip.MOV')).toEqual({ kind: 'video', ext: 'mov' })
    expect(folderFileKind('clip', 'video/mp4')).toEqual({ kind: 'video', ext: 'mp4' })
  })

  it('leaves out what a browser can’t show (an iPhone’s HEIC) and anything else', () => {
    expect(folderFileKind('IMG_2042.HEIC')).toBeNull()
    expect(folderFileKind('IMG_2042.heic', 'image/heic')).toBeNull()
    expect(folderFileKind('menu.pdf', 'application/pdf')).toBeNull()
    expect(folderFileKind('notes')).toBeNull()
  })
})

describe('syncPlan', () => {
  it('adds what’s new in the folder and takes off what’s gone from it, leaving the rest', () => {
    expect(syncPlan(['a', 'b', 'c'], [{ id: 'b' }, { id: 'c' }, { id: 'd' }])).toEqual({ add: [{ id: 'd' }], remove: ['a'] })
    expect(syncPlan([], [])).toEqual({ add: [], remove: [] })
  })
})

describe('dueForSync', () => {
  it('is due when never looked at, or after five minutes', () => {
    const now = Date.parse('2026-11-06T12:00:00Z')
    expect(dueForSync({ last_synced_at: null }, now)).toBe(true)
    expect(dueForSync({ last_synced_at: new Date(now - RESYNC_MS + 1000).toISOString() }, now)).toBe(false)
    expect(dueForSync({ last_synced_at: new Date(now - RESYNC_MS).toISOString() }, now)).toBe(true)
  })
})
