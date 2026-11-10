// Sales reps & rewards → Cashback for posts: what a rep's post about the café earns from what it did
// (views, new followers in its days, likes), the café's rates, and (admins) changing them, with an
// example worked out as they type. The database pays it nightly (shared/cashback.ts).
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, InputAdornment, Stack, Switch, TextField, Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/EditRounded'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { Tag } from '../components/common'
import { t } from '../i18n'
import { formatMoney, formatNumber } from '../../shared/time'
import { cashbackFor, type CashbackRates } from '../../shared/cashback'
import { tokens } from '../theme'

/** A reel like the ones customers post: the example under the rates. */
const EXAMPLE = { views: 8_400, likes: 620, gained: 35, days: 3 }

/** The rates in a sentence. */
export function cashbackWords(r: CashbackRates) {
  return t('{views} per 1,000 views, {followers} per new follower and {likes} per 100 likes, up to {max} a post.', {
    views: formatMoney(r.cashback_per_1000_views), followers: formatMoney(r.cashback_per_follower), likes: formatMoney(r.cashback_per_100_likes),
    max: formatMoney(r.cashback_max),
  })
}

/** The café's cashback, as a block under what earns a reward; admins change it. */
export function CashbackBlock({ rates, isAdmin }: { rates: CashbackRates; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false)
  const example = cashbackFor(EXAMPLE, rates).amount
  return (
    <Box component="section" aria-label={t('Cashback for posts about the café')}
      sx={{ mt: 2.5, p: 2, borderRadius: 3, border: 1, borderColor: 'divider', bgcolor: rates.cashback_on ? tokens.roseWash : undefined }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('Cashback for posts about the café')}</Typography>
        {rates.cashback_on ? <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('On')}</Tag> : <Tag>{t('Off')}</Tag>}
        <Box sx={{ flex: 1 }} />
        {isAdmin && <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing(true)}>{t('Change')}</Button>}
      </Stack>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {rates.cashback_on
          ? <>
              {t('Every rep earns from their posts about the café on Instagram (collab reels, tags, story mentions):')} {cashbackWords(rates)}{' '}
              {rates.cashback_needs_approval
                ? t('Worked out three days after the post, when its new followers are in, and it waits for your OK.')
                : t('Worked out three days after the post, when its new followers are in, and it counts straight away.')}{' '}
              {t('Customers get it as credit to spend here; the team and ambassadors as commission.')}
            </>
          : t('Switched off: posts about the café earn nothing by themselves.')}
      </Typography>
      {rates.cashback_on && (
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.75 }}>
          {t('For example, a reel with {views} views, {followers} new followers and {likes} likes earns {amount}.', {
            views: formatNumber(EXAMPLE.views), followers: formatNumber(EXAMPLE.gained), likes: formatNumber(EXAMPLE.likes), amount: formatMoney(example) })}
        </Typography>
      )}
      {editing && <CashbackDialog rates={rates} onClose={() => setEditing(false)} />}
    </Box>
  )
}

const asText = (n: number) => n.toFixed(2).replace('.', ',')
const parse = (v: string) => Number(v.trim().replace(',', '.'))

function CashbackDialog({ rates, onClose }: { rates: CashbackRates; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [on, setOn] = useState(rates.cashback_on)
  const [approval, setApproval] = useState(rates.cashback_needs_approval)
  const [text, setText] = useState({
    cashback_per_1000_views: asText(rates.cashback_per_1000_views), cashback_per_follower: asText(rates.cashback_per_follower),
    cashback_per_100_likes: asText(rates.cashback_per_100_likes), cashback_max: asText(rates.cashback_max),
  })
  const values = Object.fromEntries(Object.entries(text).map(([k, v]) => [k, parse(v)])) as Record<keyof typeof text, number>
  const bad = Object.entries(values).find(([k, v]) => !Number.isFinite(v) || v < 0 || v > (k === 'cashback_max' ? 1000 : 100) || (k === 'cashback_max' && v <= 0))
  const next: CashbackRates = { cashback_on: on, cashback_needs_approval: approval, ...values }
  const example = bad ? null : cashbackFor(EXAMPLE, next).amount
  const save = async () => {
    if (await run(async () => {
      if (bad) throw new Error(t('Each amount is a number of euros, like 0,50'))
      await api.updateRepSettings(next)
    }, t('Saved'))) onClose()
  }
  const field = (key: keyof typeof text, label: string, helper?: string) => (
    <TextField label={label} value={text[key]} onChange={e => setText(x => ({ ...x, [key]: e.target.value }))} inputMode="decimal" disabled={!on} helperText={helper}
      slotProps={{ input: { startAdornment: <InputAdornment position="start">€</InputAdornment> } }} />
  )
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="cashback-title">
      <DialogTitle id="cashback-title">{t('Cashback for posts')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <FormControlLabel control={<Switch checked={on} onChange={e => setOn(e.target.checked)} />} label={t('Posts about the café earn cashback')} />
          {field('cashback_per_1000_views', t('Per 1,000 views'))}
          {field('cashback_per_follower', t('Per new follower'), t('Every follower you gained the day the post went out and the two after'))}
          {field('cashback_per_100_likes', t('Per 100 likes'))}
          {field('cashback_max', t('The most a post earns'))}
          <FormControlLabel control={<Switch checked={approval} onChange={e => setApproval(e.target.checked)} disabled={!on} />} label={t('An admin approves each one')} />
          {on && example !== null && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('For example, a reel with {views} views, {followers} new followers and {likes} likes earns {amount}.', {
                views: formatNumber(EXAMPLE.views), followers: formatNumber(EXAMPLE.gained), likes: formatNumber(EXAMPLE.likes), amount: formatMoney(example) })}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
