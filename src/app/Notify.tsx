import { Alert, Portal, Snackbar, useMediaQuery, useTheme } from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Kind = 'success' | 'error' | 'info' | 'warning'
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {})
export const useNotify = () => useContext(Ctx)

/**
 * Wraps a write: shows the error message from our SQL functions, or a success note, and on
 * success refreshes every cached read so all screens show the new state.
 */
export function useAction() {
  const notify = useNotify()
  const client = useQueryClient()
  return useCallback(async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn()
      if (success) notify(success, 'success')
      void client.invalidateQueries()
      return true
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
      return false
    }
  }, [notify, client])
}

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; kind: Kind; key: number } | null>(null)
  const notify = useCallback((text: string, kind: Kind = 'info') => setMsg({ text, kind, key: Date.now() }), [])
  const phone = useMediaQuery(useTheme().breakpoints.down('md'))
  return (
    <Ctx.Provider value={notify}>
      {children}
      {/* A fresh portal per message, so it isn't hidden from screen readers by an open dialog. */}
      {msg && (
        <Portal key={msg.key}>
          <Snackbar open autoHideDuration={5000} onClose={() => setMsg(null)}
            // Phones: at the top, under the header, so it never covers buttons or the bottom bar.
            anchorOrigin={{ vertical: phone ? 'top' : 'bottom', horizontal: 'center' }} sx={{ mt: phone ? 7 : 0 }}>
            <Alert severity={msg.kind} variant="filled" onClose={() => setMsg(null)}>{msg.text}</Alert>
          </Snackbar>
        </Portal>
      )}
    </Ctx.Provider>
  )
}
