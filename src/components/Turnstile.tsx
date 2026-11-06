// Cloudflare Turnstile: the "are you a person?" check on the sign-up form (worker/signupCheck.ts reads
// its answer). Usually it passes by itself, without a puzzle. Loaded from Cloudflare only where it's shown.
import { Box } from '@mui/material'
import { useEffect, useRef } from 'react'
import { currentLanguage } from '../i18n'

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string
  remove(id: string): void
}
declare global { interface Window { turnstile?: TurnstileApi } }

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<TurnstileApi> | null = null
function load(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  return loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load')))
    s.onerror = () => { loading = null; reject(new Error('Turnstile did not load')) }
    document.head.appendChild(s)
  })
}

/**
 * The check, answering `onAnswer` with its token (null when it expires or fails). A token is good for
 * one sign-up: change `round` to show a fresh check after a try.
 */
export function Turnstile({ siteKey, onAnswer, round = 0 }: { siteKey: string; onAnswer: (token: string | null) => void; round?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const answer = useRef(onAnswer)
  answer.current = onAnswer
  useEffect(() => {
    let id: string | null = null
    let gone = false
    answer.current(null)
    load().then(ts => {
      if (gone || !box.current) return
      id = ts.render(box.current, {
        sitekey: siteKey,
        language: currentLanguage(),
        callback: (token: string) => answer.current(token),
        'expired-callback': () => answer.current(null),
        'error-callback': () => answer.current(null),
      })
    }).catch(() => answer.current(null))
    return () => {
      gone = true
      if (id) window.turnstile?.remove(id)
    }
  }, [siteKey, round])
  return <Box ref={box} data-testid="turnstile" sx={{ minHeight: 65, display: 'flex', justifyContent: 'center' }} />
}
