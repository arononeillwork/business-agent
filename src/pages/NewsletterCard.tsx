import {
  Alert, Box, Button, Card, CardContent, Chip, FormControlLabel, IconButton, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/AddRounded'
import CopyIcon from '@mui/icons-material/ContentCopyRounded'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import UploadIcon from '@mui/icons-material/UploadFileRounded'
import KeyIcon from '@mui/icons-material/KeyRounded'
import { useMemo, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { ErrorBox, SectionTitle, Tag } from '../components/common'
import { decodeCsv } from '../../shared/customers'
import { LANGUAGES } from '../../shared/i18n'
import {
  FORM_TEXT, MAX_INTERESTS, embedSnippet, formUrl, interestKey, interestsProblem, readList, signupUrl,
  type FormLanguage, type ListRow, type NewsletterEvent, type NewsletterInterest, type NewsletterSettings,
} from '../../shared/newsletter'
import { formPage } from '../../shared/newsletterForm'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

type Draft = Pick<NewsletterSettings, 'interests' | 'ask_name' | 'ask_phone' | 'heading' | 'intro'>
/** The business's number, in the form's address (the demo's business has none: Easy Beans is 1). */
const businessNumber = (b: { id?: number } | null) => b?.id ?? 1
const VIA: Record<NewsletterEvent['via'], string> = { form: msg('The form here'), website: msg('Your website'), import: msg('A list brought in') }
const code = { p: 1.25, borderRadius: 2, bgcolor: tokens.surfaceAlt, border: 1, borderColor: 'divider', fontFamily: 'ui-monospace, monospace', fontSize: 12.5,
  wordBreak: 'break-all', whiteSpace: 'pre-wrap', m: 0 } as const

/**
 * Newsletter sign-ups (Website & SEO): the business's website takes sign-ups into Customers, each person
 * a lead from the website with a yes to marketing and the topics they ticked as tags, so Campaigns can
 * send to them. Admins choose the topics and what the form asks, and put the form on the website: a
 * link, a snippet to paste, or the website's own form sending here. A list from before comes in too.
 */
export function NewsletterCard() {
  const { api } = useApp()
  const run = useAction()
  const data = useAsync('newsletter', () => api.newsletter(), [])
  const s = data.data
  return (
    <Card component="section" aria-label={t('Newsletter sign-ups')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Newsletter sign-ups')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('People who sign up for the newsletter on your website go straight onto Customers, as leads from the website who said yes to marketing, with the topics they picked as tags. Campaigns can then send to just the people interested in each topic.')}
        </Typography>
        <ErrorBox error={data.error} />
        {s && <>
          <FormControlLabel control={<Switch checked={s.enabled} onChange={e => void run(() => api.saveNewsletter({ enabled: e.target.checked }),
            e.target.checked ? t('The website can take sign-ups') : t('The website no longer takes sign-ups'))} />}
            label={t('Take newsletter sign-ups')} />
          {s.enabled && <>
            <Signups settings={s} />
            <FormSetup key={JSON.stringify([s.interests, s.ask_name, s.ask_phone, s.heading, s.intro])} settings={s} />
            <OnYourWebsite settings={s} />
            <BringInList />
          </>}
        </>}
      </CardContent>
    </Card>
  )
}

/** Who's signed up: how many, for each topic, and the latest sign-ups and unsubscribes. */
function Signups({ settings }: { settings: NewsletterSettings }) {
  const { api } = useApp()
  const events = useAsync('newsletter-events', () => api.newsletterEvents(), [])
  const customers = useAsync('customers', () => api.customers(), [])
  const [all, setAll] = useState(false)
  const list = events.data ?? []
  // Each person's topics, from their sign-ups; counted while they still say yes to marketing.
  const { subscribed, byTopic } = useMemo(() => {
    const topics = new Map<string, Set<string>>()
    for (const e of list) if (e.action === 'signup') topics.set(e.customer_id, new Set([...(topics.get(e.customer_id) ?? []), ...e.interests]))
    const yes = (customers.data ?? []).filter(c => c.marketing_consent && topics.has(c.id))
    return { subscribed: yes.length, byTopic: settings.interests.map(i => ({ i, n: yes.filter(c => topics.get(c.id)!.has(i.key)).length })) }
  }, [list, customers.data, settings.interests])
  const label = (key: string) => settings.interests.find(i => i.key === key)?.label ?? key
  const shown = all ? list : list.slice(0, 8)
  return (
    <Box component="section" aria-label={t('Who’s signed up')} sx={{ mt: 2 }}>
      <ErrorBox error={events.error ?? customers.error} />
      <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
        <Typography sx={{ fontWeight: 600, mr: 1 }}>{tn(subscribed, '{n} person subscribed', '{n} people subscribed')}</Typography>
        {byTopic.map(({ i, n }) => <Tag key={i.key}>{i.label} · {n}</Tag>)}
      </Stack>
      {!list.length ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('No sign-ups yet. Put the form on your website below, or bring in your list.')}</Typography>
      ) : <>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label={t('Latest sign-ups')}>
            <TableHead><TableRow>
              <TableCell>{t('When')}</TableCell><TableCell>{t('Email')}</TableCell><TableCell>{t('Topics')}</TableCell><TableCell>{t('Where from')}</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {shown.map(e => (
                <TableRow key={e.id}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatLocal(e.at, 'd MMM yyyy, HH:mm')}</TableCell>
                  <TableCell sx={{ overflowWrap: 'anywhere' }}>{e.email}</TableCell>
                  <TableCell>{e.action === 'unsubscribe'
                    ? <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Unsubscribed')}</Tag>
                    : e.interests.map(label).join(', ') || '–'}</TableCell>
                  <TableCell>{t(VIA[e.via])}{e.place ? ` · ${e.place}` : ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </>}
      <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', mt: 1 }}>
        {list.length > shown.length && <Button size="small" onClick={() => setAll(true)}>{tn(list.length, 'Show all {n}', 'Show all {n}')}</Button>}
        <Button size="small" component={RouterLink} to="/customers">{t('Customers')}</Button>
        <Button size="small" component={RouterLink} to="/campaigns">{t('Campaigns')}</Button>
      </Stack>
    </Box>
  )
}

/** The topics people can pick, and what else the form asks. Saved together; the preview shows it as it'll look. */
function FormSetup({ settings }: { settings: NewsletterSettings }) {
  const { api } = useApp()
  const run = useAction()
  const [draft, setDraft] = useState<Draft>({ interests: settings.interests, ask_name: settings.ask_name, ask_phone: settings.ask_phone, heading: settings.heading, intro: settings.intro })
  const set = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }))
  const setTopic = (n: number, p: Partial<NewsletterInterest>) => set({ interests: draft.interests.map((x, i) => (i === n ? { ...x, ...p } : x)) })
  const setWords = (n: number, lang: FormLanguage, text: string) => setTopic(n, { labels: { ...draft.interests[n].labels, [lang]: text } })
  const problem = interestsProblem(draft.interests)
  const changed = JSON.stringify(draft) !== JSON.stringify({ interests: settings.interests, ask_name: settings.ask_name, ask_phone: settings.ask_phone, heading: settings.heading, intro: settings.intro })
  const add = () => set({ interests: [...draft.interests, { key: interestKey(t('New topic'), draft.interests.map(i => i.key)), label: '', labels: {} }] })
  const save = () => run(() => api.saveNewsletter({
    ...draft, heading: draft.heading?.trim() || null, intro: draft.intro?.trim() || null,
    interests: draft.interests.map(i => ({ ...i, label: i.label.trim(), labels: Object.fromEntries(Object.entries(i.labels).filter(([, v]) => v?.trim()).map(([k, v]) => [k, v!.trim()])) })),
  }), t('Newsletter form saved'))
  return (
    <Box component="section" aria-label={t('What the form asks')} sx={{ mt: 3 }}>
      <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{t('What the form asks')}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
        {t('Everyone gives an email. The topics are your own: each becomes a tag on Customers, and the form shows it in Spanish or English, whichever the visitor reads.')}
      </Typography>
      <Stack spacing={1.25}>
        {draft.interests.map((i, n) => (
          <Stack key={n} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' } }} aria-label={t('Topic {n}', { n: n + 1 })} role="group">
            <TextField size="small" label={t('Topic (the tag)')} value={i.label} required sx={{ flex: 1.2 }} slotProps={{ htmlInput: { maxLength: 40 } }}
              onChange={e => setTopic(n, settings.interests.some(x => x.key === i.key) ? { label: e.target.value }
                : { label: e.target.value, key: interestKey(e.target.value, draft.interests.filter((_, k) => k !== n).map(x => x.key)) })}
              helperText={t('Websites send it as “{key}”', { key: i.key })} />
            <TextField size="small" label={t('In Spanish')} value={i.labels.es ?? ''} placeholder={i.label} sx={{ flex: 1 }} slotProps={{ htmlInput: { maxLength: 60 } }}
              onChange={e => setWords(n, 'es', e.target.value)} />
            <TextField size="small" label={t('In English')} value={i.labels.en ?? ''} placeholder={i.label} sx={{ flex: 1 }} slotProps={{ htmlInput: { maxLength: 60 } }}
              onChange={e => setWords(n, 'en', e.target.value)} />
            <IconButton aria-label={t('Remove {name}', { name: i.label || t('this topic') })} onClick={() => set({ interests: draft.interests.filter((_, k) => k !== n) })}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>
      <Button startIcon={<AddIcon />} onClick={add} disabled={draft.interests.length >= MAX_INTERESTS} sx={{ mt: 1 }}>{t('Add a topic')}</Button>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
        <TextField size="small" label={t('Heading (optional)')} value={draft.heading ?? ''} placeholder={FORM_TEXT.es.heading} sx={{ flex: 1 }}
          slotProps={{ htmlInput: { maxLength: 80 } }} onChange={e => set({ heading: e.target.value })} />
        <TextField size="small" label={t('A line under it (optional)')} value={draft.intro ?? ''} sx={{ flex: 2 }}
          slotProps={{ htmlInput: { maxLength: 300 } }} onChange={e => set({ intro: e.target.value })} />
      </Stack>
      <Stack direction="row" useFlexGap sx={{ gap: 2, flexWrap: 'wrap', mt: 1 }}>
        <FormControlLabel control={<Switch checked={draft.ask_name} onChange={e => set({ ask_name: e.target.checked })} />} label={t('Ask for their name')} />
        <FormControlLabel control={<Switch checked={draft.ask_phone} onChange={e => set({ ask_phone: e.target.checked })} />} label={t('Ask for a phone number (optional for them)')} />
      </Stack>
      {problem && <Alert severity="warning" sx={{ mt: 1 }}>{t(problem)}</Alert>}
      <Stack direction="row" sx={{ gap: 1, mt: 1 }}>
        <Button variant="contained" disabled={!changed || !!problem} onClick={() => void save()}>{t('Save the form')}</Button>
        {changed && <Button onClick={() => setDraft({ interests: settings.interests, ask_name: settings.ask_name, ask_phone: settings.ask_phone, heading: settings.heading, intro: settings.intro })}>
          {t('Undo changes')}</Button>}
      </Stack>
      <Preview draft={draft} />
    </Box>
  )
}

/** The form as visitors see it, with what's typed so far (not saved yet): it can't send anything from here. */
function Preview({ draft }: { draft: Draft }) {
  const { api, business } = useApp()
  const brand = useAsync('brand', () => api.brand(), [])
  const [lang, setLang] = useState<FormLanguage>('es')
  const colour = brand.data?.colours.find(c => c.role === 'primary')?.hex ?? null
  const topics = draft.interests.filter(i => i.label.trim())
  const html = formPage({ business: businessNumber(business), name: business?.name ?? '', colour: colour && /^#[0-9a-f]{6}$/i.test(colour) ? colour : null,
    settings: { ...draft, interests: topics }, lang, place: null, preview: true })
  // Tall enough for what it asks (the page can't say how tall it is from here).
  const height = 330 + 82 * (Number(draft.ask_name) + Number(draft.ask_phone)) + (topics.length ? 40 + 46 * Math.ceil(topics.length / 3) : 0)
  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('Preview')}</Typography>
        <ToggleButtonGroup size="small" exclusive value={lang} onChange={(_, l: FormLanguage | null) => l && setLang(l)} aria-label={t('Preview in')}>
          {LANGUAGES.map(l => <ToggleButton key={l.code} value={l.code}>{l.name}</ToggleButton>)}
        </ToggleButtonGroup>
      </Stack>
      <Box component="iframe" title={t('Preview of the newsletter form')} srcDoc={html} sandbox=""
        sx={{ display: 'block', width: '100%', maxWidth: 480, height, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: '#fff' }} />
    </Box>
  )
}

/** Three ways onto the website: a link, a snippet to paste, or the website's own form sending here (with a key from its server). */
function OnYourWebsite({ settings }: { settings: NewsletterSettings }) {
  const { api, business } = useApp()
  const run = useAction()
  const notify = useNotify()
  const [made, setMade] = useState<string | null>(null)
  const origin = window.location.origin
  const link = formUrl(origin, businessNumber(business))
  const snippet = embedSnippet(origin, businessNumber(business))
  const endpoint = signupUrl(origin, businessNumber(business))
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => notify(t('Copied'), 'success'), () => notify(t('Select it and copy it'), 'info'))
  const makeKey = () => run(async () => { setMade((await api.makeNewsletterKey()).key) }, t('Key made'))
  return (
    <Box component="section" aria-label={t('Put the form on your website')} sx={{ mt: 3 }}>
      <Typography sx={{ fontWeight: 600, mb: 1 }}>{t('Put the form on your website')}</Typography>

      <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('A link')}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.75 }}>{t('For your Instagram bio, a QR code on the counter or an email: the form on a page of its own.')}</Typography>
      <Box aria-label={t('Link to the newsletter form')} sx={code}>{link}</Box>
      <Stack direction="row" sx={{ gap: 1, mt: 0.75, mb: 2, flexWrap: 'wrap' }}>
        <Button size="small" startIcon={<CopyIcon fontSize="small" />} onClick={() => void copy(link)}>{t('Copy link')}</Button>
        <Button size="small" startIcon={<OpenIcon fontSize="small" />} href={link} target="_blank" rel="noopener noreferrer">{t('Open the form')}</Button>
      </Stack>

      <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('On your website’s pages')}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.75 }}>
        {t('Paste this where the form should go (Wix, Squarespace and WordPress all take a piece of HTML: an “Embed” or “Custom HTML” block). It speaks Spanish or English, whichever the visitor reads.')}
      </Typography>
      <Box component="pre" aria-label={t('Code to paste into your website')} sx={code}>{snippet}</Box>
      <Button size="small" startIcon={<CopyIcon fontSize="small" />} onClick={() => void copy(snippet)} sx={{ mt: 0.75, mb: 2 }}>{t('Copy the code')}</Button>

      <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('Your website’s own form')}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.75 }}>
        {t('A website with a form of its own sends each sign-up here: the email, the topics ticked (each topic’s key, or its words), and a phone, name and language when it has them. From its server, with the website key, it can also send people who signed up before and tell us when someone unsubscribes, so they get no more marketing.')}
      </Typography>
      <Box aria-label={t('Address for sign-ups')} sx={code}>{`POST ${endpoint}\n{ "email": "lucia@example.com", "interests": [${settings.interests.slice(0, 2).map(i => `"${i.key}"`).join(', ')}], "lang": "es" }`}</Box>
      <Stack direction="row" useFlexGap sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 1 }}>
        <KeyIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        {settings.key_hint ? <>
          <Typography variant="body2">{t('Website key ending {hint}, made {when}', { hint: settings.key_hint, when: formatLocal(settings.key_made_at!, 'd MMM yyyy') })}</Typography>
          <Button size="small" onClick={() => void makeKey()}>{t('Replace the key')}</Button>
          <Button size="small" color="error" onClick={() => { setMade(null); void run(() => api.dropNewsletterKey(), t('Key removed')) }}>{t('Remove the key')}</Button>
        </> : <>
          <Typography variant="body2">{t('No website key yet.')}</Typography>
          <Button size="small" variant="outlined" onClick={() => void makeKey()}>{t('Make a website key')}</Button>
        </>}
      </Stack>
      {made && (
        <Alert severity="success" sx={{ mt: 1 }} onClose={() => setMade(null)}
          action={<Button color="inherit" size="small" startIcon={<CopyIcon fontSize="small" />} onClick={() => void copy(made)}>{t('Copy')}</Button>}>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            {t('Copy it now and give it to whoever runs the website: it won’t be shown again. It goes on the website’s server only (Authorization: Bearer …), never in its pages.')}
          </Typography>
          <Box aria-label={t('The new website key')} sx={{ ...code, bgcolor: 'transparent' }}>{made}</Box>
        </Alert>
      )}
    </Box>
  )
}

/** A list from before (another newsletter service, or the website's own): the people still subscribed come in, with their topics. */
function BringInList() {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const input = useRef<HTMLInputElement>(null)
  const [list, setList] = useState<{ name: string; rows: ListRow[]; notSubscribed: number; skipped: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (f: File | undefined) => {
    if (!f) return
    const read = readList(decodeCsv(new Uint8Array(await f.arrayBuffer())))
    if (!read.found.includes('email')) { notify(t('That file has no email column.'), 'error'); return }
    setList({ name: f.name, ...read })
  }
  const bringIn = async () => {
    if (!list) return
    setBusy(true)
    await run(async () => {
      const r = await api.importNewsletterList(list.rows)
      notify(r.unknown.length
        ? t('{added} brought in. These topics aren’t on your form, so they were left out: {topics}', { added: r.added, topics: r.unknown.join(', ') })
        : tn(r.added, '{n} person brought in', '{n} people brought in'), r.unknown.length ? 'info' : 'success')
      setList(null)
    })
    setBusy(false)
  }
  return (
    <Box component="section" aria-label={t('Bring in your list')} sx={{ mt: 3 }}>
      <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{t('Bring in your list')}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
        {t('Signed people up before, on your website or another newsletter service (Mailchimp, Brevo…)? Bring in its export (CSV). Only people still subscribed come in, each with their topics and the day they signed up; someone already on Customers keeps everything they have.')}
      </Typography>
      <input ref={input} type="file" hidden accept=".csv,text/csv" aria-label={t('CSV file')} onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} />
      {!list ? <Button startIcon={<UploadIcon />} onClick={() => input.current?.click()}>{t('Choose a CSV file')}</Button> : (
        <Alert severity="info" action={<Stack direction="row" sx={{ gap: 1 }}>
          <Button color="inherit" size="small" onClick={() => setList(null)} disabled={busy}>{t('Cancel')}</Button>
          <Button color="inherit" size="small" variant="outlined" onClick={() => void bringIn()} disabled={busy || !list.rows.length}>{t('Bring them in')}</Button>
        </Stack>}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{list.name}</Typography>
          <Typography variant="body2">{tn(list.rows.length, '{n} person to bring in', '{n} people to bring in')}</Typography>
          {list.notSubscribed > 0 && <Typography variant="body2">{tn(list.notSubscribed, '{n} unsubscribed: left out', '{n} unsubscribed: left out')}</Typography>}
          {list.skipped > 0 && <Typography variant="body2">{tn(list.skipped, '{n} without an email (or twice): left out', '{n} without an email (or twice): left out')}</Typography>}
          {list.rows.some(r => r.interests?.length) && <Stack direction="row" useFlexGap sx={{ gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            {[...new Set(list.rows.flatMap(r => r.interests ?? []))].slice(0, 12).map(i => <Chip key={i} size="small" label={i} />)}
          </Stack>}
        </Alert>
      )}
    </Box>
  )
}
