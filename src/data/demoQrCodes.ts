// The demo's QR codes (Business section): Easy Beans' three in the owner's order, as the `qr_codes`
// migration has them (the menu on the tables, the competition on the café screen, the Wi-Fi on the
// counter), with the demo's Wi-Fi filled in so its downloads can be tried. Mirrors the migration's
// rules: the team reads them, admins change them.
import type { Api } from './api'
import { cleanUrl, qrProblem, sortQrCodes, type QrCode } from '../../shared/qrCodes'

interface Who {
  isStaff: () => boolean
  isAdmin: () => boolean
  uid: () => string
  nowIso: () => string
}

type QrCodeApi = Pick<Api, 'qrCodes' | 'saveQrCode' | 'deleteQrCode' | 'orderQrCodes'>

const clone = <T,>(x: T): T => structuredClone(x)
const tidy = (s: string | null | undefined) => (s ?? '').trim() || null

export function demoQrCodeApi(w: Who): QrCodeApi {
  const at = w.nowIso()
  const code = (id: string, p: Partial<QrCode> & Pick<QrCode, 'name' | 'sort'>): QrCode => ({ id, kind: 'link', url: null, content: null, wifi_ssid: null,
    wifi_password: null, wifi_security: 'WPA', wifi_hidden: false, used_where: null, caption: null, dark_colour: null, light_colour: null, logo: false,
    created_at: at, updated_at: at, ...p })
  const codes: QrCode[] = [
    code('qr-menu', { name: 'Menu', url: 'https://easybeanscoffee.com/menu', used_where: 'On the tables', caption: 'Scan for the menu', sort: 1 }),
    code('qr-competition', { name: 'Competition', url: 'https://easybeanscoffee.com/competition', used_where: 'On the café screen',
      caption: 'Scan to enter the competition', sort: 2 }),
    code('qr-wifi', { name: 'Wi-Fi', kind: 'wifi', wifi_ssid: 'EasyBeans-Guest', wifi_password: 'flatwhite2026', used_where: 'On the counter',
      caption: 'Scan to join the Wi-Fi', sort: 3 }),
  ]
  const needAdmin = () => { if (!w.isAdmin()) throw new Error('new row violates row-level security policy for table "qr_codes"') }

  return {
    async qrCodes() { return w.isStaff() ? clone(sortQrCodes(codes)) : [] },
    async saveQrCode({ id, ...c }) {
      needAdmin()
      const was = id ? codes.find(x => x.id === id) : undefined
      if (id && !was) throw new Error('That code isn’t here any more')
      const base = was ?? code(w.uid(), { name: '', sort: Math.max(0, ...codes.map(x => x.sort)) + 1, created_at: w.nowIso() })
      // As the database: tidied, the password as typed.
      const next: QrCode = { ...base, ...clone(c), name: c.name.trim(), updated_at: w.nowIso() }
      Object.assign(next, { url: cleanUrl(next.url), content: tidy(next.content), wifi_ssid: tidy(next.wifi_ssid), wifi_password: next.wifi_password || null,
        used_where: tidy(next.used_where), caption: tidy(next.caption) })
      const problem = qrProblem(next)
      if (problem) throw new Error(problem)
      if (codes.some(x => x.id !== next.id && x.name.toLowerCase() === next.name.toLowerCase())) {
        throw new Error('duplicate key value violates unique constraint "qr_codes_name_key"')
      }
      if (was) Object.assign(was, next)
      else codes.push(next)
      return next.id
    },
    async deleteQrCode(id) {
      needAdmin()
      const i = codes.findIndex(x => x.id === id)
      if (i >= 0) codes.splice(i, 1)
    },
    async orderQrCodes(ids) {
      needAdmin()
      ids.forEach((id, i) => { const c = codes.find(x => x.id === id); if (c) c.sort = i + 1 })
    },
  }
}
