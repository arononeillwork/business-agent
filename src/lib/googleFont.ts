import { useEffect } from 'react'

/** Loads a Google font into the page (once). `text` limits it to those letters for quick previews. */
export function useGoogleFont(family: string | null | undefined, text?: string) {
  useEffect(() => {
    if (!family) return
    const id = `gf-${family}-${text ? 'preview' : 'full'}`.replace(/\W+/g, '-')
    if (document.getElementById(id)) return
    const params = `family=${encodeURIComponent(family).replace(/%20/g, '+')}${text ? '' : ':wght@400;600'}&display=swap${text ? `&text=${encodeURIComponent(text)}` : ''}`
    document.head.appendChild(Object.assign(document.createElement('link'), { id, rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?${params}` }))
  }, [family, text])
}
