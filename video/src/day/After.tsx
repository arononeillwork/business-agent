// The same day with Business Agent, recorded in the app (video/capture/day.mjs): the opening checklist
// and the music on the phone, one inbox, the order already written, the last-day offer, the week's
// posts, bills and tax, the licence renewed in time, the closing checklist; home at half past three.
// Then the two days side by side, and the brand.
import type { ReactNode } from 'react'
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { Browser, Caption, Clip, Cream, Em, Phone, Sfx, Zoomed, ease, useEnter } from '../kit'
import { BA, display, text } from '../theme'
import { WIN, type Segment } from '../timeline'
import type { ClipMeta } from '../clips'
import open from '../../public/clips/day-open.json'
import close from '../../public/clips/day-close.json'
import messages from '../../public/clips/day-messages.json'
import order from '../../public/clips/day-order.json'
import invoices from '../../public/clips/day-invoices.json'
import licence from '../../public/clips/day-licence.json'
import { rawToOut } from '../timeline'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const STILL = [{ f: 0, s: 1, fx: 720, fy: 450 }]

/** Click sounds for a clip's logged clicks, through its cuts. */
function Clicks({ meta, segs, from = 0 }: { meta: unknown; segs: Segment[]; from?: number }) {
  const m = meta as ClipMeta
  return <>{m.events.filter(e => e.type === 'click').map((e, i) => {
    const f = rawToOut(e.t, segs)
    return f === null ? null : <Sfx key={i} name="click" at={from + f} volume={0.26} />
  })}</>
}

/** The hour, top right, in a soft pill. */
function Hour({ time, left }: { time: string; left?: number }) {
  const p = useEnter(4, 200)
  return (
    <div style={{ position: 'absolute', ...(left === undefined ? { right: WIN.x, top: 74 } : { left, top: 250 }), display: 'flex', alignItems: 'center', gap: 10, padding: '10px 22px', borderRadius: 999, background: '#fff',
      boxShadow: '0 10px 30px rgba(60,40,30,0.10)', fontFamily: text, fontWeight: 600, fontSize: 32, color: BA.ink, fontVariantNumeric: 'tabular-nums', opacity: p }}>
      <svg width={28} height={28} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke={BA.roseDeep} strokeWidth="2" /><path d="M12 7v5l3 2" stroke={BA.roseDeep} strokeWidth="2" strokeLinecap="round" fill="none" /></svg>
      {time}
    </div>
  )
}

/** A desktop moment: headline, the hour, the app in its window. */
function Desk({ time, title, url, children, len }: { time: string; title: ReactNode; url: string; children: ReactNode; len: number }) {
  const frame = useCurrentFrame()
  const win = useEnter(0, 200)
  const out = interpolate(frame, [len - 8, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={title} at={0} width={1000} />
        <Hour time={time} />
        <Browser url={url} width={WIN.w} height={WIN.h} style={{ left: WIN.x, top: WIN.y, opacity: win, translate: `0 ${interpolate(win, [0, 1], [60, 0])}px` }}>
          <Zoomed keys={STILL} w={WIN.w} h={WIN.h}>{children}</Zoomed>
        </Browser>
      </AbsoluteFill>
    </Cream>
  )
}

/** A phone moment: the headline large on the left, the phone on the right. */
function Hand({ time, title, children, len }: { time: string; title: ReactNode; children: ReactNode; len: number }) {
  const frame = useCurrentFrame()
  const p = useEnter(0, 200)
  const out = interpolate(frame, [len - 8, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={title} size={92} x={160} y={340} width={960} at={2} />
        <Hour time={time} left={160} />
        <div style={{ position: 'absolute', left: 1230, top: 110, width: 420, opacity: p, translate: `0 ${interpolate(p, [0, 1], [100, 0])}px` }}>
          <Phone width={420}>{children}</Phone>
        </div>
      </AbsoluteFill>
    </Cream>
  )
}

const seg = (a: number, b: number, frames: number): Segment[] => [{ a, b, rate: ((b - a) * 30) / frames }]

export function OpenUp({ len }: { len: number }) {
  const s = seg(0.3, 8.0, len - 6)
  return (
    <Hand time="07:00" len={len} title={<>Open up with a checklist.<br /><Em>Music on.</Em></>}>
      <Clip src="clips/day-open.mp4" segs={s} />
      <Clicks meta={open} segs={s} />
    </Hand>
  )
}

export function Inbox({ len }: { len: number }) {
  const s = seg(2.2, 13.6, len - 6)
  return (
    <Desk time="09:00" len={len} url="businesssagent.com/messages" title={<>Every message, <Em>one inbox.</Em></>}>
      <Clip src="clips/day-messages.mp4" segs={s} />
      <Clicks meta={messages} segs={s} />
    </Desk>
  )
}

export function Order({ len }: { len: number }) {
  const s = seg(2.4, 11.0, len - 6)
  return (
    <Desk time="10:30" len={len} url="businesssagent.com/stock" title={<>Running low? <Em>The order’s written.</Em></>}>
      <Clip src="clips/day-order.mp4" segs={s} />
      <Clicks meta={order} segs={s} />
    </Desk>
  )
}

/** The last-day offer, on the café's TV and the Offers page (recorded once that feature is live). */
export function LastDay({ len }: { len: number }) {
  const s = seg(0.5, 8.0, len - 6)
  return (
    <Desk time="12:00" len={len} url="businesssagent.com/offers" title={<>Last day? <Em>On offer by itself.</Em></>}>
      <Clip src="clips/day-offer.mp4" segs={s} />
    </Desk>
  )
}

export function Posts({ len }: { len: number }) {
  return (
    <Desk time="13:00" len={len} url="businesssagent.com/social" title={<>Posts, <Em>already scheduled.</Em></>}>
      <Clip src="clips/day-social.mp4" segs={seg(0.8, 11.6, len - 6)} />
    </Desk>
  )
}

export function Accounts({ len }: { len: number }) {
  const half = Math.round(len / 2)
  const a = seg(2.6, 7.4, half)
  const frame = useCurrentFrame()
  const swap = interpolate(frame, [half - 5, half + 5], [0, 1], clamp)
  return (
    <Desk time="14:00" len={len} url={swap < 0.5 ? 'businesssagent.com/invoices' : 'businesssagent.com/tax'} title={<>Bills paid. <Em>Tax filed.</Em></>}>
      <AbsoluteFill style={{ opacity: 1 - swap }}><Clip src="clips/day-invoices.mp4" segs={a} /></AbsoluteFill>
      <Sequence from={half - 5} layout="none">
        <AbsoluteFill style={{ opacity: swap }}><Clip src="clips/day-tax.mp4" segs={seg(1.0, 8.4, len - half - 1)} /></AbsoluteFill>
      </Sequence>
      <Clicks meta={invoices} segs={a} />
    </Desk>
  )
}

export function Licence({ len }: { len: number }) {
  const s = seg(1.6, 8.2, len - 6)
  return (
    <Desk time="14:30" len={len} url="businesssagent.com/legal" title={<>Licences renewed <Em>in time.</Em></>}>
      <Clip src="clips/day-licence.mp4" segs={s} />
      <Clicks meta={licence} segs={s} />
    </Desk>
  )
}

export function CloseUp({ len }: { len: number }) {
  const s = seg(0.6, 5.1, len - 6)
  return (
    <Hand time="15:00" len={len} title={<>Close up,<br /><Em>ticked off.</Em></>}>
      <Clip src="clips/day-close.mp4" segs={s} />
      <Clicks meta={close} segs={s} />
    </Hand>
  )
}

export function Home() {
  const a = useEnter(4, 200)
  const b = useEnter(16, 200)
  const frame = useCurrentFrame()
  const out = interpolate(frame, [110, 120], [1, 0], clamp)
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #F9D9C9 0%, #FBEFE8 100%)', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', opacity: out }}>
        <div style={{ fontFamily: display, fontSize: 220, color: BA.ink, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', opacity: a, translate: `0 ${interpolate(a, [0, 1], [20, 0])}px` }}>15:30</div>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: 80, color: BA.ink, opacity: b }}>Home by <Em>half past three.</Em></div>
      </div>
    </AbsoluteFill>
  )
}

/** "Now the same day": the clock runs back from 23:10 to 07:00 as the night gives way to cream. */
export function Rewind() {
  const frame = useCurrentFrame()
  const p = interpolate(frame, [8, 64], [0, 1], { ...clamp, easing: ease })
  const mins = Math.round(interpolate(p, [0, 1], [23 * 60 + 10, 7 * 60]))
  const time = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  const light = interpolate(frame, [40, 76], [0, 1], clamp)
  const line = useEnter(70, 200)
  const out = interpolate(frame, [110, 120], [1, 0], clamp)
  return (
    <AbsoluteFill style={{ background: BA.night }}>
      <AbsoluteFill style={{ background: BA.bg, opacity: light }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out }}>
        <div style={{ fontFamily: display, fontSize: 230, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', marginTop: -60,
          color: `rgb(${Math.round(255 - (255 - 43) * light)},${Math.round(255 - (255 - 37) * light)},${Math.round(255 - (255 - 34) * light)})` }}>{time}</div>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: 76, color: BA.ink, opacity: line, translate: `0 ${interpolate(line, [0, 1], [20, 0])}px` }}>
          The same day. <Em>With Business Agent.</Em>
        </div>
      </AbsoluteFill>
      <Sfx name="rewind" at={6} volume={0.35} />
    </AbsoluteFill>
  )
}

/** One line of the side by side, rising in at `at`. */
function Row({ at, children, light }: { at: number; children: ReactNode; light?: boolean }) {
  const p = useEnter(at, 200)
  return <div style={{ fontFamily: display, fontSize: 48, lineHeight: 1.25, marginTop: 26, color: light ? '#fff' : BA.ink, opacity: p, translate: `0 ${interpolate(p, [0, 1], [16, 0])}px` }}>{children}</div>
}

/** The two days side by side. */
export function Recap() {
  const frame = useCurrentFrame()
  const split = interpolate(frame, [0, 20], [0, 1], { ...clamp, easing: ease })
  const out = interpolate(frame, [228, 240], [1, 0], clamp)
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 960, background: `radial-gradient(900px 700px at 50% 20%, #2E2520, ${BA.night} 75%)`,
        translate: `${interpolate(split, [0, 1], [-960, 0])}px 0`, padding: '150px 110px' }}>
        <div style={{ fontFamily: text, fontWeight: 600, fontSize: 28, letterSpacing: '0.14em', textTransform: 'uppercase', color: BA.rose }}>Without</div>
        <div style={{ fontFamily: display, fontSize: 150, color: '#fff', marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>23:10</div>
        <Row at={26} light>{'Still working.'}</Row>
        <Row at={40} light>{'Nine messages waiting.'}</Row>
        <Row at={54} light>{<>The terrace licence <span style={{ color: BA.rose }}>expired.</span></>}</Row>
      </div>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 960, background: BA.bg, translate: `${interpolate(split, [0, 1], [960, 0])}px 0`, padding: '150px 110px' }}>
        <AbsoluteFill style={{ backgroundImage: 'radial-gradient(900px 500px at 90% -10%, rgba(247,155,164,0.22), transparent 70%)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: text, fontWeight: 600, fontSize: 28, letterSpacing: '0.14em', textTransform: 'uppercase', color: BA.roseDeep }}>With Business Agent</div>
          <div style={{ fontFamily: display, fontSize: 150, color: BA.ink, marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>15:30</div>
          <Row at={76}>{<>Home. <Em>Done.</Em></>}</Row>
          <Row at={90}>{'Every message answered.'}</Row>
          <Row at={104}>{<>The licence renewed <Em>for 2027.</Em></>}</Row>
        </div>
      </div>
    </AbsoluteFill>
  )
}

export function EndCard() {
  const mark = useEnter(2, 14)
  const word = useEnter(8, 200)
  const tag = useEnter(22, 200)
  const cta = useEnter(36, 200)
  return (
    <Cream>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <Img src={staticFile('brand/icon.png')} style={{ width: 120, height: 120, borderRadius: 36, background: '#fff', padding: 12, border: `1px solid ${BA.line}`,
            boxShadow: '0 20px 50px rgba(60,40,30,0.14)', scale: String(interpolate(mark, [0, 1], [0.5, 1])), opacity: Math.min(1, mark * 1.5) }} />
          <div style={{ fontFamily: display, fontWeight: 500, fontSize: 112, color: BA.ink, letterSpacing: '-0.01em', opacity: word, translate: `${interpolate(word, [0, 1], [-30, 0])}px 0` }}>
            Business <em style={{ color: BA.roseDeep }}>Agent</em>
          </div>
        </div>
        <div style={{ fontFamily: display, fontSize: 54, lineHeight: 1.2, color: BA.ink, marginTop: 38, textAlign: 'center', opacity: tag, translate: `0 ${interpolate(tag, [0, 1], [20, 0])}px` }}>
          Your entire business in one place.<br /><em style={{ color: BA.roseDeep }}>Less admin, more enjoyment.</em>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 56, opacity: cta, translate: `0 ${interpolate(cta, [0, 1], [20, 0])}px` }}>
          <div style={{ padding: '20px 44px', borderRadius: 999, background: BA.ink, color: BA.bg, fontFamily: text, fontWeight: 600, fontSize: 34 }}>Start free</div>
          <div style={{ fontFamily: text, fontWeight: 500, fontSize: 34, color: BA.ink }}>businesssagent.com</div>
        </div>
      </AbsoluteFill>
      <Sfx name="chime" at={4} volume={0.3} />
    </Cream>
  )
}
