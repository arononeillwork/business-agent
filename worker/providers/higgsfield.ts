// Higgsfield (https://docs.higgsfield.ai): AI images for the Menu page, with the business's own API
// key (an id and a secret, from higgsfield.ai → API keys), sent as "Authorization: Key id:secret".
// Making an image is asynchronous: the request is accepted straight away with its status address;
// Higgsfield calls our webhook when it's done (and we can ask the status address). Finished images
// stay at Higgsfield for at least 7 days, so the Worker copies each into the café's own storage.
import { aiErrorText, readAiResult, type AiRequest, type AiResult } from '../../shared/menu'

export const HIGGSFIELD_API = 'https://api.higgsfield.ai'

export interface HiggsfieldKey { key_id: string; key_secret: string }

/** A problem Higgsfield reported (in plain words), with its HTTP status. */
export class HiggsfieldError extends Error { constructor(message: string, readonly status: number) { super(message) } }

const headers = (k: HiggsfieldKey) => ({ authorization: `Key ${k.key_id}:${k.key_secret}`, accept: 'application/json' })

async function fail(res: Response): Promise<never> {
  throw new HiggsfieldError(aiErrorText(res.status, await res.json().catch(() => null)), res.status)
}

/**
 * Prove a key works without spending credits: ask about a request that doesn't exist. A key
 * Higgsfield accepts gets 404 (no such request for this account); a wrong one gets 401.
 */
export async function prove(k: HiggsfieldKey): Promise<void> {
  const res = await fetch(`${HIGGSFIELD_API}/requests/00000000-0000-4000-8000-000000000000/status`, { headers: headers(k) })
  if (res.ok || res.status === 404 || res.status === 403) return
  await fail(res)
}

/**
 * Ask for an image. `key`: our own id for it, sent as the Idempotency-Key, so a retry after a
 * timeout doesn't make (and charge for) a second one. `webhook`: where Higgsfield says it's done.
 */
export async function submit(k: HiggsfieldKey, req: AiRequest, opts: { key: string; webhook?: string | null }): Promise<{ requestId: string; statusUrl: string }> {
  const url = `${HIGGSFIELD_API}/${req.endpoint}${opts.webhook ? `?hf_webhook=${encodeURIComponent(opts.webhook)}` : ''}`
  const res = await fetch(url, { method: 'POST', headers: { ...headers(k), 'content-type': 'application/json', 'idempotency-key': opts.key }, body: JSON.stringify(req.body) })
  if (!res.ok) await fail(res)
  const json = await res.json() as { request_id?: string; status_url?: string }
  if (!json.request_id) throw new HiggsfieldError('Higgsfield didn’t return a request. Try again.', 502)
  return { requestId: json.request_id, statusUrl: json.status_url ?? `${HIGGSFIELD_API}/requests/${json.request_id}/status` }
}

/** How a request is going (only Higgsfield's own status addresses are asked). */
export async function status(k: HiggsfieldKey, statusUrl: string): Promise<AiResult> {
  if (!statusUrl.startsWith(`${HIGGSFIELD_API}/`)) throw new HiggsfieldError('That isn’t a Higgsfield request', 400)
  const res = await fetch(statusUrl, { headers: headers(k) })
  if (!res.ok) await fail(res)
  return readAiResult(await res.json())
}
