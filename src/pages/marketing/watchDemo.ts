// "View a demo" (the hero): down to the demo video on the landing page, playing it from the start with
// its music; and the same for the Demos page's cards. Its own file so the video sections can take
// lessMotion from it without an import loop through site.tsx.
import type { MouseEvent } from 'react'

/** Whether the visitor has asked for less motion: no smooth scrolling, and videos don't start by themselves. */
export const lessMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Scroll down to the demo video and play it from the start, with its music (the click allows the sound; muted if the browser still says no). */
export function watchDemo(e?: MouseEvent) {
  watchVideo('demo', e)
}

/** The same for any video section on the page (#demo, #day, #owner): the Demos page's cards. */
export function watchVideo(id: string, e?: MouseEvent) {
  e?.preventDefault()
  document.getElementById(id)?.scrollIntoView({ behavior: lessMotion() ? 'auto' : 'smooth', block: 'start' })
  const v = document.querySelector<HTMLVideoElement>(`#${id} video`)
  if (!v) return
  v.currentTime = 0
  v.muted = false
  void v.play().catch(() => { v.muted = true; void v.play().catch(() => { /* the controls are there */ }) })
}
