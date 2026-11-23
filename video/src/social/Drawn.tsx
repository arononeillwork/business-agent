// The "Instagram and TikTok never get posted" video's drawn scenes: the title; the café's profile on a phone, its
// last post six weeks ago, and "post on Insta" crossed off a to-do list week after week; and at the end six o'clock,
// the post out on Instagram and on TikTok, with what the owner gets. The phones are drawn (not either app), with the
// networks' marks and the post's own photo and caption.
import type { ReactNode } from 'react'
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { siInstagram, siTiktok } from 'simple-icons'
import { Caption, Cream, Em, Logo, Phone, Sfx, Tick, useEnter } from '../kit'
import { BA, display, hand, text } from '../theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
/** The photo Julio took (drawn by video/capture/socialPhotos.mjs). */
export const PHOTO = 'stills/social/coffees-bags.jpg'
const CAPTION = 'The coffees we have now: Ethiopia, Brazil and a decaf Colombia. Which one’s yours? ☕'

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
          opacity: eyebrow, translate: `0 ${interpolate(eyebrow, [0, 1], [14, 0])}px`, marginBottom: 26 }}>Easy Beans Coffee · Instagram & TikTok</div>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: 132, lineHeight: 1.06, letterSpacing: '-0.02em', textAlign: 'center' }}>
          <div><Word at={10}>From</Word><Word at={14}>an</Word><Word at={18}>idea</Word></div>
          <div><Word at={30} italic>to</Word><Word at={34} italic>a</Word><Word at={38} italic>scheduled</Word><Word at={42} italic>post.</Word></div>
        </div>
      </AbsoluteFill>
      <Sfx name="pop" at={30} volume={0.22} />
    </Cream>
  )
}

/** The café's profile on a phone: its name, and a grid of old posts, the newest six weeks ago. */
function Profile({ at }: { at: number }) {
  const frame = useCurrentFrame()
  const tones = ['#E6D3BE', '#D9C3E2', '#CFE0C4', '#F1D6C8', '#E3D9CC', '#D6E2EA', '#EADCC3', '#E9CFD7', '#D2DCCB']
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#fff', fontFamily: text, color: BA.ink }}>
      <div style={{ height: 44, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 26px 6px', fontSize: 15, fontWeight: 600 }}>
        <span>18:00</span><Logo icon={siInstagram} size={18} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 20px 12px' }}>
        <Img src={staticFile('brand/icon.png')} style={{ width: 72, height: 72, borderRadius: 36, border: `1px solid ${BA.line}`, background: '#fff' }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>easy.beans.coffee</div>
          <div style={{ fontSize: 14, color: BA.faint, marginTop: 3 }}>Specialty coffee · San Pedro de Alcántara</div>
        </div>
      </div>
      <div style={{ margin: '6px 20px 14px', padding: '10px 14px', borderRadius: 12, background: BA.roseSoft, color: BA.roseDeep, fontSize: 15, fontWeight: 600,
        opacity: interpolate(frame, [at + 30, at + 42], [0, 1], clamp) }}>Last post: 6 weeks ago</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
        {tones.map((c, i) => (
          <div key={i} style={{ aspectRatio: '1', background: c, opacity: 0.85, display: 'grid', placeItems: 'center' }}>
            <svg width="44" height="44" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#fff" opacity="0.7" /><circle cx="12" cy="12" r="5" fill="#8E6A4F" opacity="0.55" /></svg>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The owner's to-do list: "post on Insta", week after week, crossed off and moved on. */
function Todo({ at }: { at: number }) {
  const frame = useCurrentFrame()
  const p = useEnter(at - 10, 200)
  const weeks = ['Mon: post on Insta', 'Next Mon: post on Insta!', 'Mon: POST on Insta!!', 'TikTok too??']
  return (
    <div style={{ width: 520, padding: '36px 40px 44px', background: '#FFF3B8', boxShadow: '0 24px 50px rgba(60,40,30,0.20)', rotate: '-2deg',
      opacity: p, translate: `0 ${interpolate(p, [0, 1], [40, 0])}px`, fontFamily: hand, fontSize: 46, lineHeight: 1.2, color: BA.ink }}>
      {weeks.map((w, i) => {
        const shown = Math.round(interpolate(frame, [at + i * 34, at + i * 34 + w.length * 0.8], [0, w.length], clamp))
        // Each crossed off before the next one's written, but the last.
        const strike = i < weeks.length - 1 ? interpolate(frame, [at + i * 34 + 22, at + i * 34 + 30], [0, 1], clamp) : 0
        return (
          <div key={i} style={{ position: 'relative', marginTop: 12, minHeight: 55, color: i === weeks.length - 1 ? BA.roseDeep : BA.ink, fontWeight: i === weeks.length - 1 ? 700 : 500 }}>
            {w.slice(0, shown)}
            <div style={{ position: 'absolute', left: -4, top: '52%', height: 4, width: `${strike * 100}%`, background: BA.ink, borderRadius: 2, rotate: '-1deg' }} />
          </div>
        )
      })}
    </div>
  )
}

export function Problem({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const phone = useEnter(6, 200)
  const second = 180
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Sequence durationInFrames={second} layout="none"><Caption title={<>“We should post.” <Em>Six weeks ago.</Em></>} at={4} out={second} width={1400} size={64} /></Sequence>
        <Sequence from={second} layout="none"><Caption title={<>No time. <Em>No ideas. No photos.</Em></>} width={1400} size={64} /></Sequence>
        <div style={{ position: 'absolute', left: 420, top: 190, opacity: phone, translate: `0 ${interpolate(phone, [0, 1], [70, 0])}px` }}>
          <Phone width={380}><Profile at={10} /></Phone>
        </div>
        <div style={{ position: 'absolute', left: 1000, top: 300 }}><Todo at={50} /></div>
      </AbsoluteFill>
      <Sfx name="buzz" at={44} volume={0.14} />
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}

/** The post as it shows on one network: the account, the photo, the caption, the network's mark. */
function Posted({ icon, name, at, tall }: { icon: typeof siInstagram; name: string; at: number; tall?: boolean }) {
  const p = useEnter(at, 14)
  return (
    <div style={{ position: 'absolute', inset: 0, background: tall ? '#111' : '#fff', fontFamily: text, color: tall ? '#fff' : BA.ink }}>
      <div style={{ height: 44, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 24px 6px', fontSize: 14, fontWeight: 600 }}>
        <span>18:00</span><Logo icon={icon} size={18} color={tall ? '#fff' : undefined} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
        <Img src={staticFile('brand/icon.png')} style={{ width: 34, height: 34, borderRadius: 17, background: '#fff' }} />
        <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
        <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.6 }}>Just now</div>
      </div>
      <div style={{ position: 'relative', overflow: 'hidden', height: tall ? 470 : 340, opacity: Math.min(1, p * 1.4) }}>
        <Img src={staticFile(PHOTO)} style={{ width: '100%', height: '100%', objectFit: 'cover', scale: String(interpolate(p, [0, 1], [1.08, 1])) }} />
      </div>
      <div style={{ padding: '12px 16px', fontSize: 13.5, lineHeight: 1.42, opacity: interpolate(p, [0.4, 1], [0, 1], clamp) }}>
        <b>{name}</b> {CAPTION}
      </div>
    </div>
  )
}

function Point({ at, children }: { at: number; children: ReactNode }) {
  const p = useEnter(at, 200)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontFamily: text, fontSize: 29, lineHeight: 1.3, color: BA.ink, opacity: p,
      translate: `${interpolate(p, [0, 1], [40, 0])}px 0` }}>
      <Tick at={at + 4} label="" size={22} /><span>{children}</span>
    </div>
  )
}

export function Recap({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const a = useEnter(4, 200)
  const b = useEnter(14, 200)
  const line = useEnter(130, 200)
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>Six o’clock. <Em>It posts itself.</Em></>} at={0} width={1400} size={64} />
        <div style={{ position: 'absolute', left: 305, top: 200, opacity: a, translate: `0 ${interpolate(a, [0, 1], [70, 0])}px` }}>
          <Phone width={330}><Posted icon={siInstagram} name="easy.beans.coffee" at={20} /></Phone>
        </div>
        <div style={{ position: 'absolute', left: 665, top: 250, opacity: b, translate: `0 ${interpolate(b, [0, 1], [70, 0])}px` }}>
          <Phone width={330}><Posted icon={siTiktok} name="easybeanscoffee" at={30} tall /></Phone>
        </div>
        <div style={{ position: 'absolute', left: 1080, top: 340, width: 540, display: 'flex', flexDirection: 'column', gap: 30 }}>
          <Point at={50}>Ideas the whole team can see</Point>
          <Point at={68}>Photos from any phone, handed in</Point>
          <Point at={86}>One press, every account</Point>
          <div style={{ fontFamily: text, fontSize: 27, lineHeight: 1.5, color: BA.soft, marginTop: 8, opacity: line }}>
            A café that’s always posting, without the owner writing every caption.
          </div>
        </div>
      </AbsoluteFill>
      <Sfx name="ping" at={22} volume={0.2} />
      <Sfx name="ping" at={32} volume={0.16} />
      {[50, 68, 86].map(f => <Sfx key={f} name="pop" at={f + 4} volume={0.16} />)}
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}
