// Billing, owners only: everything the business keeps, out (a zip of CSV files, worker/account.ts), and
// closing the account. It closes 30 days after an owner asks (shared/accountClosing.ts), the plan stops
// renewing, and until then an owner keeps it with one click, here or on the banner across the app.
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography } from '@mui/material'
import DownloadIcon from '@mui/icons-material/DownloadRounded'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { useKeepAccount } from '../app/ClosingBanner'
import { SectionTitle } from '../components/common'
import { downloadBlob } from '../lib/export'
import { CLOSING_DAYS, canStillKeep, closesAt } from '../../shared/accountClosing'
import type { Billing } from '../../shared/plans'
import { formatLocal } from '../../shared/time'
import { t } from '../i18n'

const long = (iso: string) => formatLocal(iso, 'd MMMM yyyy')

export function AccountDataCard({ billing }: { billing: Billing | null }) {
  const { api, business, profiles } = useApp()
  const run = useAction()
  const keep = useKeepAccount()
  const [busy, setBusy] = useState<'export' | 'close' | 'keep' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const asked = business?.closing_requested_at ?? null
  const askedBy = profiles.find(p => p.id === business?.closing_requested_by)?.full_name
  const renewing = !!billing?.has_customer && ['active', 'trialing'].includes(billing.status) && !billing.cancel_at_period_end

  const download = async () => {
    setBusy('export')
    await run(async () => {
      const { filename, blob } = await api.exportData()
      downloadBlob(filename, blob)
    }, t('Your data is downloading'))
    setBusy(null)
  }
  const closeAccount = async () => {
    setBusy('close')
    if (await run(() => api.closeAccount(), t('The account closes in {n} days', { n: CLOSING_DAYS }))) setConfirming(false)
    setBusy(null)
  }
  const keepAccount = async () => {
    setBusy('keep')
    await keep()
    setBusy(null)
  }

  return (
    <Card variant="outlined" component="section" aria-label={t('Your data and closing the account')}>
      <CardContent>
        <SectionTitle>{t('Your data and closing the account')}</SectionTitle>
        <Stack spacing={2.5} divider={<Divider flexItem />}>
          <Box>
            <Typography variant="subtitle2" component="h3">{t('Download all your data')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
              {t('Everything the business keeps in The Business Agent, as CSV files in one zip: they open in Excel, Numbers or Google Sheets. Passwords, sign-in keys and connected apps’ tokens aren’t included.')}
            </Typography>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => void download()} disabled={busy !== null}>
              {busy === 'export' ? t('Preparing your data…') : t('Download all data')}
            </Button>
          </Box>
          {!business?.is_hq && (
            <Box>
              <Typography variant="subtitle2" component="h3">{t('Close the account')}</Typography>
              {asked ? (
                <Alert severity="warning" sx={{ mt: 1 }} action={canStillKeep(asked)
                  ? <Button color="inherit" size="small" onClick={() => void keepAccount()} disabled={busy !== null}>{t('Keep the account')}</Button> : undefined}>
                  {canStillKeep(asked)
                    ? t('Closing on {date}, as {name} asked on {asked}. Until then everything works as before, and you can keep the account.',
                      { date: long(closesAt(asked)), name: askedBy ?? t('an owner'), asked: long(asked) })
                    : t('The account closed on {date}. Its data is being deleted, except the working-hours records the law requires us to keep.', { date: long(closesAt(asked)) })}
                </Alert>
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
                    {t('The account closes {n} days after you ask, and you can keep it until then. Download your data first.', { n: CLOSING_DAYS })}
                  </Typography>
                  <Button variant="outlined" color="error" onClick={() => setConfirming(true)} disabled={busy !== null}>{t('Close the account…')}</Button>
                </>
              )}
            </Box>
          )}
        </Stack>
      </CardContent>

      <Dialog open={confirming} onClose={() => busy || setConfirming(false)} fullWidth maxWidth="sm" aria-labelledby="close-account-title">
        <DialogTitle id="close-account-title">{t('Close {name}’s account?', { name: business?.name ?? '' })}</DialogTitle>
        <DialogContent>
          <Stack component="ul" spacing={1} sx={{ m: 0, pl: 2.5 }}>
            <Typography component="li" variant="body2">
              {t('It closes on {date}, {n} days from now. Until then everything works as before, and an owner can keep the account from this page.',
                { date: long(closesAt(new Date().toISOString())), n: CLOSING_DAYS })}
            </Typography>
            {renewing && (
              <Typography component="li" variant="body2">
                {t('Your plan stops renewing now: nothing more is charged, and what’s already paid isn’t refunded.')}
              </Typography>
            )}
            <Typography component="li" variant="body2">
              {t('When it closes, everyone on the team loses access and The Business Agent deletes the business’s data, except the working-hours records (registro de jornada) Spanish law requires us to keep for four years.')}
            </Typography>
            <Typography component="li" variant="body2">{t('Download your data before it closes.')}</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)} disabled={busy !== null}>{t('Cancel')}</Button>
          <Button variant="contained" color="error" onClick={() => void closeAccount()} disabled={busy !== null}>{t('Close the account')}</Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}
