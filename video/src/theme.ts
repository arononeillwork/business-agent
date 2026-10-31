// Business Agent's look, as the landing page has it (src/pages/marketing/site.tsx): cream, espresso
// ink, rose and lilac; Fraunces for headlines, Figtree for everything else.
import { continueRender, delayRender, staticFile } from 'remotion'

// The fonts are kept in public/fonts (all SIL Open Font Licence, from Google Fonts), so a render
// needs no network. Variable fonts: one file covers every weight.
const FACES: [string, string, FontFaceDescriptors][] = [
  ['Fraunces', 'fonts/fraunces-latin.woff2', { style: 'normal', weight: '400 600' }],
  ['Fraunces', 'fonts/fraunces-italic-latin.woff2', { style: 'italic', weight: '400 600' }],
  ['Figtree', 'fonts/figtree-latin.woff2', { style: 'normal', weight: '400 700' }],
  ['Caveat', 'fonts/caveat-latin.woff2', { style: 'normal', weight: '500 700' }],
]
if (typeof document !== 'undefined') {
  const handle = delayRender('Loading fonts')
  Promise.all(FACES.map(([family, file, desc]) => {
    const face = new FontFace(family, `url(${staticFile(file)}) format('woff2')`, desc)
    ;(document.fonts as unknown as { add(f: FontFace): void }).add(face)
    return face.load()
  })).then(() => continueRender(handle), err => { console.error(err); continueRender(handle) })
}

export const BA = {
  ink: '#2B2522', soft: '#5F5852', faint: '#8E877F', line: '#E7E1DA', lineSoft: '#F0EBE5',
  bg: '#FBF8F4', card: '#FFFFFF', tint: '#F3EEE8', limewash: '#C6C2BB',
  rose: '#F79BA4', roseDeep: '#A85A68', roseSoft: '#FCEDEE',
  lilac: '#B7A3D8', lilacDeep: '#5B4A86', lilacSoft: '#F3EFFA',
  matchaDeep: '#4A6536', matchaSoft: '#EEF4E8',
  night: '#1C1714', nightSoft: '#2A221E',
  good: '#2E7D4F', goodSoft: '#E6F4EA',
}

export const display = '"Fraunces", Georgia, serif'
export const text = '"Figtree", "Helvetica Neue", Arial, sans-serif'
/** Handwriting, for the to-do lists on paper. */
export const hand = '"Caveat", "Comic Sans MS", cursive'

/** Soft glows of the three brand colours, for backgrounds. */
export const glow = (x = '80%', y = '-160px') =>
  `radial-gradient(1200px 620px at ${x} ${y}, rgba(247,155,164,0.22), transparent 70%), ` +
  'radial-gradient(1000px 560px at -10% 10%, rgba(183,163,216,0.20), transparent 70%), ' +
  'radial-gradient(900px 500px at 50% 115%, rgba(198,194,187,0.32), transparent 70%)'
