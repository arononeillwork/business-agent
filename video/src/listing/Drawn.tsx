// The Google reviews & opening hours video's drawn scenes: the title; Sunday at half past three, the café's Google
// Maps listing on a phone saying it's open until four while the door says closed, and a two-star review that's
// had no reply; and at the end the same listing, right: closes at three on Sundays, the review answered. Drawn as
// the other videos' Google Maps cards are (not a picture of Google's app), with the demo's reviews.
import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { siGooglemaps } from 'simple-icons'
import { Caption, Card, Cream, Em, Logo, Phone, Sfx, Tick, useEnter } from '../kit'
import { Mark, Ring } from '../places'
import { BA, display, text } from '../theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

function Word({ children, at, italic }: { children: string; at: number; italic?: boolean }) {
  const p = useEnter(at, 16)
  return (
    <span style={{ display: 'inline-block', opacity: Math.min(1, p * 1.3), translate: `0 ${interpolate(p, [0, 1], [40, 0])}px`,
      fontStyle: italic ? 'italic' : 'normal', color: italic ? BA.roseDeep : BA.ink, marginRight: '0.24em' }}>{children}</span>
  )
}

export function Title() {
  const frame = useCurrentFrame()
  const eyebrow = useEnter(4, 200)
  const out = interpolate(frame, [108, 120], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out }}>
        <div style={{ fontFamily: text, fontWeight: 600, fontSize: 28, letterSpacing: '0.16em', textTransform: 'uppercase', color: BA.roseDeep,
          opacity: eyebrow, translate: `0 ${interpolate(eyebrow, [0, 1], [14, 0])}px`, marginBottom: 26 }}>Easy Beans Coffee · Google reviews & opening hours</div>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: 132, lineHeight: 1.06, letterSpacing: '-0.02em', textAlign: 'center' }}>
          <div><Word at={10}>Right</Word><Word at={14}>on</Word><Word at={18}>Google.</Word></div>
          <div><Word at={30} italic>Every</Word><Word at={34} italic>time.</Word></div>
        </div>
      </AbsoluteFill>
      <Sfx name="pop" at={30} volume={0.22} />
    </Cream>
  )
}

const Stars = ({ n, size = 16 }: { n: number; size?: number }) => (
  <span style={{ fontSize: size, letterSpacing: 1 }}><span style={{ color: '#F4B400' }}>{'★'.repeat(n)}</span><span style={{ color: '#DADCE0' }}>{'★'.repeat(5 - n)}</span></span>
)

/** The café's Google Maps listing on a phone, on a Sunday afternoon: wrong (open till four, as the hours were before, a review with no reply) or right. */
function Listing({ right, at = 0 }: { right: boolean; at?: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#fff', fontFamily: text, color: BA.ink }}>
      <div style={{ height: 44, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 26px 6px', fontSize: 15, fontWeight: 600 }}>
        <span>15:30</span><span style={{ fontSize: 13 }}>Sun</span>
      </div>
      {/* The map, with the café's pin. */}
      <div style={{ position: 'relative', height: 170, background: 'linear-gradient(135deg, #E8F0E3, #EEF1F4 60%, #E4ECF5)', overflow: 'hidden' }}>
        {[[0, 60, 400, 14], [120, 0, 12, 200], [250, 0, 10, 200], [0, 120, 400, 9]].map(([x, y, w, h], i) => (
          <div key={i} style={{ position: 'absolute', left: x, top: y, width: w, height: h, background: '#fff', opacity: 0.9 }} />
        ))}
        <div style={{ position: 'absolute', left: 175, top: 52 }}><Logo icon={siGooglemaps} size={46} /></div>
        <div style={{ position: 'absolute', left: 14, top: 12, right: 14, height: 40, borderRadius: 20, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 15, color: BA.soft }}>Easy Beans Coffee</div>
      </div>
      <div style={{ padding: '14px 20px 0' }}>
        <div style={{ fontWeight: 600, fontSize: 22 }}>Easy Beans Coffee</div>
        <div style={{ fontSize: 14, color: BA.faint, marginTop: 3 }}>4.3 <Stars n={4} size={13} /> (12) · Café</div>
        <div style={{ fontSize: 15, marginTop: 10 }}>
          {right
            ? <Mark at={at + 10}><span><b style={{ color: '#C5221F' }}>Closed</b> · Opens 08:00 Mon</span></Mark>
            : <span><b style={{ color: '#188038' }}>Open</b> · Closes 16:00</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: BA.soft, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BA.lineSoft}` }}>
          <span>Sunday</span><span style={{ fontWeight: 600, color: BA.ink }}>{right ? '09:00–15:00' : '09:00–16:00'}</span>
        </div>
      </div>
      <div style={{ padding: '14px 20px 0', marginTop: 12, borderTop: `6px solid ${BA.lineSoft}` }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Reviews</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 15, background: '#5C6BC0', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 14 }}>T</div>
          <div><div style={{ fontWeight: 600, fontSize: 14 }}>Tom Hughes</div><div style={{ fontSize: 12, color: BA.faint }}><Stars n={2} size={12} /> · 28 Sep</div></div>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.4, marginTop: 8 }}>Coffee was good but we waited 20 minutes for two flat whites on Saturday morning, and nobody said sorry.</div>
        {right
          ? (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, background: '#F1F3F4', fontSize: 12.5, lineHeight: 1.4 }}>
              <div style={{ fontWeight: 600 }}><Mark at={at + 20}>Response from the owner</Mark></div>
              <div style={{ color: BA.soft, marginTop: 3 }}>Hi Tom, we’re very sorry your visit wasn’t what you hoped for…</div>
            </div>
          )
          : <div style={{ marginTop: 10, fontSize: 12.5, color: BA.faint }}>No response from the owner</div>}
      </div>
    </div>
  )
}

/** The café's door on a Sunday afternoon: the sign turned to closed. */
function Door() {
  return (
    <svg width={330} height={420} viewBox="0 0 330 420">
      <rect x="20" y="10" width="290" height="400" rx="10" fill="#6E4B3A" />
      <rect x="44" y="34" width="242" height="190" rx="6" fill="#BFD4DD" />
      <rect x="44" y="34" width="242" height="190" rx="6" fill="url(#glass)" />
      <defs><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.45" /><stop offset="0.5" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
      <circle cx="270" cy="300" r="10" fill="#D9B26A" />
      <path d="M125 96 L165 70 L205 96" stroke="#3a2a22" strokeWidth="3" fill="none" />
      <rect x="95" y="96" width="140" height="62" rx="8" fill="#fff" stroke="#3a2a22" strokeWidth="3" />
      <text x="165" y="138" textAnchor="middle" fontFamily="Figtree, sans-serif" fontWeight="700" fontSize="30" fill="#C5221F">CLOSED</text>
    </svg>
  )
}

export function Problem({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const phone = useEnter(6, 200)
  const door = useEnter(30, 200)
  const second = 180
  const review = useEnter(second + 10, 200)
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  const doorOut = interpolate(frame, [second - 10, second], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Sequence durationInFrames={second} layout="none"><Caption title={<>Google says you’re open. <Em>You closed at three.</Em></>} at={4} out={second} width={1400} size={64} /></Sequence>
        <Sequence from={second} layout="none"><Caption title={<>And two stars, <Em>still waiting for a reply.</Em></>} width={1400} size={64} /></Sequence>
        <div style={{ position: 'absolute', left: 380, top: 200, opacity: phone, translate: `0 ${interpolate(phone, [0, 1], [70, 0])}px` }}>
          <div style={{ position: 'relative', width: 380, height: 820 }}>
            <Phone width={380}><Listing right={false} /></Phone>
            {/* What's wrong, ringed: open till four; then the review with no reply. */}
            {frame < second && <Ring at={44} x={26} y={290} w={196} h={32} />}
            {frame >= second && <Ring at={second + 6} x={22} y={392} w={336} h={168} />}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 980, top: 250, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, opacity: door * doorOut,
          translate: `0 ${interpolate(door, [0, 1], [50, 0])}px` }}>
          <Door />
          <div style={{ fontFamily: text, fontWeight: 600, fontSize: 30, color: BA.ink }}>Sunday, 15:30</div>
          <div style={{ fontFamily: text, fontSize: 26, color: BA.soft, maxWidth: 520, textAlign: 'center' }}>A customer walks over, because Google said so.</div>
        </div>
        {frame >= second - 6 && (
          <Card style={{ position: 'absolute', left: 900, top: 330, width: 680, padding: '30px 36px', boxSizing: 'border-box', fontFamily: text, opacity: review,
            translate: `0 ${interpolate(review, [0, 1], [50, 0])}px` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 24, background: '#5C6BC0', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 22 }}>T</div>
              <div><div style={{ fontWeight: 600, fontSize: 26, color: BA.ink }}>Tom Hughes</div><div style={{ fontSize: 20, color: BA.faint }}><Stars n={2} size={20} /> · 28 Sep</div></div>
              <span style={{ marginLeft: 'auto', padding: '6px 16px', borderRadius: 999, background: BA.roseSoft, color: BA.roseDeep, fontWeight: 600, fontSize: 20 }}>No reply yet</span>
            </div>
            <div style={{ fontSize: 25, lineHeight: 1.45, color: BA.ink, marginTop: 16 }}>Coffee was good but we waited 20 minutes for two flat whites on Saturday morning, and nobody said sorry.</div>
            <div style={{ fontSize: 22, color: BA.soft, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${BA.lineSoft}` }}>Seen by everyone who looks the café up.</div>
          </Card>
        )}
      </AbsoluteFill>
      <Sfx name="buzz" at={44} volume={0.18} />
      <Sfx name="whoosh" at={second - 8} volume={0.18} />
      <Sfx name="pop" at={second + 12} volume={0.2} />
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}

function Point({ at, children }: { at: number; children: ReactNode }) {
  const p = useEnter(at, 200)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontFamily: text, fontSize: 32, color: BA.ink, opacity: p, translate: `${interpolate(p, [0, 1], [40, 0])}px 0` }}>
      <Tick at={at + 4} label="" size={22} />{children}
    </div>
  )
}

export function Recap({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const phone = useEnter(6, 200)
  const line = useEnter(110, 200)
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>Open when Google says. <Em>Answered when it matters.</Em></>} at={0} width={1400} size={64} />
        <div style={{ position: 'absolute', left: 380, top: 200, opacity: phone, translate: `0 ${interpolate(phone, [0, 1], [70, 0])}px` }}>
          <Phone width={380}><Listing right at={20} /></Phone>
        </div>
        <div style={{ position: 'absolute', left: 900, top: 330, display: 'flex', flexDirection: 'column', gap: 34 }}>
          <Point at={40}>Hours right on Google Maps and your site</Point>
          <Point at={58}>Every review answered, with a reply drafted for you</Point>
          <Point at={76}>Changed once, in one place</Point>
          <div style={{ fontFamily: text, fontSize: 28, lineHeight: 1.5, color: BA.soft, maxWidth: 720, marginTop: 10, opacity: line }}>
            People choosing where to go on their phone find a café that looks open, looked after and well reviewed.
          </div>
        </div>
      </AbsoluteFill>
      {[40, 58, 76].map(f => <Sfx key={f} name="pop" at={f + 4} volume={0.16} />)}
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}
