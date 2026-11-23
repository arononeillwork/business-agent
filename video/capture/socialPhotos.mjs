// The photos the team member takes on their phone for the "Instagram and TikTok" video (video/capture/social.mjs):
// drawn here, not photographed, so no real brand or person is in them. Three flat lays for the idea "The coffees we
// have now": the three bags with a cup of each, a cup with a heart in it, and the three cups. 1080 × 1350, JPEG.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BAGS = [
  { origin: 'ETHIOPIA', note: 'Guji · washed', tone: '#C98B5B', label: '#F6E7D2' },
  { origin: 'BRAZIL', note: 'Cerrado · natural', tone: '#9C6B4A', label: '#F3E3EA' },
  { origin: 'COLOMBIA', note: 'Decaf', tone: '#7D8F69', label: '#E7EFE0' },
]

const wood = `
  <defs>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E9D7BF"/><stop offset="1" stop-color="#D8BF9F"/></linearGradient>
    <radialGradient id="crema" cx="0.45" cy="0.4" r="0.6"><stop offset="0" stop-color="#C98A52"/><stop offset="0.7" stop-color="#9A5E30"/><stop offset="1" stop-color="#6B3B1C"/></radialGradient>
    <radialGradient id="milk" cx="0.45" cy="0.4" r="0.6"><stop offset="0" stop-color="#E7C79F"/><stop offset="1" stop-color="#B98352"/></radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#5A3A22" flood-opacity="0.28"/></filter>
  </defs>
  <rect width="1080" height="1350" fill="url(#wood)"/>
  ${Array.from({ length: 14 }, (_, i) => `<path d="M0 ${90 + i * 95} C 300 ${70 + i * 95}, 700 ${115 + i * 95}, 1080 ${85 + i * 95}" stroke="#C9AD88" stroke-width="2" fill="none" opacity="0.35"/>`).join('')}`

/** A cup seen from above: saucer, cup, and espresso or a flat white with a heart. */
const cup = (x, y, r, heart = false) => `
  <g filter="url(#shadow)">
    <circle cx="${x}" cy="${y}" r="${r * 1.45}" fill="#FBF8F4"/>
    <circle cx="${x}" cy="${y}" r="${r * 1.45}" fill="none" stroke="#E7E1DA" stroke-width="3"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="#FFFFFF"/>
    <rect x="${x + r * 0.92}" y="${y - r * 0.16}" width="${r * 0.42}" height="${r * 0.32}" rx="${r * 0.12}" fill="#FFFFFF"/>
  </g>
  <circle cx="${x}" cy="${y}" r="${r * 0.82}" fill="url(#${heart ? 'milk' : 'crema'})"/>
  ${heart ? `<path d="M ${x} ${y + r * 0.42} C ${x - r * 0.62} ${y}, ${x - r * 0.42} ${y - r * 0.5}, ${x} ${y - r * 0.18} C ${x + r * 0.42} ${y - r * 0.5}, ${x + r * 0.62} ${y}, ${x} ${y + r * 0.42} Z" fill="#FBF3E6"/>` : ''}`

/** A coffee bag seen from above, its label with the origin. */
const bag = (x, y, w, b, rot = 0) => `
  <g transform="rotate(${rot} ${x + w / 2} ${y + w * 0.7})" filter="url(#shadow)">
    <path d="M ${x} ${y + 30} L ${x + 20} ${y} L ${x + w - 20} ${y} L ${x + w} ${y + 30} L ${x + w} ${y + w * 1.45} L ${x} ${y + w * 1.45} Z" fill="${b.tone}"/>
    <rect x="${x}" y="${y + 30}" width="${w}" height="16" fill="#00000022"/>
    <rect x="${x + w * 0.12}" y="${y + w * 0.42}" width="${w * 0.76}" height="${w * 0.62}" rx="10" fill="${b.label}"/>
    <text x="${x + w / 2}" y="${y + w * 0.66}" text-anchor="middle" font-family="Georgia, serif" font-size="${w * 0.105}" font-weight="700" fill="#2B2522" letter-spacing="1.5">${b.origin}</text>
    <text x="${x + w / 2}" y="${y + w * 0.82}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${w * 0.075}" fill="#5F5852">${b.note}</text>
    <text x="${x + w / 2}" y="${y + w * 0.96}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${w * 0.06}" fill="#8E877F">250 g</text>
  </g>`

const PHOTOS = {
  'coffees-bags': `${wood}
    ${bag(70, 170, 290, BAGS[0], -4)}${bag(395, 140, 290, BAGS[1], 1)}${bag(720, 175, 290, BAGS[2], 4)}
    ${cup(215, 1010, 118)}${cup(540, 1050, 118)}${cup(865, 1010, 118)}`,
  'coffees-heart': `${wood}
    ${bag(600, 90, 360, BAGS[1], 6)}
    ${cup(420, 860, 250, true)}`,
  'coffees-cups': `${wood}
    ${cup(240, 520, 150)}${cup(560, 760, 150, true)}${cup(860, 520, 150)}
    ${bag(330, 1010, 220, BAGS[0], -8)}${bag(610, 1030, 220, BAGS[2], 7)}`,
}

/** Draws the photos into `dir` (made if missing), with a browser from Playwright; returns their paths. */
export async function drawPhotos(browser, dir) {
  mkdirSync(dir, { recursive: true })
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 })
  const paths = []
  for (const [name, body] of Object.entries(PHOTOS)) {
    await page.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">${body}</svg></body></html>`)
    const path = join(dir, `${name}.jpg`)
    await page.screenshot({ path, type: 'jpeg', quality: 90 })
    paths.push(path)
  }
  await page.close()
  return paths
}
