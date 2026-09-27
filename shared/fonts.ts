// Brand fonts: the shape of the Google Fonts list and a built-in fallback of popular families.
export interface FontFamily { family: string; category: string }

/** Popular Google Fonts, used when the full list can't be fetched (and in the demo). */
export const POPULAR_FONTS: FontFamily[] = [
  ['Roboto', 'sans-serif'], ['Open Sans', 'sans-serif'], ['Lato', 'sans-serif'], ['Montserrat', 'sans-serif'], ['Poppins', 'sans-serif'],
  ['Inter', 'sans-serif'], ['Figtree', 'sans-serif'], ['Nunito', 'sans-serif'], ['Raleway', 'sans-serif'], ['Work Sans', 'sans-serif'],
  ['DM Sans', 'sans-serif'], ['Manrope', 'sans-serif'], ['Outfit', 'sans-serif'], ['Plus Jakarta Sans', 'sans-serif'], ['Rubik', 'sans-serif'],
  ['Mulish', 'sans-serif'], ['Karla', 'sans-serif'], ['Quicksand', 'sans-serif'], ['Josefin Sans', 'sans-serif'], ['Space Grotesk', 'sans-serif'],
  ['Atkinson Hyperlegible', 'sans-serif'], ['Lexend', 'sans-serif'], ['Sora', 'sans-serif'], ['Urbanist', 'sans-serif'], ['Barlow', 'sans-serif'],
  ['Playfair Display', 'serif'], ['Merriweather', 'serif'], ['Lora', 'serif'], ['PT Serif', 'serif'], ['Libre Baskerville', 'serif'],
  ['Cormorant Garamond', 'serif'], ['EB Garamond', 'serif'], ['DM Serif Display', 'serif'], ['Fraunces', 'serif'], ['Crimson Text', 'serif'],
  ['Bebas Neue', 'display'], ['Abril Fatface', 'display'], ['Righteous', 'display'], ['Lobster', 'display'], ['Alfa Slab One', 'display'],
  ['Pacifico', 'handwriting'], ['Dancing Script', 'handwriting'], ['Caveat', 'handwriting'], ['Satisfy', 'handwriting'], ['Great Vibes', 'handwriting'],
  ['Roboto Mono', 'monospace'], ['JetBrains Mono', 'monospace'], ['Space Mono', 'monospace'], ['IBM Plex Mono', 'monospace'], ['Fira Code', 'monospace'],
].map(([family, category]) => ({ family, category }))

