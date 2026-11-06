// Dashboards → Reports: a report put together on the Dashboards page (its figures written out in the
// app, from what the person can see) emailed from the business's connected Gmail or Outlook, one email
// to each person picked (someone on the team, a contact, any address), so nobody sees who else got it.
// Admins only, who can already email from that mailbox on the Email page; 20 people at most at once.
import { Hono } from 'hono'
import { bearer, businessDb, type Env } from './supabase'
import { sendEmail } from './integrations'
import { reportSendProblem, type ReportSend, type ReportSent } from '../shared/reports'
import { signInCheck } from './signedIn'

export const reports = new Hono<{ Bindings: Env }>()

reports.post('/api/reports/send', async c => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const [{ data: isAdmin }, { data: businessId }] = await Promise.all([signInCheck(c.env, token, 'is_admin'), signInCheck(c.env, token, 'current_business_id')])
  if (!isAdmin || !businessId) return c.json({ error: 'Only an admin can send reports' }, 403)
  const body = await c.req.json<Partial<ReportSend>>().catch(() => ({}) as Partial<ReportSend>)
  const problem = reportSendProblem(body)
  if (problem) return c.json({ error: problem }, 400)
  const db = businessDb(c.env, businessId as number)
  const out: ReportSent = { sent: [], failed: [] }
  for (const to of [...new Set(body.to!.map(x => x.trim().toLowerCase()))]) {
    try {
      await sendEmail(c.env, db, { to, subject: body.subject!.trim(), text: body.text! })
      out.sent.push(to)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      // No mailbox, or its access gone: the rest would fail the same way.
      if (!out.sent.length && /No mailbox connected|Connect .* again|permission/i.test(error)) return c.json({ error }, 409)
      out.failed.push({ to, error })
    }
  }
  return c.json(out)
})
