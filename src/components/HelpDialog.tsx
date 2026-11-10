// Help, from the account menu (AppShell.tsx): how to reach The Business Agent, the set-up guide (admins),
// asking an AI about the app (AI assistants), and the privacy policy and terms.
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material'
import MailIcon from '@mui/icons-material/MailOutlineRounded'
import SetupIcon from '@mui/icons-material/RocketLaunchOutlined'
import AiIcon from '@mui/icons-material/SmartToyOutlined'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { LEGAL } from '../../shared/legal'
import { t } from '../i18n'

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const { isAdmin, permissions } = useApp()
  const row = { px: 1.5, borderRadius: '12px', alignItems: 'flex-start' }
  const icon = { minWidth: 40, mt: 0.5, color: 'text.secondary' }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="help-title">
      <DialogTitle id="help-title">{t('Help')}</DialogTitle>
      <DialogContent>
        <Typography sx={{ color: 'text.secondary', mb: 1 }}>{t('Questions, a problem or an idea? Here’s where to start.')}</Typography>
        <List disablePadding>
          <ListItem disableGutters sx={row}>
            <ListItemIcon sx={icon}><MailIcon /></ListItemIcon>
            <ListItemText primary={t('Write to The Business Agent')}
              secondary={<>
                <Link href={`mailto:${LEGAL.supportEmail}`} sx={{ display: 'inline-block', my: 0.25 }}>{LEGAL.supportEmail}</Link>
                <Box component="span" sx={{ display: 'block' }}>{t('We read every message, and answer as soon as we can.')}</Box>
              </>} />
          </ListItem>
          {isAdmin && (
            <ListItemButton component={RouterLink} to="/setup" onClick={onClose} sx={row}>
              <ListItemIcon sx={icon}><SetupIcon /></ListItemIcon>
              <ListItemText primary={t('Set-up guide')} secondary={t('Connect your apps and finish setting up, a step at a time.')} />
            </ListItemButton>
          )}
          {permissions.ai !== 'none' && (
            <ListItemButton component={RouterLink} to="/ai-assistants" onClick={onClose} sx={row}>
              <ListItemIcon sx={icon}><AiIcon /></ListItemIcon>
              <ListItemText primary={t('Ask an AI assistant')}
                secondary={t('Connect Claude, ChatGPT or another AI on AI assistants, then ask it how to do something in the app, or to do it for you.')} />
            </ListItemButton>
          )}
        </List>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2, px: 1.5 }}>
          <Link component={RouterLink} to="/privacy" variant="body2" underline="hover" onClick={onClose}>{t('Privacy policy')}</Link>
          <Link component={RouterLink} to="/terms" variant="body2" underline="hover" onClick={onClose}>{t('Terms of service')}</Link>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
