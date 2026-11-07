// Across the top of the app for admins while the account is closing (an owner asked on Billing; the
// close_account migration): when it closes, and for owners a button to keep it.
import { Alert, Button } from '@mui/material'
import { useState } from 'react'
import { useApp } from './AppContext'
import { canStillKeep, closesAt, daysUntilClosing } from '../../shared/accountClosing'
import { formatLocal } from '../../shared/time'
import { useAction, useNotify } from './Notify'
import { t, tn } from '../i18n'

/** Keep the account (an owner, within the 30 days); says so if Stripe didn't start the plan renewing again. */
export function useKeepAccount() {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  return async () => {
    let failed = false
    const ok = await run(async () => { failed = (await api.keepAccount()).renewalFailed })
    if (ok) notify(failed ? t('The account stays open. Your plan isn’t renewing yet: renew it from Card, invoices and cancelling.') : t('The account stays open'), failed ? 'warning' : 'success')
  }
}

export function ClosingBanner() {
  const { business, isAdmin, canSeePay } = useApp()
  const keep = useKeepAccount()
  const [busy, setBusy] = useState(false)
  const asked = business?.closing_requested_at
  if (!isAdmin || !asked) return null
  const date = formatLocal(closesAt(asked), 'd MMMM yyyy')
  if (!canStillKeep(asked)) {
    return <Alert severity="error" sx={{ borderRadius: 0 }}>{t('This account closed on {date}. Its data is being deleted.', { date })}</Alert>
  }
  return (
    <Alert severity="warning" sx={{ borderRadius: 0 }} action={canSeePay
      ? <Button color="inherit" size="small" disabled={busy} onClick={async () => { setBusy(true); await keep(); setBusy(false) }}>{t('Keep the account')}</Button>
      : undefined}>
      {tn(daysUntilClosing(asked), 'This account closes on {date}, in {n} day. Nothing is deleted before then.', 'This account closes on {date}, in {n} days. Nothing is deleted before then.', { date })}
      {!canSeePay && ` ${t('An owner can keep it on the Billing page.')}`}
    </Alert>
  )
}
