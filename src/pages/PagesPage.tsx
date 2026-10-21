import { Box, Button, Card, CardContent, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { ALWAYS_SHOWN, SECTIONS, canOpen, navLabel, type NavItem } from '../app/AppShell'
import { PageHeader } from '../components/common'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

/**
 * Settings → Pages: which pages show in the menu. Everyone hides pages from their own menu; admins
 * also hide pages from everyone's (a business that doesn't use Sports or Music, say). A hidden page
 * leaves the menu and search, and still opens from a link.
 */
export function PagesPage() {
  const { isAdmin, isPartner, canSeePay, partnerCan, me, settings, api, refresh } = useApp()
  const run = useAction()
  // Kept on screen straight away while it saves (as the menu's pins are).
  const [mine, setMineNow] = useState<string[]>(me?.preferences?.navHidden ?? [])
  const [team, setTeamNow] = useState<string[]>(settings?.hidden_pages ?? [])
  useEffect(() => setMineNow(me?.preferences?.navHidden ?? []), [me?.preferences?.navHidden])
  useEffect(() => setTeamNow(settings?.hidden_pages ?? []), [settings?.hidden_pages])
  const admin = isAdmin && !isPartner
  const sections = SECTIONS.map(s => ({ ...s, items: s.items.filter(n => canOpen(n, { isAdmin, isPartner, canSeePay, partnerCan })) })).filter(s => s.items.length)

  const setMine = (key: string, show: boolean) => run(async () => {
    if (!me) return
    const next = show ? mine.filter(k => k !== key) : [...new Set([...mine, key])]
    setMineNow(next)
    await api.updateProfile(me.id, { preferences: { ...me.preferences, navHidden: next } })
    await refresh()
  })
  const setTeam = (key: string, show: boolean) => run(async () => {
    const next = show ? team.filter(k => k !== key) : [...new Set([...team, key])]
    setTeamNow(next)
    await api.updateSettings({ hidden_pages: next })
    await refresh()
  })
  const showAll = () => run(async () => {
    setMineNow([])
    if (admin) setTeamNow([])
    if (me && mine.length) await api.updateProfile(me.id, { preferences: { ...me.preferences, navHidden: [] } })
    if (admin && team.length) await api.updateSettings({ hidden_pages: [] })
    await refresh()
  }, t('Every page is in the menu again'))

  const row = (n: NavItem) => {
    const fixed = ALWAYS_SHOWN.includes(n.key)
    const forTeam = !team.includes(n.key)
    return (
      <TableRow key={n.key} hover>
        <TableCell>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box sx={{ color: 'text.secondary', display: 'flex' }}>{n.icon}</Box>
            <Box>
              <Typography>{navLabel(n)}</Typography>
              {!forTeam && <Typography variant="caption" sx={{ color: tokens.roseDeep }}>{t('Hidden for the team')}</Typography>}
            </Box>
          </Stack>
        </TableCell>
        <TableCell align="center">
          <Switch checked={fixed || !mine.includes(n.key)} disabled={fixed || !forTeam} onChange={e => void setMine(n.key, e.target.checked)}
            slotProps={{ input: { 'aria-label': t('Show {page} in my menu', { page: navLabel(n) }) } }} />
        </TableCell>
        {admin && (
          <TableCell align="center">
            <Switch checked={fixed || forTeam} disabled={fixed} onChange={e => void setTeam(n.key, e.target.checked)}
              slotProps={{ input: { 'aria-label': t('Show {page} for the team', { page: navLabel(n) }) } }} />
          </TableCell>
        )}
      </TableRow>
    )
  }

  const hiddenCount = new Set([...mine, ...(admin ? team : [])]).size
  return (
    <>
      <PageHeader eyebrow={t('Settings')} title={t('Pages')} actions={hiddenCount > 0 && (
        <Button onClick={() => void showAll()}>{tn(hiddenCount, 'Show {n} hidden page again', 'Show {n} hidden pages again')}</Button>
      )} />
      <Typography sx={{ color: 'text.secondary', mb: 3, maxWidth: 720 }}>
        {admin
          ? t('Choose the pages in your menu. “For the team” hides a page from everyone’s menu, yours included, for parts of the app the business doesn’t use. A hidden page still opens from a link.')
          : t('Choose the pages in your menu. A hidden page still opens from a link.')}
      </Typography>
      {sections.map(s => (
        <Card key={s.key} component="section" aria-label={s.label ? t(s.label) : t('Pages')} sx={{ mb: 2 }}>
          <CardContent sx={{ pb: '8px !important' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell sx={{ fontWeight: 600 }}>{s.label ? t(s.label) : ''}</TableCell>
                <TableCell align="center" sx={{ width: 120 }}>{t('My menu')}</TableCell>
                {admin && <TableCell align="center" sx={{ width: 120 }}>{t('For the team')}</TableCell>}
              </TableRow></TableHead>
              <TableBody>{s.items.map(row)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </>
  )
}
