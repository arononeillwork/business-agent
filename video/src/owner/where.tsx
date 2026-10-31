// Where each of the owner's changes shows: the café on Google Maps (its hours, its menu, a review and
// the reply), its own website's opening hours, the TV on the counter (recorded from the app's own screen
// link), the printed menu (cut from the app's print page), and the offer's story on a phone.
import type { ReactNode } from 'react'
import { Img, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { siGooglemaps, siInstagram } from 'simple-icons'
import { Clip, Crop, Logo, Phone } from '../kit'
import { Mark, Ring } from '../places'
import { BA, text } from '../theme'
import { Tv } from './parts'

const Row = ({ left, right, at, strong }: { left: ReactNode; right: ReactNode; at?: number; strong?: boolean }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 24px', fontFamily: text, fontSize: 23, color: BA.ink, borderTop: `1px solid ${BA.lineSoft}` }}>
    <span style={{ color: strong ? BA.ink : BA.soft, fontWeight: strong ? 600 : 400 }}>{left}</span>
    <span style={{ fontWeight: 600 }}>{at === undefined ? right : <Mark at={at}>{right}</Mark>}</span>
  </div>
)

/** The café's name and stars, and its tabs, as its Google Maps listing has them. */
function Listing({ tab }: { tab: 'Overview' | 'Menu' | 'Reviews' }) {
  return (
    <div style={{ padding: '16px 24px 14px' }}>
      <div style={{ fontFamily: text, fontWeight: 600, fontSize: 30, color: BA.ink }}>Easy Beans Coffee</div>
      <div style={{ fontFamily: text, fontSize: 20, color: BA.faint, marginTop: 4 }}>4.3 <span style={{ color: '#F4B400' }}>★★★★☆</span> (12)</div>
      <div style={{ display: 'flex', gap: 22, marginTop: 16, fontFamily: text, fontWeight: 600, fontSize: 20 }}>
        {(['Overview', 'Menu', 'Reviews'] as const).map(t => (
          <span key={t} style={{ color: t === tab ? '#1A73E8' : BA.faint, borderBottom: `3px solid ${t === tab ? '#1A73E8' : 'transparent'}`, paddingBottom: 6 }}>{t}</span>
        ))}
      </div>
    </div>
  )
}

export const MapsIcon = () => <Logo icon={siGooglemaps} size={30} />
export const InstagramIcon = () => <Logo icon={siInstagram} size={30} />

/** Google Maps: the week's hours, Sunday now closing at three. */
export function MapsHours({ at }: { at: number }) {
  return (
    <>
      <Listing tab="Overview" />
      <Row left="Monday – Friday" right="08:00–18:00" />
      <Row left="Saturday" right="09:00–18:00" />
      <Row left="Sunday" right="09:00–15:00" at={at + 16} strong />
      <div style={{ height: 8 }} />
    </>
  )
}

/** Google Maps: the menu, Pain au chocolat at its new price. */
export function MapsMenu({ at }: { at: number }) {
  return (
    <>
      <Listing tab="Menu" />
      <Row left="Croissant" right="€1,80" />
      <Row left="Pain au chocolat" right="€2,90" at={at + 16} strong />
      <Row left="Flat white" right="€3,20" />
      <Row left="Cappuccino" right="€2,90" />
      <div style={{ height: 8 }} />
    </>
  )
}

/** Google Maps: Tom's review, and the café's reply under it. */
export function MapsReview({ at }: { at: number }) {
  return (
    <>
      <Listing tab="Reviews" />
      <div style={{ padding: '14px 26px 0', fontFamily: text, borderTop: `1px solid ${BA.lineSoft}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: '#5C6BC0', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 20 }}>T</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 22, color: BA.ink }}>Tom Hughes</div>
            <div style={{ fontSize: 18, color: BA.faint }}><span style={{ color: '#F4B400' }}>★★</span><span style={{ color: '#DADCE0' }}>★★★</span> · 28 Sep</div>
          </div>
        </div>
        <div style={{ fontSize: 21, lineHeight: 1.4, color: BA.ink, marginTop: 10 }}>Coffee was good but we waited 20 minutes for two flat whites on Saturday morning, and nobody said sorry.</div>
        <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 12, background: '#F1F3F4' }}>
          <div style={{ fontWeight: 600, fontSize: 19, color: BA.ink }}><Mark at={at + 16}>Response from the owner</Mark> · just now</div>
          <div style={{ fontSize: 19, lineHeight: 1.4, color: BA.soft, marginTop: 6 }}>Hi Tom, we’re very sorry your visit wasn’t what you hoped for. We’d like to hear more and put it right…</div>
        </div>
      </div>
    </>
  )
}

/** The café's own website: its opening hours, as the site shows them. Drawn, the hours as the app now has them. */
export function WebsiteHours({ at }: { at: number }) {
  const hours: [string, string, boolean][] = [['Monday – Friday', '08:00 – 18:00', false], ['Saturday', '09:00 – 18:00', false], ['Sunday', '09:00 – 15:00', true]]
  return (
    <div style={{ margin: '0 24px', borderRadius: 16, overflow: 'hidden', background: '#F7EFEA', boxShadow: 'inset 0 0 0 1px rgba(43,37,34,0.06)' }}>
      <div style={{ height: 34, display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', background: '#EDE3DC', fontFamily: text, fontSize: 15, color: BA.soft }}>
        {['#F2766B', '#F4BF4F', '#61C554'].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: 5, background: c }} />)}
        <span style={{ marginLeft: 10 }}>easybeanscoffee.com</span>
      </div>
      <div style={{ padding: '18px 24px 22px', fontFamily: text }}>
        <div style={{ fontWeight: 700, fontSize: 24, color: BA.ink, letterSpacing: '0.02em' }}>Find us</div>
        <div style={{ fontSize: 18, color: BA.soft, marginTop: 4 }}>C. Pizarro, 8 · San Pedro de Alcántara</div>
        <div style={{ fontWeight: 600, fontSize: 19, color: BA.ink, marginTop: 16 }}>Opening hours</div>
        {hours.map(([d, h, changed]) => (
          <div key={d} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 21, color: BA.ink, marginTop: 8 }}>
            <span style={{ color: BA.soft }}>{d}</span>
            <span style={{ fontWeight: 600 }}>{changed ? <Mark at={at + 16}>{h}</Mark> : h}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The TV's own recording (video/capture/owner.mjs `tv`): from second `a`, at its own speed. */
export function TvClip({ width, a, b, ring, at }: { width: number; a: number; b: number; ring?: { x: number; y: number; w: number; h: number }; at: number }) {
  const screenW = width - 2 * Math.round(width * 0.018)
  const k = screenW / 1600
  return (
    <Tv width={width}>
      <Sequence from={at} layout="none"><Clip src="clips/owner-tv.mp4" segs={[{ a, b, rate: 1 }]} /></Sequence>
      {ring && <Ring at={at + 18} x={ring.x * k} y={ring.y * k} w={ring.w * k} h={ring.h * k} />}
    </Tv>
  )
}

/** The printed food menu, from the app's print page, the new price ringed. */
export function PrintedMenu({ at, width }: { at: number; width: number }) {
  const k = width / 952
  return (
    <div style={{ position: 'relative', width, borderRadius: 6, overflow: 'hidden', boxShadow: '0 30px 60px rgba(43,37,34,0.22), 0 0 0 1px rgba(43,37,34,0.06)', rotate: '-1.5deg' }}>
      <Crop src="stills/owner-print.png" x={484} y={105} w={952} h={780} width={width} natural={1920} />
      <Ring at={at + 18} x={(560 - 484) * k} y={(628 - 105) * k} w={800 * k} h={46 * k} />
    </div>
  )
}

/** The offer's story on a phone: the picture the app drew from the offer, as it goes out on Instagram. */
export function StoryPhone({ width, at }: { width: number; at: number }) {
  return (
    <div style={{ position: 'relative', width, height: Math.round(width * 2.13) }}>
      <Phone width={width}>
        <Img src={staticFile('stills/owner-story.png')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', left: 14, right: 14, top: 34, height: 4, borderRadius: 2, background: 'rgba(43,37,34,0.18)', overflow: 'hidden' }}>
          <Grow at={at} />
        </div>
        <div style={{ position: 'absolute', left: 14, top: 48, display: 'flex', alignItems: 'center', gap: 8, fontFamily: text, fontWeight: 600, fontSize: 15, color: BA.ink }}>
          <Img src={staticFile('brand/icon.png')} style={{ width: 30, height: 30, borderRadius: 15, background: '#fff', padding: 2, border: `2px solid ${BA.rose}` }} />
          easy.beans.coffee <span style={{ color: BA.faint, fontWeight: 400 }}>now</span>
        </div>
      </Phone>
    </div>
  )
}

/** A story's progress bar filling over five seconds from `at`. */
function Grow({ at }: { at: number }) {
  const f = useCurrentFrame() - at
  return <div style={{ width: `${Math.max(0, Math.min(100, (f / 150) * 100))}%`, height: '100%', background: BA.ink }} />
}
