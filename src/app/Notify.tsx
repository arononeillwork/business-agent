import { Alert, Portal, Snackbar, useMediaQuery, useTheme } from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { runAction } from './query'

type Kind = 'success' | 'error' | 'info' | 'warning'
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {})
export const useNotify = () => useContext(Ctx)

/**
 * Wraps a write: shows the error message from our SQL functions, or the success note as soon as the
 * write is done, then refreshes every cached read so all screens show the new state (runAction).
 * `fn` is the write alone: the reload is run's, so it doesn't call refresh(). With `{ fresh: true }`
 * it resolves once the app's own data (useApp) shows the change, for a dialog that closes onto it or
 * a form that resets from it; without, straight away.
 */
export function useAction() {
  const notify = useNotify()
  const client = useQueryClient()
  return useCallback((fn: () => Promise<unknown>, success?: string, options?: { fresh?: boolean }) =>
    runAction(client, notify, fn, success, options), [notify, client])
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
            // At the top (under the phone header): at the bottom it covered dialog buttons (Cancel,
            // Save) on laptops and the sign-in buttons and bottom bar on phones.
            anchorOrigin={{ vertical: 'top', horizontal: 'center' }} sx={{ mt: phone ? 7 : 1 }}>
            <Alert severity={msg.kind} variant="filled" onClose={() => setMsg(null)}>{msg.text}</Alert>
          </Snackbar>
        </Portal>
      )}
    </Ctx.Provider>
  )
}
