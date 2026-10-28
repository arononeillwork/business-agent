import { Alert, Button, FormControlLabel, InputAdornment, Radio, RadioGroup, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { t, tr } from '../i18n'

const WORDS = ['bean', 'matcha', 'ube', 'chai', 'latte', 'crema', 'mocha', 'oat', 'rose', 'lilac', 'cacao', 'honey']

/** Easy to read out or send by WhatsApp: word-word-1234 (about 50 bits). */
export function generatePassword() {
  const n = new Uint32Array(3)
  crypto.getRandomValues(n)
  return `${WORDS[n[0] % WORDS.length]}-${WORDS[n[1] % WORDS.length]}-${String(n[2] % 10000).padStart(4, '0')}`
}

export type SignInSetup = { how: 'password' | 'email'; password: string }
export const useSignInSetup = () => useState<SignInSetup>(() => ({ how: 'password', password: generatePassword() }))

/**
 * How a new person gets in. A temporary password needs no email (Supabase's built-in email only
 * reaches the project's own members until an email provider is set up).
 */
export function SignInSetupFields({ value, onChange }: { value: SignInSetup; onChange: (v: SignInSetup) => void }) {
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">{t('How will they sign in?')}</Typography>
      <RadioGroup value={value.how} onChange={e => onChange({ ...value, how: e.target.value as SignInSetup['how'] })}>
        <FormControlLabel value="password" control={<Radio />} label={t('Temporary password (you give it to them)')} />
        <FormControlLabel value="email" control={<Radio />} label={t('Email invite')} />
      </RadioGroup>
      {value.how === 'password' ? (
        <TextField label={t('Temporary password')} value={value.password} onChange={e => onChange({ ...value, password: e.target.value })}
          helperText={t('Give it to them in person or by WhatsApp. They can change it on My account.')}
          slotProps={{ input: { endAdornment: <InputAdornment position="end">
            <Button size="small" onClick={() => onChange({ ...value, password: generatePassword() })}>{t('New')}</Button>
          </InputAdornment> } }} />
      ) : (
        <Alert severity="warning">{t('Email invites only reach people once an email provider is set up for Supabase. Until then, use a temporary password.')}</Alert>
      )}
    </Stack>
  )
}

/** Shown after saving, so the admin can copy the password before closing. */
export function PasswordToShare({ email, password }: { email: string; password: string }) {
  const { business } = useApp()
  const [copied, setCopied] = useState(false)
  const text = t('{business} team app: {url}\nEmail: {email}\nTemporary password: {password}', { business: business?.name ?? 'Business Agent', url: location.origin, email, password })
  return (
    <Alert severity="success" action={<Button size="small" onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {})}>
      {copied ? t('Copied') : t('Copy')}</Button>}>
      {tr('Account ready. Send them: {email} / {password}', { email: <b>{email}</b>, password: <b>{password}</b> })}
    </Alert>
  )
}
