// Where each change shows, beside the places the other videos draw (owner/where.tsx: Google Maps, the
// website): Business Agent itself first (the page the change landed on, "changed via AI"), and the café's
// TV with the offer on it. Drawn in the app's own look.
import type { ReactNode } from 'react'
import { Img, staticFile } from 'remotion'
import { Mark } from '../places'
import { BA, display, text } from '../theme'
import { Tv } from '../owner/parts'

export const AppIcon = ({ size = 30 }: { size?: number }) => (
  <Img src={staticFile('brand/icon.png')} style={{ width: size, height: size, borderRadius: size * 0.3, border: `1px solid ${BA.line}`, padding: 2, background: '#fff' }} />
)

const Row = ({ left, right, at, strong }: { left: ReactNode; right: ReactNode; at?: number; strong?: boolean }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 24px', fontFamily: text, fontSize: 23, color: BA.ink, borderTop: `1px solid ${BA.lineSoft}` }}>
    <span style={{ color: strong ? BA.ink : BA.soft, fontWeight: strong ? 600 : 400 }}>{left}</span>
    <span style={{ fontWeight: 600 }}>{at === undefined ? right : <Mark at={at}>{right}</Mark>}</span>
  </div>
)

/** The note under a change in the app: who, through what, when. */
const ViaAi = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px 4px', fontFamily: text, fontSize: 19, color: BA.faint }}>
    <svg width={20} height={20} viewBox="0 0 24 24"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" fill={BA.lilac} /></svg>
    Changed by Aron via AI · just now
  </div>
)

/** Business Agent's Opening hours page: Sunday now closes at three. */
export function AppHours({ at }: { at: number }) {
  return (
    <>
      <div style={{ padding: '14px 24px 12px', fontFamily: display, fontSize: 30, color: BA.ink }}>Opening hours</div>
      <Row left="Monday – Friday" right="08:00–18:00" />
      <Row left="Saturday" right="09:00–18:00" />
      <Row left="Sunday" right="09:00–15:00" at={at + 16} strong />
      <ViaAi />
    </>
  )
}

/** Business Agent's Offers & specials: today's 2 for 1 croissants, from one, on the counter TV. */
export function AppOffer({ at }: { at: number }) {
  return (
    <div style={{ padding: '6px 24px 10px', fontFamily: text }}>
      <div style={{ fontFamily: display, fontSize: 30, color: BA.ink, marginBottom: 14 }}>Offers & specials</div>
      <div style={{ borderRadius: 18, border: `1px solid ${BA.line}`, padding: '18px 20px', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 27, color: BA.ink, flex: 1 }}>Butter croissants</span>
          <Mark at={at + 16}><span style={{ fontWeight: 700, fontSize: 27, color: BA.roseDeep }}>2 for 1</span></Mark>
        </div>
        <div style={{ fontSize: 21, color: BA.soft, marginTop: 8 }}>Today 13:00–18:00</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <span style={{ padding: '5px 12px', borderRadius: 999, background: BA.lilacSoft, color: BA.lilacDeep, fontWeight: 600, fontSize: 18 }}>On Counter TV</span>
          <span style={{ padding: '5px 12px', borderRadius: 999, background: BA.tint, color: BA.soft, fontWeight: 600, fontSize: 18 }}>Coming up</span>
        </div>
      </div>
      <ViaAi />
    </div>
  )
}

/** The café's TV on the counter, the offer's slide on it. */
export function TvOffer({ width }: { width: number }) {
  return (
    <Tv width={width}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(900px 500px at 80% -10%, rgba(247,155,164,0.35), transparent 70%), ${BA.bg}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: text }}>
        <div style={{ fontWeight: 600, fontSize: width * 0.026, letterSpacing: '0.18em', textTransform: 'uppercase', color: BA.roseDeep }}>Today from 13:00</div>
        <div style={{ fontFamily: display, fontWeight: 500, fontStyle: 'italic', fontSize: width * 0.15, lineHeight: 1, color: BA.roseDeep, marginTop: width * 0.015 }}>2 for 1</div>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: width * 0.06, color: BA.ink, marginTop: width * 0.01 }}>Butter croissants</div>
        <div style={{ position: 'absolute', left: width * 0.03, bottom: width * 0.025, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: width * 0.022, color: BA.ink }}>
          <AppIcon size={width * 0.04} />Easy Beans Coffee
        </div>
      </div>
    </Tv>
  )
}
