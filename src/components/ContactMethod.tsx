import { Box, Chip, ListItemIcon, ListItemText, MenuItem, TextField } from '@mui/material'
import SmsIcon from '@mui/icons-material/SmsOutlined'
import MailIcon from '@mui/icons-material/MailOutlined'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import CallIcon from '@mui/icons-material/CallOutlined'
import SlackIcon from '@mui/icons-material/TagOutlined'
import TelegramIcon from '@mui/icons-material/Telegram'
import type { ReactNode } from 'react'
import type { ContactMethod } from '../../shared/types'
import { tokens } from '../theme'

/** Ways to reach someone. `soon`: shown so people know it's coming, but can't be picked yet. */
export const CONTACT_METHODS: { value: ContactMethod; label: string; icon: ReactNode; soon?: boolean }[] = [
  { value: 'whatsapp', label: 'WhatsApp', icon: <WhatsAppIcon fontSize="small" /> },
  { value: 'sms', label: 'Text message', icon: <SmsIcon fontSize="small" /> },
  { value: 'email', label: 'Email', icon: <MailIcon fontSize="small" /> },
  { value: 'call', label: 'Phone call', icon: <CallIcon fontSize="small" />, soon: true },
  { value: 'slack', label: 'Slack', icon: <SlackIcon fontSize="small" />, soon: true },
  { value: 'telegram', label: 'Telegram', icon: <TelegramIcon fontSize="small" />, soon: true },
]
export const contactMethod = (v?: ContactMethod | null) => CONTACT_METHODS.find(m => m.value === v)

/** "Preferred contact" picker; coming-soon options are listed but disabled. */
export function ContactMethodField({ value, onChange, label = 'Preferred contact' }: { value: ContactMethod | null; onChange: (v: ContactMethod | null) => void; label?: string }) {
  return (
    <TextField select label={label} value={value ?? ''} onChange={e => onChange((e.target.value || null) as ContactMethod | null)}
      helperText="How the café should reach you about shifts and changes"
      slotProps={{ select: { renderValue: v => {
        const m = contactMethod(v as ContactMethod)
        return m ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, '& svg': { color: tokens.inkSoft } }}>{m.icon}{m.label}</Box> : 'No preference'
      }, displayEmpty: true } }}>
      <MenuItem value="">No preference</MenuItem>
      {CONTACT_METHODS.map(m => (
        <MenuItem key={m.value} value={m.value} disabled={m.soon}>
          <ListItemIcon sx={{ minWidth: 32 }}>{m.icon}</ListItemIcon>
          <ListItemText primary={m.label} />
          {m.soon && <Chip size="small" label="Coming soon" sx={{ ml: 1.5, bgcolor: tokens.ubeSoft, color: tokens.ubeDeep }} />}
        </MenuItem>
      ))}
    </TextField>
  )
}
