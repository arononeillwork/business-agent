// The app tells The Business Agent about errors it runs into (shared/appErrors.ts, worker/errors.ts): its
// error screen (ErrorBoundary.tsx), and what the browser sees go wrong (the window's error event, and
// promises nobody caught). Each page sends at most a handful, each a different error, and only the error's
// message and stack, the page's path, the build and the browser: never what's in a form, never a token.
// Reports wait until the app knows how to send them (signed in, so the Worker knows whose it was; the
// demo sends none), or go plainly after a few seconds if the app never started.
import { MAX_REPORTS_PER_PAGE, clientReport, type ClientErrorKind, type ClientErrorReport } from '../../shared/appErrors'

type Send = (report: ClientErrorReport) => Promise<void>

/** What a page needs to know about where it is, so tests can say. */
export interface Where { path: () => string; build: () => string | null; userAgent: () => string }

/** Errors that say nothing about the app: a browser's own, an extension's, a dropped connection, a deploy's (newVersion.tsx reloads). */
export function ignorable(err: unknown, filename?: string | null): boolean {
  if (filename && /^(chrome|moz|safari(-web)?)-extension:/.test(filename)) return true
  if (err instanceof DOMException && err.name === 'AbortError') return true
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return /^ResizeObserver loop|^Script error\.?$|^(TypeError: )?(Failed to fetch|NetworkError when attempting to fetch resource\.?|Load failed)$/.test(message)
    || /dynamically imported module|Importing a module script failed|Unable to preload CSS/.test(message)
}

/** A reporter: at most `max` reports a page, each a different error, held until `start` says how to send. */
export function makeReporter(where: Where, max = MAX_REPORTS_PER_PAGE) {
  const seen = new Set<string>()
  let send: Send | null = null
  let waiting: ClientErrorReport[] = []
  const go = (s: Send, r: ClientErrorReport) => { s(r).catch(() => { /* a report that doesn't arrive is let go */ }) }
  return {
    report(err: unknown, kind: ClientErrorKind) {
      try {
        if (ignorable(err)) return
        const r = clientReport(err, kind, { path: where.path(), build: where.build(), userAgent: where.userAgent() })
        if (!r) return
        // The same error from the error screen and the window counts once.
        const key = `${r.message}\n${r.stack?.split('\n').slice(0, 2).join('\n') ?? ''}`
        if (seen.has(key) || seen.size >= max) return
        seen.add(key)
        if (send) go(send, r)
        else waiting.push(r)
      } catch { /* reporting never breaks the page */ }
    },
    /** How reports go from now on (and the ones waiting go now); null: none are sent. */
    start(s: Send | null) {
      send = s ?? (async () => {})
      const now = waiting
      waiting = []
      for (const r of now) go(send, r)
    },
    get started() { return send !== null },
  }
}

/** The app's main code file's name (index-<hash>), which says which build is running; none in development. */
export function buildId(): string | null {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src
  return src?.match(/\/assets\/([\w.-]+?)\.js/)?.[1] ?? null
}

const reporter = makeReporter({ path: () => location.pathname, build: buildId, userAgent: () => navigator.userAgent })

/** Report an error the app ran into (never throws). */
export const reportClientError = (err: unknown, kind: ClientErrorKind) => reporter.report(err, kind)

/** Send reports through the app's own connection (with the sign-in), from now on. */
export const sendErrorReportsWith = (send: Send | null) => reporter.start(send)

/** Straight to the Worker, without a sign-in: when the app never got as far as starting. */
const plainly: Send = async report => {
  await fetch('/api/errors', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) })
}

/** Listen for what the browser sees go wrong (main.tsx, once). */
export function listenForErrors() {
  // The demo-only build has no Worker to tell.
  if (import.meta.env.VITE_DEMO_ONLY === '1') { reporter.start(null); return }
  window.addEventListener('error', e => { if (!ignorable(e.error ?? e.message, e.filename)) reporter.report(e.error ?? e.message, 'error') })
  window.addEventListener('unhandledrejection', e => reporter.report(e.reason, 'promise'))
  setTimeout(() => { if (!reporter.started) reporter.start(plainly) }, 10_000)
}
