// The in-app assistant (the button at the bottom right): questions answered by Claude, which can use the
// same tools as the AI connector (worker/tools.ts), run as the person asking through Supabase, so it can
// see and do only what they could in the app. A role that hides AI assistants (Roles & responsibilities)
// gets no assistant. Off until the Worker has an Anthropic API key (ANTHROPIC_API_KEY).
// It runs on The Business Agent's own key, so each plan includes a number of questions a month for the
// whole business (assistantPerMonth in shared/plans.ts, counted by the database: the
// assistant_allowance migration).
import Anthropic from '@anthropic-ai/sdk'
import { Hono } from 'hono'
import { z } from 'zod'
import { bearer, businessDb, userClient, type BusinessDb, type Env } from './supabase'
import { loadMe, runTool, toolsFor, type ToolContext, type ToolDef } from './tools'
import { permissionsOf, type JobRole } from '../shared/roles'
import { businessConfig } from '../shared/business.config'
import { defaultNumberFormat, formatMoneyAs, moneyText, numberFormatOf, type NumberFormat } from '../shared/time'

const MODEL = 'claude-opus-5-5'
/** Rounds of tool use in one answer before it gives up. */
const MAX_ROUNDS = 8
/** What one question may carry: the conversation so far, kept short. */
export const LIMITS = { messages: 40, chars: 8000 }

export interface ChatTurn { role: 'user' | 'assistant'; text: string }
/** The part of the SDK client the assistant uses, so tests can stand in for Claude. */
export type Claude = Pick<Anthropic['beta']['messages'], 'create'>

/**
 * How to write amounts for this person, as the app shows them: Ireland's "€15.00", with a decimal point;
 * Spain's "€15,00" or "15,00 €", with a decimal comma (their own choice on Appearance wins either way).
 */
const amounts = (f: NumberFormat) => `Write amounts the way the app shows them here, with a decimal ${f === 'point' ? 'point' : 'comma'}: ${formatMoneyAs(15, f)}`
  + `${f === 'point' ? '' : ` or ${moneyText(15, f)}`}, ${formatMoneyAs(1234.5, f)}. The tools give amounts as plain numbers (12.5 is ${formatMoneyAs(12.5, f)}).`

const instructions = (ctx: ToolContext, business: string) => `You are the assistant inside ${business}'s team app (rota, clock-ins, time off, the to-do list, stock, the menu and more).
You are talking with ${ctx.me.full_name}. Answer questions about the business and the app, using the tools to look things up rather than guessing.
The tools run as them: they show and change only what they could in the app. Call whoami first when you need to know who they are or what they can do.
Dates are YYYY-MM-DD and times 24-hour in the business's time zone. Answer in the language they write in, briefly, in plain words, without markdown tables.
${amounts(ctx.numbers ?? defaultNumberFormat())}
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

/** The business's questions this month: whether there was room for this one, and how many are used of how many (null: no limit). */
export interface Allowance { allowed: boolean; used: number; limit: number | null }

/**
 * Counts a question against the plan's allowance (1), or gives one back (-1) when Claude couldn't answer.
 * If the count can't be read, the question goes ahead: the allowance guards the bill, it shouldn't stop
 * the assistant working.
 */
export async function countQuestion(db: Pick<BusinessDb, 'rpc'>, change: 1 | -1 = 1): Promise<Allowance> {
  const { data, error } = await db.rpc('assistant_question', { p_change: change })
  if (error || !data) {
    console.warn(`The assistant's allowance couldn't be counted: ${error?.message ?? 'no answer'}`)
    return { allowed: true, used: 0, limit: null }
  }
  return data as Allowance
}

/** What someone is told once the business has used the month's questions. */
export const outOfQuestions = (a: Allowance) =>
  `Your business has used all ${a.limit} of this month’s questions to the assistant. They start again on the 1st, or an owner can upgrade on the Billing page for more.`

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
  // The plan's questions this month, counted for the person's business by the Worker (nobody can change the count from the app).
  const db = me.business_id && c.env.SUPABASE_SERVICE_ROLE_KEY ? businessDb(c.env, me.business_id) : null
  const allowance = db ? await countQuestion(db) : null
  if (allowance && !allowance.allowed) return c.json({ error: outOfQuestions(allowance), allowance }, 429)
  const { data: business } = await sb.from('business').select('name, country').maybeSingle()
  const biz = business as { name?: string; country?: string | null } | null
  // Their decimal mark (their own choice, else the business's country's): Claude is told it, and the tools write with it.
  const numbers = numberFormatOf(me.preferences?.numberFormat, biz?.country)
  const claude = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY }).beta.messages
  try {
    const reply = await answer(claude, { sb, me, env: c.env, origin: new URL(c.req.url).origin, numbers }, toolsFor(me), history,
      biz?.name ?? businessConfig.name)
    return c.json({ reply })
  } catch (e) {
    // Not answered: the question doesn't count.
    if (db) await countQuestion(db, -1)
    if (e instanceof Anthropic.RateLimitError) return c.json({ error: 'The assistant is busy. Try again in a minute.' }, 429)
    if (e instanceof Anthropic.AuthenticationError) return c.json({ error: 'The assistant’s API key isn’t working. An admin needs to check it.' }, 503)
    if (e instanceof Anthropic.APIError) return c.json({ error: 'The assistant couldn’t answer just now. Try again.' }, 502)
    throw e
  }
})
