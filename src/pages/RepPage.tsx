import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import StarIcon from '@mui/icons-material/AutoAwesomeOutlined'
import GroupsIcon from '@mui/icons-material/GroupsOutlined'
import HeartIcon from '@mui/icons-material/VolunteerActivismOutlined'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt'
import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useQuery } from '@tanstack/react-query'
import { useAction } from '../app/Notify'
import { Loading, Tag } from '../components/common'
import { ReachBadge, ReachLadder, RepAvatar, RepCode, worth } from '../components/RepBits'
import {
  DEFAULT_PITCH, SOCIALS, earnsCredit, formatReach, parseCount, reachMultiplier, rewardAmount, type RepPageData, type RepPageRule,
} from '../../shared/reps'
import { formatLocal, formatMoney, formatNumber, today } from '../../shared/time'
import { fonts, tokens } from '../theme'
import { msg, t } from '../i18n'

const STATUS: Record<'approved' | 'pending' | 'rejected', { label: string; fg: string; bg: string }> = {
  approved: { label: msg('Counted'), fg: tokens.goodFg, bg: tokens.goodBg },
  pending: { label: msg('Being checked'), fg: tokens.warnFg, bg: tokens.warnBg },
  rejected: { label: msg('Not this time'), fg: tokens.neutralFg, bg: tokens.neutralBg },
}
const day = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM')

/**
 * A rep's own page (/rep/<link>), opened from the link the café sent them, with no sign-in: what
 * they've earned and can spend or are owed, their place this month, their code, their reach and
 * what it makes their rewards worth, their crew, and the café's list. They tell the café what they
 * shared, and add people to their crew; an admin says yes to both.
 */
export function RepPage() {
  const { api } = useApp()
  const { pathname } = useLocation()
  const token = pathname.split('/')[2] ?? ''
  // A link that has changed says so at once; anything else is tried again, as every read is.
  const query = useQuery({ queryKey: ['rep-page', token], queryFn: () => api.repPage(token),
    retry: (n, e) => n < 3 && !/link has changed/i.test(String(e)) })
  const page = { data: query.data ?? null, error: query.error ? (query.error instanceof Error ? query.error.message : String(query.error)) : null }
  const [claiming, setClaiming] = useState<RepPageRule | null | undefined>(undefined)
  const [adding, setAdding] = useState(false)
  const p = page.data

  useEffect(() => { if (p) document.title = `${p.rep.name} · ${p.business.name ?? t('Your page')}` }, [p])

  if (!p) {
    return (
      <Shell>
        {page.error
          ? <Alert severity="info" sx={{ mt: 6 }}>{page.error}</Alert>
          : <Loading />}
      </Shell>
    )
  }
  const { rep, settings } = p
  const credit = earnsCredit(rep.kind)
  const first = rep.name.replace(/[“”"«»]/g, '').split(/\s+/)[0]
  const boostX = settings.boost_by_reach ? reachMultiplier(rep.reach) : 1
  const claimable = p.rules.filter(r => r.basis === 'fixed')
  const socials = SOCIALS.filter(s => rep[s.id] || rep[s.followers])
  const crewReach = rep.reach + p.crew.reduce((a, m) => a + m.reach, 0)

  return (
    <Shell business={p.business}>
      {/* Who they are, and the café's thanks. */}
      <Box component="section" aria-label={t('Your page')} sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 4, mb: 2.5,
        background: `linear-gradient(135deg, ${tokens.roseSoft} 0%, ${tokens.ubeSoft} 60%, ${tokens.matchaSoft} 100%)` }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1.5 }}>
          <RepAvatar rep={rep} size={56} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: '1.6rem', lineHeight: 1.15 }}>{t('Hi, {name}', { name: first })}</Typography>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>
              {rep.reach > 0 && <ReachBadge reach={rep.reach} />}
              {rep.leader && <Tag fg={tokens.ubeDeep} bg={tokens.surface}>{t('In {name}’s crew', { name: rep.leader })}</Tag>}
            </Stack>
          </Box>
        </Stack>
        <Typography sx={{ color: 'text.secondary' }}>{settings.pitch?.trim() || t(DEFAULT_PITCH)}</Typography>
      </Box>

      {!rep.approved && (
        <Alert severity="info" sx={{ mb: 2.5 }}>{t('The café says yes to new people soon. What you earn counts from then.')}</Alert>
      )}

      <Box component="dl" sx={{ m: 0, mb: 2.5, display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {[
          { label: t('Earned this month'), value: formatMoney(p.month.earned) },
          { label: credit ? t('Credit to spend here') : t('Owed to you'), value: formatMoney(p.balance) },
          { label: t('Your place this month'), value: p.month.rank ? t('{rank} of {n}', { rank: p.month.rank, n: p.month.people }) : '–' },
        ].map(s => (
          <Box key={s.label} sx={{ p: 1.5, borderRadius: 3, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Typography component="dd" sx={{ m: 0, fontFamily: fonts.display, fontWeight: 600, fontSize: { xs: '1.2rem', sm: '1.5rem' }, fontVariantNumeric: 'tabular-nums' }}>{s.value}</Typography>
            <Typography component="dt" variant="caption" sx={{ color: 'text.secondary' }}>{s.label}</Typography>
          </Box>
        ))}
      </Box>
      {p.waiting > 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1.5, mb: 2.5 }}>{t('{amount} more is being checked by the café.', { amount: formatMoney(p.waiting) })}</Typography>
      )}

      <Card component="section" aria-label={t('Your code')} sx={{ mb: 2.5 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('Your code')}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {settings.welcome_offer
                  ? t('Someone new who shows it at the till gets {offer}, and you earn a reward.', { offer: settings.welcome_offer })
                  : t('Someone new who shows it at the till brings you a reward.')}
              </Typography>
            </Box>
            <RepCode code={rep.code} big />
          </Stack>
        </CardContent>
      </Card>

      <Card component="section" aria-label={t('Your reach')} sx={{ mb: 2.5 }}>
        <CardContent>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('You reach {n} people', { n: formatNumber(rep.reach) })}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
            {[...socials.map(s => `${s.label}${rep[s.id] ? ` @${rep[s.id]}` : ''}${rep[s.followers] ? `: ${formatReach(rep[s.followers])}` : ''}`),
              rep.community ? t('{n} in person', { n: formatReach(rep.community) }) : null].filter(Boolean).join(' · ') || t('The café adds your accounts and followers.')}
          </Typography>
          {settings.boost_by_reach && <>
            <Typography variant="body2" sx={{ mb: 1.25 }}>
              {boostX > 1
                ? t('Rewards that grow with reach are worth ×{x} for you.', { x: boostX })
                : t('The more people you reach, the more rewards that grow with reach are worth.')}
            </Typography>
            <ReachLadder reach={rep.reach} />
          </>}
        </CardContent>
      </Card>

      <Card component="section" aria-label={t('What earns you a reward')} sx={{ mb: 2.5 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('What earns you a reward')}</Typography>
            {claimable.length > 0 && <Button size="small" variant="contained" startIcon={<StarIcon />} onClick={() => setClaiming(null)} sx={{ whiteSpace: 'nowrap' }}>{t('I shared something')}</Button>}
          </Stack>
          {p.rules.length === 0
            ? <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('The café is still writing its list.')}</Typography>
            : <Stack spacing={1}>
                {p.rules.map(r => {
                  const amount = r.basis === 'fixed' ? rewardAmount(r, null, rep.reach, settings.boost_by_reach) : null
                  const full = r.monthly_limit !== null && r.used_this_month >= r.monthly_limit
                  return (
                    <Stack key={r.id} component="article" aria-label={r.name} direction="row" spacing={1.5}
                      sx={{ alignItems: 'center', p: 1.25, borderRadius: 2.5, bgcolor: tokens.surfaceAlt }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{r.name}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {[r.scales_with_reach && settings.boost_by_reach && boostX > 1 ? t('×{x} for your reach', { x: boostX }) : null,
                            r.monthly_limit !== null ? t('{used} of {limit} this month', { used: r.used_this_month, limit: r.monthly_limit }) : null,
                            r.basis === 'percent' ? t('The café logs it once it’s booked') : null].filter(Boolean).join(' · ')}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontFamily: fonts.display, fontWeight: 600, color: tokens.roseDeep, whiteSpace: 'nowrap' }}>
                        {amount !== null ? formatMoney(amount) : worth(r)}
                      </Typography>
                      {r.basis === 'fixed' && (
                        <Button size="small" disabled={full} onClick={() => setClaiming(r)} aria-label={t('I did this: {name}', { name: r.name })}>{t('I did this')}</Button>
                      )}
                    </Stack>
                  )
                })}
              </Stack>}
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1.5 }}>
            {credit ? t('You get it as credit to spend in the café.') : t('You get it as commission, paid by the café.')}
          </Typography>
        </CardContent>
      </Card>

      {!rep.leader && (
        <Card component="section" aria-label={t('Your crew')} sx={{ mb: 2.5 }}>
          <CardContent>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <GroupsIcon sx={{ color: tokens.ubeDeep }} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('Your crew')}</Typography>
              </Stack>
              <Button size="small" startIcon={<PersonAddIcon />} onClick={() => setAdding(true)}>{t('Add to your crew')}</Button>
            </Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: p.crew.length ? 1.5 : 0 }}>
              {p.crew.length
                ? settings.crew_share > 0
                  ? t('{n} people reach {reach} together. You earn {share}% of everything your crew earns, on top of your own.', { n: p.crew.length + 1, reach: formatReach(crewReach), share: formatNumber(settings.crew_share) })
                  : t('{n} people reach {reach} together.', { n: p.crew.length + 1, reach: formatReach(crewReach) })
                : settings.crew_share > 0
                  ? t('Coach a team, run a studio or a club? Add your people: each earns their own rewards, and you earn {share}% of what they earn on top.', { share: formatNumber(settings.crew_share) })
                  : t('Coach a team, run a studio or a club? Add your people: each earns their own rewards.')}
            </Typography>
            {p.crew.length > 0 && (
              <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {p.crew.map(m => (
                  <Stack key={m.name} component="li" direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 0.75, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{m.name}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {[m.instagram ? `@${m.instagram}` : null, m.reach ? t('Reaches {n}', { n: formatReach(m.reach) }) : null,
                          m.approved ? t('Earned {amount} this month', { amount: formatMoney(m.earned_this_month) }) : t('Waiting for the café’s OK')].filter(Boolean).join(' · ')}
                      </Typography>
                    </Box>
                    {m.bonus_this_month > 0 && (
                      <Typography variant="caption" sx={{ color: tokens.goodFg, fontWeight: 600, whiteSpace: 'nowrap' }}>{t('+{amount} for you', { amount: formatMoney(m.bonus_this_month) })}</Typography>
                    )}
                  </Stack>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      <Card component="section" aria-label={t('Your latest')} sx={{ mb: 2.5 }}>
        <CardContent>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>{t('Your latest')}</Typography>
          {p.rewards.length === 0
            ? <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Nothing yet. Share a story about the café or hand out your code to start.')}</Typography>
            : <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {p.rewards.map(r => (
                  <Stack key={r.id} component="li" direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 0.75, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', width: 48, flexShrink: 0 }}>{day(r.occurred_on)}</Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2">
                        {r.bonus ? t('Crew bonus: {name}', { name: r.label.slice(r.label.indexOf(' · ') + 3) }) : r.kind === 'earn' ? r.label : t(r.label)}
                      </Typography>
                      {r.multiplier && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('×{x} for your reach', { x: r.multiplier })}</Typography>}
                    </Box>
                    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: r.amount < 0 ? 'text.secondary' : undefined }}>
                      {r.amount > 0 ? `+${formatMoney(r.amount)}` : formatMoney(r.amount)}
                    </Typography>
                    {r.status !== 'approved' && <Tag fg={STATUS[r.status].fg} bg={STATUS[r.status].bg}>{t(STATUS[r.status].label)}</Tag>}
                  </Stack>
                ))}
              </Stack>}
        </CardContent>
      </Card>

      <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', alignItems: 'center', color: 'text.secondary', py: 2 }}>
        <HeartIcon fontSize="small" sx={{ color: tokens.roseDeep }} />
        <Typography variant="caption">{t('Thank you for supporting a local business.')}</Typography>
      </Stack>

      {claiming !== undefined && <ClaimDialog token={token} rules={claimable} first={claiming} data={p} onClose={() => setClaiming(undefined)} />}
      {adding && <CrewDialog token={token} share={settings.crew_share} onClose={() => setAdding(false)} />}
    </Shell>
  )
}

/** The page around it: the café's name and logo at the top, narrow enough for a phone. */
function Shell({ business, children }: { business?: RepPageData['business']; children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box component="main" sx={{ maxWidth: 720, mx: 'auto', px: 2, pt: 2.5, pb: 4 }}>
        {business && (
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 2 }}>
            {business.logo && <Box component="img" src={business.logo} alt="" sx={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 1 }} />}
            <Typography sx={{ fontFamily: fonts.display, fontWeight: 600 }}>{business.name}</Typography>
          </Stack>
        )}
        {children}
      </Box>
    </Box>
  )
}

/** Tell the café what they shared: which reward, a few words or the link, and the day. It waits for an admin. */
function ClaimDialog({ token, rules, first, data, onClose }: { token: string; rules: RepPageRule[]; first: RepPageRule | null; data: RepPageData; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [ruleId, setRuleId] = useState(first?.id ?? rules[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [link, setLink] = useState('')
  const [on, setOn] = useState(today())
  const rule = rules.find(r => r.id === ruleId)
  const send = async () => {
    const ok = await run(async () => {
      if (!rule) throw new Error(t('Choose what you shared'))
      if (!note.trim() && !link.trim()) throw new Error(t('Say what you shared, or add its link'))
      if (link.trim() && !/^https?:\/\/\S+$/i.test(link.trim())) throw new Error(t('The link has to start with https://'))
      await api.claimReward(token, { rule_id: rule.id, note: note.trim() || null, proof_url: link.trim() || null, occurred_on: on })
    }, t('Sent: the café checks it and it shows here'))
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="claim-title">
      <DialogTitle id="claim-title">{t('What did you share?')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label={t('What for')} value={ruleId} onChange={e => setRuleId(e.target.value)}>
            {rules.map(r => (
              <MenuItem key={r.id} value={r.id} disabled={r.monthly_limit !== null && r.used_this_month >= r.monthly_limit}>
                {r.name} · {formatMoney(rewardAmount(r, null, data.rep.reach, data.settings.boost_by_reach))}
              </MenuItem>
            ))}
          </TextField>
          <TextField label={t('Link')} value={link} onChange={e => setLink(e.target.value)} placeholder={'https://'} helperText={t('Your story, post or reel, if you have its link')} />
          <TextField label={t('A few words')} value={note} onChange={e => setNote(e.target.value)} placeholder={t('A story after training, tagging the café')} multiline minRows={2} />
          <TextField label={t('Day')} type="date" value={on} onChange={e => e.target.value && setOn(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today() } }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('The café checks it, then it counts.')}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void send()}>{t('Send')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Add someone to their crew: a name and their accounts. The café says yes first. */
function CrewDialog({ token, share, onClose }: { token: string; share: number; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [name, setName] = useState('')
  const [instagram, setInstagram] = useState('')
  const [igFollowers, setIgFollowers] = useState('')
  const [tiktok, setTiktok] = useState('')
  const [tkFollowers, setTkFollowers] = useState('')
  const [note, setNote] = useState('')
  const send = async () => {
    const ig = parseCount(igFollowers)
    const tk = parseCount(tkFollowers)
    const ok = await run(async () => {
      if (!name.trim()) throw new Error(t('Give their name'))
      if (Number.isNaN(ig) || Number.isNaN(tk)) throw new Error(t('Followers are a number, like 1200 or 12.4k'))
      await api.suggestCrew(token, { name: name.trim(), instagram: instagram.trim().replace(/^@/, '') || null, instagram_followers: ig, tiktok: tiktok.trim().replace(/^@/, '') || null,
        tiktok_followers: tk, note: note.trim() || null })
    }, t('{name} is waiting for the café’s OK', { name: name.trim() }))
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="crew-title">
      <DialogTitle id="crew-title">{t('Add to your crew')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {share > 0 ? t('Each earns their own rewards, and you earn {share}% of what they earn. The café says yes first.', { share: formatNumber(share) })
              : t('Each earns their own rewards. The café says yes first.')}
          </Typography>
          <TextField label={t('Name')} value={name} onChange={e => setName(e.target.value)} required autoFocus />
          <Stack direction="row" spacing={1}>
            <TextField label={'Instagram'} value={instagram} onChange={e => setInstagram(e.target.value)} sx={{ flex: 1 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment> } }} />
            <TextField label={t('Followers')} value={igFollowers} onChange={e => setIgFollowers(e.target.value)} inputMode="numeric" sx={{ width: 120 }} />
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField label={'TikTok'} value={tiktok} onChange={e => setTiktok(e.target.value)} sx={{ flex: 1 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment> } }} />
            <TextField label={t('Followers')} value={tkFollowers} onChange={e => setTkFollowers(e.target.value)} inputMode="numeric" sx={{ width: 120 }} />
          </Stack>
          <TextField label={t('Notes')} value={note} onChange={e => setNote(e.target.value)} placeholder={t('Who they are: “Amateur champion, trains with us”')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void send()}>{t('Send')}</Button>
      </DialogActions>
    </Dialog>
  )
}
