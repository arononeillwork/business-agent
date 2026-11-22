// The AI connector on the backup address (businesssagent.vercel.app, ops/vercel-backup). Vercel passes
// every request on to the Worker's workers.dev address, so that's the host the Worker sees, and the
// connector's sign-in details named it: an AI given the backup's /mcp found a different address
// there and couldn't sign in (the sign-in page answered 500). The OAuth library also only serves a
// request whose own address is the one it advertises. So the connector's requests that Vercel says
// came to the backup (x-forwarded-host) are answered as if sent to the backup address itself.
//
// Only the backup's own host is believed, as anyone can send the header: the most a forged one
// does is make the Worker answer as the backup, which is this same app. Only the connector's paths
// move; the rest of the app keeps the workers.dev address, where other apps' sign-in returns are
// registered (README, Custom domain).
import { businessConfig } from '../shared/business.config'

const BACKUP_HOST = new URL(businessConfig.backupUrl).host

/** The AI connector's paths: /mcp, the OAuth sign-in and token endpoints, and their discovery files. */
const CONNECTOR_PATH = /^\/(?:mcp(?:\/|$)|authorize$|token$|register$|\.well-known\/(?:oauth-authorization-server|oauth-protected-resource|openid-configuration)(?:\/|$))/

/** The host a request was sent to before Vercel passed it on, when that is the backup address. */
export function backupHost(request: Request): string | null {
  const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim().toLowerCase()
  return host === BACKUP_HOST ? host : null
}

/** The request as if sent to the backup address, for the connector's paths when it came through there. */
export function asBackupAddress<R extends Request>(request: R): R | Request {
  const host = backupHost(request)
  if (!host) return request
  const url = new URL(request.url)
  if (url.host === host || !CONNECTOR_PATH.test(url.pathname)) return request
  url.protocol = 'https:'
  url.host = host
  return new Request(url, request)
}
