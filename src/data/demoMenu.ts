// Pictures for the demo's Menu page, in place of Higgsfield's: drawn here as SVG from the words
// asked for (so different words make a different picture) and the brand's colours. Artwork for
// behind a menu has no writing; a whole-menu picture writes the menu in; an item's photo is a cup
// or a pastry on a table. Data addresses, so they show without a network.
import type { MenuSection } from '../../shared/menu'

/** A number from words, the same each time (the picture's look). */
function seedOf(words: string) {
  let h = 2166136261
  for (const ch of words) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}
/** Repeatable "random" numbers from a seed. */
function randoms(seed: number) {
  let s = seed || 1
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32 }
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const svg = (w: number, h: number, body: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`

const bean = (x: number, y: number, r: number, turn: number, fill: string) =>
  `<g transform="translate(${x} ${y}) rotate(${turn})"><ellipse rx="${r}" ry="${r * 0.68}" fill="${fill}"/><path d="M${-r * 0.8} 0 Q0 ${r * 0.35} ${r * 0.8} 0" stroke="rgba(0,0,0,0.28)" stroke-width="${r * 0.12}" fill="none"/></g>`
const leaf = (x: number, y: number, s: number, turn: number, fill: string) =>
  `<g transform="translate(${x} ${y}) rotate(${turn}) scale(${s})"><path d="M0 0 C 20 -18 50 -18 70 0 C 50 18 20 18 0 0 Z" fill="${fill}"/><path d="M4 0 L66 0" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/></g>`

/** Artwork for behind a menu: a soft wash in the brand's colours, beans and leaves around the edges, the middle left calm. */
export function demoArtwork(words: string, width: number, height: number, colours: string[]): string {
  const r = randoms(seedOf(words))
  const [a, b, c] = [colours[0] ?? '#F79BA4', colours[1] ?? '#C6C2BB', colours[3] ?? colours[2] ?? '#6B8E4E']
  const dark = /chalk|black|night|dark/i.test(words)
  const base = dark ? '#2B2522' : '#FBF6EF'
  const w = width, h = height, edge = Math.min(w, h) * 0.16
  let marks = ''
  for (let i = 0; i < 26; i++) {
    // Around the edges only: along one of the four sides.
    const side = Math.floor(r() * 4), t = r()
    const x = side === 0 ? t * w : side === 1 ? w - r() * edge : side === 2 ? t * w : r() * edge
    const y = side === 0 ? r() * edge : side === 1 ? t * h : side === 2 ? h - r() * edge : t * h
    marks += i % 3 ? bean(x, y, 10 + r() * 14, r() * 180, dark ? '#C9A27E' : '#6F4A33') : leaf(x, y, 0.6 + r() * 0.9, r() * 360, c)
  }
  return svg(w, h, `<defs><radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="${base}"/><stop offset="0.7" stop-color="${base}"/>`
    + `<stop offset="1" stop-color="${a}" stop-opacity="0.55"/></radialGradient></defs><rect width="${w}" height="${h}" fill="${base}"/>`
    + `<circle cx="${w * (0.1 + r() * 0.2)}" cy="${h * 0.1}" r="${Math.max(w, h) * 0.32}" fill="${b}" opacity="0.35"/>`
    + `<circle cx="${w * (0.8 + r() * 0.15)}" cy="${h * 0.95}" r="${Math.max(w, h) * 0.28}" fill="${a}" opacity="0.3"/><rect width="${w}" height="${h}" fill="url(#g)"/>${marks}`)
}

/** A whole-menu picture: the artwork with the heading, sections, items and prices written in. */
export function demoMenuPicture(words: string, width: number, height: number, colours: string[],
  menu: { title: string; footer: string | null; sections: MenuSection[]; money: (n: number) => string }): string {
  const art = decodeURIComponent(demoArtwork(words, width, height, colours).split(',')[1]).replace(/^<svg[^>]*>|<\/svg>$/g, '')
  const dark = /chalk|black|night|dark/i.test(words)
  const ink = dark ? '#F6EFE6' : '#2B2522'
  const lines = menu.sections.reduce((n, s) => n + s.items.length + 2, 3)
  const size = Math.min(width / 18, (height * 0.78) / lines)
  let y = height * 0.08 + size * 2.2
  let text = `<text x="${width / 2}" y="${height * 0.08 + size * 1.4}" font-family="Georgia, serif" font-size="${size * 1.9}" text-anchor="middle" fill="${ink}">${esc(menu.title)}</text>`
  for (const s of menu.sections) {
    y += size * 1.2
    text += `<text x="${width * 0.14}" y="${y}" font-family="Georgia, serif" font-size="${size * 1.05}" letter-spacing="3" fill="${colours[0] ?? '#C46B74'}">${esc((s.category ?? 'More').toUpperCase())}</text>`
    for (const i of s.items) {
      y += size * 1.3
      text += `<text x="${width * 0.14}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="${ink}">${esc(i.name)}</text>`
      if (i.sell_price !== null) text += `<text x="${width * 0.86}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" text-anchor="end" fill="${ink}">${esc(menu.money(i.sell_price))}</text>`
    }
  }
  if (menu.footer) text += `<text x="${width / 2}" y="${height * 0.95}" font-family="Helvetica, Arial, sans-serif" font-size="${size * 0.7}" text-anchor="middle" fill="${ink}" opacity="0.75">${esc(menu.footer)}</text>`
  return svg(width, height, art + text)
}

/** An item's photo: a cup (drinks) or a plate with a pastry (food), on a table, in the light of the words asked for. */
export function demoPhoto(words: string, food: boolean): string {
  const r = randoms(seedOf(words))
  const table = ['#D9C2A3', '#C9B08F', '#E6D5BE', '#BFA78A'][Math.floor(r() * 4)]
  const cup = ['#FFFFFF', '#F3E6D8', '#E8EEF0', '#2F3A3F'][Math.floor(r() * 4)]
  const body = food
    ? `<ellipse cx="300" cy="330" rx="210" ry="70" fill="#FFFFFF"/><path d="M170 320 Q300 170 430 320 Q300 360 170 320 Z" fill="#D9A25B"/><path d="M200 315 Q300 215 400 315" stroke="#B9813F" stroke-width="10" fill="none"/>`
    : `<ellipse cx="300" cy="380" rx="200" ry="55" fill="rgba(0,0,0,0.12)"/><ellipse cx="300" cy="360" rx="190" ry="50" fill="${cup}" stroke="rgba(0,0,0,0.12)"/>`
      + `<path d="M180 230 L200 350 Q300 385 400 350 L420 230 Z" fill="${cup}" stroke="rgba(0,0,0,0.12)"/><ellipse cx="300" cy="230" rx="120" ry="34" fill="#8A5A3B"/>`
      + `<path d="M260 228 Q300 200 340 228 Q300 250 260 228 Z" fill="#F4E7D7"/><path d="M420 250 Q480 260 470 300 Q460 330 410 325" stroke="${cup}" stroke-width="18" fill="none"/>`
  return svg(600, 600, `<rect width="600" height="600" fill="${table}"/><circle cx="${100 + r() * 60}" cy="${90 + r() * 40}" r="160" fill="#FFF8EC" opacity="0.45"/>${body}`)
}

/**
 * A boxed menu's strip of illustrations along the bottom, like the café's printed menus: takeaway
 * cups and iced drinks with straws, or a croissant and a bowl (food), or bottles and cans (the fridge),
 * in flat colours with thick outlines.
 */
export function demoStrip(words: string, width = 1200, height = 260): string {
  const r = randoms(seedOf(words))
  const ink = '#3A2E2A'
  const pastel = ['#F3D9B1', '#C9E2B3', '#F6A6A0', '#E9C9A8', '#F8B65A', '#C8B6E2', '#F79BA4']
  const kind = /croissant|bowl|food|açaí|acai|toast/i.test(words) ? 'food' : /bottle|can|fridge|soda|beer/i.test(words) ? 'fridge' : 'drinks'
  const n = kind === 'food' ? 3 : 6
  const step = width / (n + 1)
  let art = ''
  for (let i = 0; i < n; i++) {
    const x = step * (i + 1), base = height * 0.92, fill = pastel[Math.floor(r() * pastel.length)]
    if (kind === 'food') {
      art += i % 2 === 0
        ? `<path d="M${x - 90} ${base - 30} Q${x} ${base - 170} ${x + 90} ${base - 30} Q${x} ${base - 5} ${x - 90} ${base - 30} Z" fill="#E7B36A" stroke="${ink}" stroke-width="6"/>`
          + `<path d="M${x - 40} ${base - 120} Q${x - 30} ${base - 60} ${x - 50} ${base - 28} M${x + 40} ${base - 120} Q${x + 30} ${base - 60} ${x + 50} ${base - 28}" stroke="${ink}" stroke-width="5" fill="none"/>`
        : `<path d="M${x - 100} ${base - 110} Q${x} ${base + 30} ${x + 100} ${base - 110} Z" fill="${fill}" stroke="${ink}" stroke-width="6"/>`
          + `<ellipse cx="${x}" cy="${base - 110}" rx="100" ry="18" fill="#9C4F6B" stroke="${ink}" stroke-width="6"/>`
          + `<circle cx="${x - 30}" cy="${base - 122}" r="12" fill="#E8414E"/><circle cx="${x + 10}" cy="${base - 126}" r="10" fill="#F2D16B"/><circle cx="${x + 38}" cy="${base - 118}" r="11" fill="#5B8CD6"/>`
    } else if (kind === 'fridge') {
      const h = 140 + r() * 50
      art += `<rect x="${x - 30}" y="${base - h}" width="60" height="${h}" rx="14" fill="${fill}" stroke="${ink}" stroke-width="6"/>`
        + `<rect x="${x - 30}" y="${base - h * 0.6}" width="60" height="${h * 0.3}" fill="#FFFFFF" opacity="0.6"/><rect x="${x - 14}" y="${base - h - 22}" width="28" height="26" rx="5" fill="${ink}"/>`
    } else {
      const h = 150 + r() * 40, top = base - h, iced = i % 2 === 1
      art += `<path d="M${x - 42} ${top} L${x + 42} ${top} L${x + 32} ${base} L${x - 32} ${base} Z" fill="${iced ? '#FFFFFF' : fill}" stroke="${ink}" stroke-width="6"/>`
        + (iced
          ? `<path d="M${x - 38} ${top + h * 0.3} L${x + 38} ${top + h * 0.3} L${x + 32} ${base} L${x - 32} ${base} Z" fill="${fill}"/><path d="M${x + 6} ${top} L${x + 24} ${top - 46}" stroke="${ink}" stroke-width="8"/>`
            + `<rect x="${x - 20}" y="${top + h * 0.38}" width="18" height="18" rx="4" fill="#FFFFFF" opacity="0.8"/>`
          : `<rect x="${x - 48}" y="${top - 18}" width="96" height="22" rx="8" fill="#F3EDE4" stroke="${ink}" stroke-width="6"/><rect x="${x - 40}" y="${top + h * 0.35}" width="80" height="${h * 0.25}" fill="#E8D4B8" stroke="${ink}" stroke-width="4"/>`
            + `<ellipse cx="${x}" cy="${top + h * 0.475}" rx="12" ry="16" fill="#6F4A33"/>`)
    }
    art += `<ellipse cx="${x + 10}" cy="${base + 4}" rx="70" ry="9" fill="${fill}" opacity="0.45"/>`
  }
  return svg(width, height, art)
}
