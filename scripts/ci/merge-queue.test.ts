import { describe, expect, it } from 'vitest'
import { checksState } from './merge-queue'

const run = (name: string, conclusion: string | null, started_at = '2026-10-24T10:00:00Z', status = 'completed') =>
  ({ name, status, conclusion, started_at })

describe("whether a pull request's own CI lets it into the merge queue", () => {
  it('is green when every check passed', () => {
    expect(checksState([run('checks', 'success'), run('browser (1/3)', 'success')])).toBe('green')
  })

  it('waits while a check runs, or before any has', () => {
    expect(checksState([run('checks', 'success'), run('browser (1/3)', null, undefined, 'in_progress')])).toBe('waiting')
    expect(checksState([])).toBe('waiting')
  })

  it('ignores the skipped copy of CI that pull requests from this repo get', () => {
    expect(checksState([run('checks', 'success', '2026-10-24T10:00:00Z'), run('checks', 'skipped', '2026-10-24T10:01:00Z')])).toBe('green')
    expect(checksState([run('checks', 'failure', '2026-10-24T10:00:00Z'), run('checks', 'skipped', '2026-10-24T10:01:00Z')])).toBe('red')
  })

  it('leaves out the merge queue’s own jobs on the same commit, running or done', () => {
    const queue = new Set([7])
    const own = (name: string, conclusion: string | null, status = 'completed') => ({ ...run(name, conclusion, '2026-10-24T10:30:00Z', status), check_suite: { id: 7 } })
    const ci = [{ ...run('checks', 'success'), check_suite: { id: 3 } }, { ...run('browser (1/3)', 'success'), check_suite: { id: 3 } }]
    // Marked ready after its CI finished: the round that starts looks while its own prepare job runs.
    expect(checksState([...ci, own('prepare', null, 'in_progress')], queue)).toBe('green')
    expect(checksState([...ci, own('prepare', 'success'), own('finish', 'failure')], queue)).toBe('green')
    expect(checksState([...ci, own('prepare', null, 'in_progress')])).toBe('waiting') // as it was
    // Nothing but the queue's own: no CI yet.
    expect(checksState([own('prepare', 'success')], queue)).toBe('waiting')
  })

  it('counts a re-run over the failure before it', () => {
    expect(checksState([run('browser (2/3)', 'failure', '2026-10-24T10:00:00Z'), run('browser (2/3)', 'success', '2026-10-24T10:20:00Z')])).toBe('green')
    expect(checksState([run('checks', 'success'), run('browser (2/3)', 'cancelled')])).toBe('red')
  })
})
