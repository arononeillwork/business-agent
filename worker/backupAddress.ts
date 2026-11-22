// The AI connector on the backup address (businesssagent.vercel.app, ops/vercel-backup). Vercel passes
// every request on to the Worker's workers.dev address, so that's the host the Worker sees, and the
// connector's sign-in details named it: an AI given the backup's /mcp found a different address
// there and couldn't sign in (the sign-in page answered 500). The OAuth library also only serves a
// request whose own address is the one it advertises. So the connector's requests that came to the
// backup are answered as if sent to the backup address itself. A request came to the backup when:
//   - Vercel says so (x-forwarded-host), as it does for the AI's own requests; or
//   - it names the backup's connector as its resource: the sign-in page (in its address), signing in
//     (the page's form carries it) and tokens (in the form the AI sends). Vercel doesn't document passing
//     x-forwarded-host on, so a person's sign-in doesn't rely on it.
//
// Only the backup itself is believed, as anyone can send either: the most a forged one does is make the
// Worker answer as the backup, which is this same app. Only the connector's paths move; the rest of the
// app keeps the workers.dev address, where other apps' sign-in returns are registered (README, Custom domain).
import { businessConfig } from '../shared/business.config'

const BACKUP_HOST = new URL(businessConfig.backupUrl).host
/** The backup's connector, as an AI names it (the resource parameter). */
export const BACKUP_RESOURCE = `${businessConfig.backupUrl}/mcp`

/** The AI connector's paths: /mcp, the OAuth sign-in and token endpoints, and their discovery files. */
const CONNECTOR_PATH = /^\/(?:mcp(?:\/|$)|authorize$|token$|register$|\.well-known\/(?:oauth-authorization-server|oauth-protected-resource|openid-configuration)(?:\/|$))/

/** The host a request was sent to before Vercel passed it on, when that is the backup address. */
export function backupHost(request: Request): string | null {
  const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim().toLowerCase()
  return host === BACKUP_HOST ? host : null
}

/** Whether a sign-in or token request names the backup's connector as its resource. */
async function namesBackup(request: Request, url: URL): Promise<boolean> {
  if (url.searchParams.getAll('resource').includes(BACKUP_RESOURCE)) return true
  if (request.method !== 'POST' || !/^\/(?:authorize|token)$/.test(url.pathname)) return false
  if (!request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) return false
  try {
    return (await request.clone().formData()).getAll('resource').includes(BACKUP_RESOURCE)
  } catch {
    return false
  }
}

/** The request as if sent to the backup address, for the connector's paths when it came to the backup. */
export async function asBackupAddress<R extends Request>(request: R): Promise<R | Request> {
  const url = new URL(request.url)
  if (url.host === BACKUP_HOST || !CONNECTOR_PATH.test(url.pathname)) return request
  if (!backupHost(request) && !(await namesBackup(request, url))) return request
  url.protocol = 'https:'
  url.host = BACKUP_HOST
  return new Request(url, request)
}
