import { describe, expect, it } from 'vitest'
import { bytesPerDay, cameraProblem, clipPlace, clipStart, clipsByDay, fileTime, isLive, sizeText, type CameraClip } from './cameras'

const clip = (id: string, started_at: string, bytes = 1000): CameraClip => ({ id, camera_id: 'c', started_at, seconds: 30, bytes, storage: 'google_drive', file_id: id,
  file_name: `${id}.mp4`, link: null, motion: true, kept: false, note: null, created_at: started_at })

describe('cameras', () => {
  it('read the camera’s own time in its file names', () => {
    expect(fileTime('Counter_00_20261030101500.mp4')).toEqual({ date: '2026-10-30', time: '10:15:00' })
    expect(fileTime('RecM01_20261030_101500_101530.mp4')).toEqual({ date: '2026-10-30', time: '10:15:00' })
    expect(fileTime('Counter_00_20261399101500.mp4')).toBeNull()
    expect(fileTime('clip.mp4')).toBeNull()
  })

  it('start a clip at the camera’s time when its clock is right, else when it arrived less its length', () => {
    // 10:15 in Madrid is 08:15 UTC in summer time and 09:15 in winter.
    expect(clipStart('Counter_00_20260930101500.mp4', '2026-09-30T08:15:40Z', 30, 'Europe/Madrid')).toBe('2026-09-30T08:15:00.000Z')
    expect(clipStart('Counter_00_20261030101500.mp4', '2026-10-30T09:15:40Z', 30, 'Europe/Madrid')).toBe('2026-10-30T09:15:00.000Z')
    expect(clipStart('Counter_00_20200101000000.mp4', '2026-10-30T09:15:40Z', 30, 'Europe/Madrid')).toBe('2026-10-30T09:15:10.000Z')
    expect(clipStart('clip.mp4', '2026-10-30T09:15:40Z', null, 'Europe/Madrid')).toBe('2026-10-30T09:15:40.000Z')
  })

  it('put a clip in its camera’s folder for the local day, named by the local time', () => {
    expect(clipPlace('Counter', '2026-10-30T23:30:05Z', 'Europe/Madrid')).toEqual({ folder: ['Cameras', 'Counter', '2026-10-31'], name: '00.30.05.mp4' })
    expect(clipPlace('Terrace', '2026-10-30T23:30:05Z', 'Atlantic/Canary')).toEqual({ folder: ['Cameras', 'Terrace', '2026-10-30'], name: '23.30.05.mp4' })
  })

  it('show clips by local day, newest first', () => {
    const days = clipsByDay([clip('a', '2026-10-30T08:00:00Z'), clip('b', '2026-10-30T23:30:00Z'), clip('c', '2026-10-30T12:00:00Z')], 'Europe/Madrid')
    expect(days.map(d => [d.day, d.clips.map(c => c.id)])).toEqual([['2026-10-31', ['b']], ['2026-10-30', ['c', 'a']]])
  })

  it('say about how much space a day the video takes', () => {
    const now = Date.parse('2026-10-30T12:00:00Z')
    expect(bytesPerDay([], now)).toBeNull()
    expect(bytesPerDay([clip('a', '2026-10-28T12:00:00Z', 2000), clip('b', '2026-10-30T11:00:00Z', 2000)], now)).toBe(2000)
    expect(bytesPerDay([clip('a', '2026-10-30T11:00:00Z', 500)], now)).toBe(500)
    expect(bytesPerDay([clip('old', '2026-10-01T12:00:00Z', 9e9)], now)).toBeNull()
    expect(sizeText(4.2 * 1024 * 1024)).toBe('4.2 MB')
    expect(sizeText(1.5 * 1024 ** 3)).toBe('1.5 GB')
  })

  it('check a camera’s name and days, and when it’s sending', () => {
    expect(cameraProblem({ name: 'Counter', keep_days: 30 })).toBeNull()
    expect(cameraProblem({ name: '  ', keep_days: 30 })).toBe('Give the camera a name')
    expect(cameraProblem({ name: 'Back/door', keep_days: 30 })).toMatch(/leave out/)
    expect(cameraProblem({ name: 'Counter', keep_days: 31 })).toBe('Keep video for between 1 and 30 days')
    const now = Date.parse('2026-10-30T12:00:00Z')
    expect(isLive({ picture_at: '2026-10-30T11:59:30Z', video_at: null, kept_today: 0, skipped_today: 0 }, now)).toBe(true)
    expect(isLive({ picture_at: '2026-10-30T11:50:00Z', video_at: null, kept_today: 0, skipped_today: 0 }, now)).toBe(false)
    expect(isLive(undefined, now)).toBe(false)
  })
})
