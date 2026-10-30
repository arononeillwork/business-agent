// The in-app assistant (the button at the bottom right): questions answered by Claude, which can use the
// same tools as the AI connector (worker/tools.ts), run as the person asking through Supabase, so it can
// see and do only what they could in the app. A role that hides AI assistants (Roles & responsibilities)
// gets no assistant. Off until the Worker has an Anthropic API key (ANTHROPIC_API_KEY).
import Anthropic from '@anthropic-ai/sdk'
import { Hono } from 'hono'
import { z } from 'zod'
import { bearer, userClient, type Env } from './supabase'
import { loadMe, runTool, toolsFor, type ToolContext, type ToolDef } from './tools'
import { permissionsOf, type JobRole } from '../shared/roles'
import { businessConfig } from '../shared/business.config'

const MODEL = 'claude-opus-5-5'
/** Rounds of tool use in one answer before it gives up. */
const MAX_ROUNDS = 8
/** What one question may carry: the conversation so far, kept short. */
export const LIMITS = { messages: 40, chars: 8000 }

export interface ChatTurn { role: 'user' | 'assistant'; text: string }
/** The part of the SDK client the assistant uses, so tests can stand in for Claude. */
export type Claude = Pick<Anthropic['beta']['messages'], 'create'>

const instructions = (ctx: ToolContext, business: string) => `You are the assistant inside ${business}'s team app (rota, clock-ins, time off, the to-do list, stock, the menu and more).
You are talking with ${ctx.me.full_name}. Answer questions about the business and the app, using the tools to look things up rather than guessing.
The tools run as them: they show and change only what they could in the app. Call whoami first when you need to know who they are or what they can do.
Dates are YYYY-MM-DD and times 24-hour in the business's time zone. Answer in the language they write in, briefly, in plain words, without markdown tables.
Before deleting anything or changing several things at once, say what you will do and ask them to confirm. Everything you change is logged as made via AI on their behalf.`

/** A question, answered: Claude runs the person's tools as it needs them, then replies. */
export async function answer(claude: Claude, ctx: ToolContext, tools: ToolDef[], history: ChatTurn[], business: string): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map(t => ({ role: t.role, content: t.text }))
  const offered: Anthropic.Beta.BetaTool[] = tools.map(t => {
    const { $schema: _, ...schema } = z.toJSONSchema(t.input) as Record<string, unknown>
    return { name: t.name, description: t.description, input_schema: schema as Anthropic.Beta.BetaTool.InputSchema }
  })
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await claude.create({
      model: MODEL,
      max_tokens: 16000,
      // On a policy decline, the API answers with another model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // The instructions and the tools are the same every time: cached.
      cache_control: { type: 'ephemeral' },
      system: instructions(ctx, business),
      tools: offered,
      messages,
    })
    const text = response.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n').trim()
    if (response.stop_reason === 'refusal') return 'I can’t help with that one.'
    const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (response.stop_reason !== 'tool_use' || !uses.length) return text || 'I don’t have an answer for that.'
    messages.push({ role: 'assistant', content: response.content })
    // Every tool asked for in this round, answered together in one message.
    const results = await Promise.all(uses.map(async (use): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
      const tool = tools.find(t => t.name === use.name)
      if (!tool) return { type: 'tool_result', tool_use_id: use.id, is_error: true, content: `There is no tool called ${use.name}` }
      try {
        return { type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(await runTool(tool, ctx, use.input)) }
      } catch (e) {
        return { type: 'tool_result', tool_use_id: use.id, is_error: true, content: e instanceof Error ? e.message : String(e) }
      }
    }))
    messages.push({ role: 'user', content: results })
  }
  return 'That took too many steps. Try asking a smaller question.'
}

/** The conversation as sent by the app: turns of text, the last one theirs, within the limits. */
export function readHistory(body: unknown): ChatTurn[] | null {
  const turns = (body as { messages?: unknown })?.messages
  if (!Array.isArray(turns) || !turns.length || turns.length > LIMITS.messages) return null
  const ok = turns.every(t => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string' && t.text.trim() && t.text.length <= LIMITS.chars)
  return ok && turns[turns.length - 1].role === 'user' ? turns.map(t => ({ role: t.role, text: t.text })) : null
}

export const assistant = new Hono<{ Bindings: Env }>()

/** Whether the assistant is set up (the app shows its button only then, or tells admins what it needs). */
assistant.get('/api/assistant/status', c => c.json({ ready: !!c.env.ANTHROPIC_API_KEY }))

assistant.post('/api/assistant', async c => {
  if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: 'The assistant isn’t set up yet: it needs an Anthropic API key.' }, 503)
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const sb = userClient(c.env, token, 'ai')
  let me
  try {
    me = await loadMe(sb, token)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 401)
  }
  // A role that hides AI assistants (Roles & responsibilities) leaves the assistant out too.
  const { data: roles } = await sb.from('job_roles').select('people, permissions')
  if (permissionsOf(me, (roles ?? []) as JobRole[]).ai === 'none') return c.json({ error: 'Your role doesn’t include the assistant' }, 403)
  const history = readHistory(await c.req.json().catch(() => null))
  if (!history) return c.json({ error: `Send up to ${LIMITS.messages} messages of up to ${LIMITS.chars} characters, the last one yours` }, 400)
  const { data: business } = await sb.from('business').select('name').maybeSingle()
  const claude = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY }).beta.messages
  try {
    const reply = await answer(claude, { sb, me, env: c.env, origin: new URL(c.req.url).origin }, toolsFor(me), history,
      (business as { name?: string } | null)?.name ?? businessConfig.name)
    return c.json({ reply })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return c.json({ error: 'The assistant is busy. Try again in a minute.' }, 429)
    if (e instanceof Anthropic.AuthenticationError) return c.json({ error: 'The assistant’s API key isn’t working. An admin needs to check it.' }, 503)
    if (e instanceof Anthropic.APIError) return c.json({ error: 'The assistant couldn’t answer just now. Try again.' }, 502)
    throw e
  }
})
