import { Box, Button, CircularProgress } from '@mui/material'
import UploadIcon from '@mui/icons-material/FileUploadOutlined'
import { useRef, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { useAction } from '../../app/Notify'
import { readyPhoto } from '../../lib/media'
import { t } from '../../i18n'

/** Pick a photo: made a JPEG here, then kept in the café's storage (Business Agent/Menu). */
export function PhotoUpload({ onDone, label, maxWidth = 1440 }: { onDone: (url: string) => void | Promise<void>; label?: string; maxWidth?: number }) {
  const { api } = useApp()
  const run = useAction()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    await run(async () => { await onDone(await api.uploadMenuPicture(await readyPhoto(file, false, maxWidth))) })
    setBusy(false)
    if (input.current) input.current.value = ''
  }
  return (
    <>
      <Button size="small" variant="outlined" startIcon={busy ? <CircularProgress size={14} /> : <UploadIcon />} disabled={busy} onClick={() => input.current?.click()}>
        {label ?? t('Upload')}
      </Button>
      <Box component="input" ref={input} type="file" accept="image/*" hidden aria-label={label ?? t('Upload')} onChange={e => void pick((e.target as HTMLInputElement).files?.[0])} />
    </>
  )
}
