// Telling The Business Agent about a problem (support tickets, shared/supportTickets.ts): what someone wrote,
// with the page they were on, the app's build and their browser. Help (HelpDialog.tsx) sends through the
// app's own connection; the error screen (ErrorBoundary.tsx) can be in place of the whole app, outside it, so
// the app hands its connection over here once it has one (AppContext.tsx) and the screen sends through that.
import { cleanDraft, type SupportDraft, type SupportKind } from '../../shared/supportTickets'
import { t } from '../i18n'
import { buildId } from './errorReports'

type Send = (draft: SupportDraft) => Promise<{ id: number; duplicate: boolean }>

let send: Send | null = null

/** How requests go from now on (AppContext.tsx, once the app has its connection). */
export const sendSupportWith = (s: Send | null) => { send = s }

/** Whether a request can be sent from here (not before the app has a connection). */
export const canSendSupport = () => send !== null

/** Send a request through the app's connection. */
export function sendSupport(draft: SupportDraft) {
  if (!send) return Promise.reject(new Error(t('The app isn’t connected yet. Reload, then try again.')))
  return send(draft)
}

/** A request from where the person is now: what they wrote, the page's path, the build and the browser. */
export function draftHere(kind: SupportKind, message: string, path: string, errorFingerprint: string | null = null): SupportDraft {
  return cleanDraft({ kind, message, page: path, app_version: buildId(), browser: navigator.userAgent, error_fingerprint: errorFingerprint })
}
