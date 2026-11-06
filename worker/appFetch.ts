// The Worker's own app, for tools that read what a page reads live (worker/pageTools.ts). Set once
// by worker/index.ts; a tool calls it in-process, so no request goes out over the network.
type AppFetch = (request: Request, env: unknown, ctx?: unknown) => Response | Promise<Response>

let appFetch: AppFetch | null = null

export const setAppFetch = (f: AppFetch) => { appFetch = f }
export const getAppFetch = () => appFetch
