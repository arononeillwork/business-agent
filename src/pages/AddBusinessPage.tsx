import { Box, ButtonBase, Stack, Typography } from '@mui/material'
import BackIcon from '@mui/icons-material/ArrowForwardRounded'
import { useState } from 'react'
import { BusinessAvatar, Opening, useBusinesses } from '../components/BusinessSwitcher'
import { AuthCard } from './marketing/AuthCard'
import { AgentMark, BA, Wordmark, display, glow } from './marketing/site'
import { t } from '../i18n'

/**
 * Adding another business on this device: the business(es) already here stay signed in, and this asks
 * for the sign-in of another one, or a new account to set one up. Each business has its own sign-in
 * (docs/SEVERAL_BUSINESSES.md). Shown in Business Agent's own look, like the sign-in page.
 */
export function AddBusinessPage() {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  const b = useBusinesses()
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: BA.bg, color: BA.ink, colorScheme: 'light', backgroundImage: glow(),
      '& .MuiOutlinedInput-root': { bgcolor: '#fff', color: BA.ink, borderRadius: '12px' } }}>
      <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 500, py: { xs: 2, sm: 4 } }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <AgentMark />
          <Wordmark size="1.3rem" />
        </Stack>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '1.9rem', sm: '2.3rem' }, lineHeight: 1.1 }}>
            {t('Add another business')}
          </Typography>
          <Typography sx={{ color: BA.soft, mt: 1 }}>
            {t('Each business has its own sign-in. Sign in with the account you use there, or create one with another email address to set up a new business. The businesses already on this device stay signed in.')}
          </Typography>
          <Typography variant="body2" sx={{ color: BA.faint, mt: 1 }}>
            {t('Tip: Gmail, Outlook and iCloud deliver yourname+anything@ to your usual inbox, so one inbox can have an account for each business.')}
          </Typography>
        </Box>

        <AuthCard tab={tab} onTab={setTab} />

        {b.others.length > 0 && (
          <Box component="section" aria-labelledby="add-business-back">
            <Typography id="add-business-back" variant="subtitle2" sx={{ mb: 1, color: BA.soft }}>{t('Or go back to')}</Typography>
            <Stack spacing={1}>
              {b.others.map(a => (
                <ButtonBase key={a.userId} onClick={() => void b.switchTo(a)} disabled={a.signedOut}
                  sx={{ justifyContent: 'flex-start', gap: 1.5, p: 1.25, borderRadius: '14px', textAlign: 'left', bgcolor: BA.card, border: `1px solid ${BA.line}`,
                    '&:hover': { borderColor: BA.ink } }}>
                  <BusinessAvatar name={a.business} logo={a.logo} businessId={a.businessId} size={36} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontWeight: 500 }}>{a.business ?? t('No business yet')}</Typography>
                    <Typography variant="body2" noWrap sx={{ color: BA.soft }}>{a.signedOut ? t('Signed out: sign in again') : a.email ?? a.name}</Typography>
                  </Box>
                  {!a.signedOut && <BackIcon fontSize="small" sx={{ color: BA.faint }} />}
                </ButtonBase>
              ))}
            </Stack>
          </Box>
        )}
      </Stack>
      <Opening account={b.opening} />
    </Box>
  )
}
