import { Alert, Snackbar } from '@mui/material'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Kind = 'success' | 'error' | 'info' | 'warning'
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {})
export const useNotify = () => useContext(Ctx)

/** Wraps an action: shows the error message from our SQL functions, or a success note. */
export function useAction() {
  const notify = useNotify()
  return useCallback(async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn()
      if (success) notify(success, 'success')
      return true
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
      return false
    }
  }, [notify])
}

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; kind: Kind; key: number } | null>(null)
  const notify = useCallback((text: string, kind: Kind = 'info') => setMsg({ text, kind, key: Date.now() }), [])
  return (
    <Ctx.Provider value={notify}>
      {children}
      <Snackbar key={msg?.key} open={!!msg} autoHideDuration={5000} onClose={() => setMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} sx={{ mb: { xs: 8, md: 0 } }}>
        {msg ? <Alert severity={msg.kind} variant="filled" onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </Ctx.Provider>
  )
}
