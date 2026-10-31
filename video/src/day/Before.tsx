// The day before Business Agent, drawn: 06:45 to 23:10, a list on the wall, the phone that never
// stops, calls about stock, a chalk sign, a pile of bills, the laptop at night, and the letter about
// the terrace licence nobody remembered.
import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { siGoogle, siInstagram, siWhatsapp } from 'simple-icons'
import { Logo, Phone, Sfx, easeOut, useEnter } from '../kit'
import { BA, display, hand, text } from '../theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** The dark, tired room every "before" moment happens in: the time top left, a line at the bottom. */
export function Night({ time, line, children, warm = 0 }: { time: string; line: ReactNode; children: ReactNode; warm?: number }) {
  const frame = useCurrentFrame()
  const a = useEnter(2, 200)
  const b = useEnter(10, 200)
  const out = interpolate(frame, [110, 120], [1, 0], clamp)
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1500px 900px at 50% 10%, ${warm ? '#3A2E27' : '#2E2520'}, ${BA.night} 72%)` }}>
      <AbsoluteFill style={{ opacity: out }}>
        <div style={{ position: 'absolute', left: 110, top: 70, fontFamily: display, fontSize: 76, color: '#fff', letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums', opacity: a, translate: `0 ${interpolate(a, [0, 1], [-14, 0])}px` }}>{time}</div>
        {children}
        <div style={{ position: 'absolute', left: 110, right: 110, bottom: 84, fontFamily: display, fontWeight: 500, fontSize: 60, lineHeight: 1.12,
          color: '#fff', opacity: b, translate: `0 ${interpolate(b, [0, 1], [18, 0])}px` }}>{line}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

const Rose = ({ children }: { children: ReactNode }) => <em style={{ fontStyle: 'italic', color: BA.rose }}>{children}</em>

/** Something arriving: drops in and settles at `at` frames. */
function Pop({ at, children, style, from = 30 }: { at: number; children: ReactNode; style?: CSSProperties; from?: number }) {
  const p = useEnter(at, 14)
  return <div style={{ position: 'absolute', opacity: Math.min(1, p * 1.4), translate: `0 ${interpolate(p, [0, 1], [from, 0])}px`, scale: String(interpolate(p, [0, 1], [0.92, 1])), ...style }}>{children}</div>
}

/** A notification on a phone's lock screen. */
function Note({ icon, app, msg }: { icon: ReactNode; app: string; msg: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 18, background: 'rgba(250,247,243,0.92)', fontFamily: text, width: 330 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 17, color: BA.ink }}>{app}</div>
        <div style={{ fontSize: 16, color: BA.soft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg}</div>
      </div>
    </div>
  )
}
const Bell = () => <svg width={24} height={24} viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" fill="none" stroke={BA.roseDeep} strokeWidth={1.8} strokeLinejoin="round" /></svg>
const Mail = () => <svg width={24} height={24} viewBox="0 0 24 24"><path d="M3 6h18v12H3zM3 7l9 6 9-6" fill="none" stroke={BA.lilacDeep} strokeWidth={1.8} strokeLinejoin="round" /></svg>

/** A lock screen: the time and notifications stacking up. */
function LockScreen({ time, notes, every = 10, start = 14 }: { time: string; notes: [ReactNode, string, string][]; every?: number; start?: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #3B302A, #1D1714)' }}>
      <div style={{ position: 'absolute', top: 90, left: 0, right: 0, textAlign: 'center', fontFamily: text, fontWeight: 300, fontSize: 96, color: '#fff' }}>{time}</div>
      <div style={{ position: 'absolute', top: 220, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        {notes.map(([icon, app, msg], i) => (
          <Pop key={i} at={start + i * every} from={-24} style={{ position: 'relative' }}><Note icon={icon} app={app} msg={msg} /></Pop>
        ))}
      </div>
    </div>
  )
}

/** A paper checklist on a clipboard, ticked off in a hurry; `missed` items stay empty. */
function Clipboard({ title, items, missed = [], start = 18, every = 12 }: { title: string; items: string[]; missed?: number[]; start?: number; every?: number }) {
  const frame = useCurrentFrame()
  return (
    <div style={{ position: 'absolute', left: 960 - 280, top: 170, width: 560, rotate: '-2deg' }}>
      <div style={{ position: 'absolute', left: 200, top: -22, width: 160, height: 46, borderRadius: 10, background: '#8A8178', boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.2)', zIndex: 2 }} />
      <div style={{ background: '#B08B5B', borderRadius: 24, padding: 22, boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ background: '#FBF7EE', borderRadius: 6, padding: '44px 40px 40px', fontFamily: hand, color: '#2B2522', minHeight: 560 }}>
          <div style={{ fontWeight: 700, fontSize: 56, lineHeight: 1 }}>{title}</div>
          {items.map((it, i) => {
            const at = start + i * every
            const ticked = !missed.includes(i) && frame >= at
            return (
              <div key={it} style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 42, fontWeight: 500, marginTop: 20 }}>
                <span style={{ position: 'relative', width: 32, height: 32, border: '3px solid #2B2522', borderRadius: 5, flexShrink: 0 }}>
                  {ticked && <svg style={{ position: 'absolute', left: -6, top: -14 }} width={48} height={48} viewBox="0 0 48 48">
                    <path d="M8 26 L19 37 L42 6" fill="none" stroke="#C2410C" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round"
                      strokeDasharray={60} strokeDashoffset={interpolate(frame, [at, at + 5], [60, 0], clamp)} /></svg>}
                </span>
                <span style={{ textDecoration: ticked ? 'line-through' : 'none', textDecorationColor: 'rgba(43,37,34,0.5)' }}>{it}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function TitleCard() {
  const frame = useCurrentFrame()
  const a = useEnter(6, 200)
  const b = useEnter(22, 200)
  const out = interpolate(frame, [108, 120], [1, 0], clamp)
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1400px 800px at 50% 0%, #2E2520, ${BA.night} 70%)`, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', opacity: out }}>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: 110, lineHeight: 1.05, color: '#fff', letterSpacing: '-0.02em', opacity: a, translate: `0 ${interpolate(a, [0, 1], [24, 0])}px` }}>
          A day in the life<br />of a café owner.
        </div>
        <div style={{ fontFamily: display, fontSize: 56, color: BA.rose, fontStyle: 'italic', marginTop: 30, opacity: b }}>Before Business Agent.</div>
      </div>
    </AbsoluteFill>
  )
}

export function Alarm() {
  const frame = useCurrentFrame()
  const shake = frame < 40 ? Math.sin(frame * 2.2) * 5 : 0
  return (
    <Night time="06:45" line={<>The phone’s <Rose>already busy.</Rose></>}>
      <div style={{ position: 'absolute', left: 960 - 200, top: 150, rotate: `${shake * 0.4}deg`, translate: `${shake}px 0` }}>
        <Phone width={400}>
          <LockScreen time="06:45" notes={[
            [<Bell key="b" />, 'Alarm', 'Open the café'],
            [<Logo key="w" icon={siWhatsapp} size={24} />, 'WhatsApp', 'Maria: can’t open on Sunday, sorry'],
            [<Mail key="m" />, 'Email', 'Invoice overdue: Tostadores del Sur'],
            [<Logo key="g" icon={siGoogle} size={24} />, 'Google', 'Check your hours for the holidays'],
            [<Logo key="i" icon={siInstagram} size={24} />, 'Instagram', '12 new messages'],
          ]} />
        </Phone>
      </div>
      <Sfx name="alarm" at={2} volume={0.25} />
      {[14, 24, 34, 44, 54].map(f => <Sfx key={f} name="vibrate" at={f} volume={0.18} />)}
    </Night>
  )
}

export function Opening() {
  return (
    <Night time="07:00" line={<>Opening, from <Rose>a list on the wall.</Rose></>}>
      <Clipboard title="Opening" items={['Unlock, lights, terrace', 'Machine on', 'Fridge temps → log book', 'Count the float', 'Music?']} missed={[4]} />
    </Night>
  )
}

export function Serving() {
  const frame = useCurrentFrame()
  const unread = Math.min(9, Math.max(0, Math.floor((frame - 10) / 8)))
  const buzz = frame % 24 < 6 && frame < 90 ? Math.sin(frame * 3) * 4 : 0
  return (
    <Night time="09:00" line={<>Serving. <Rose>Nine messages waiting.</Rose></>}>
      {/* The order ticket on the counter… */}
      <div style={{ position: 'absolute', left: 430, top: 230, width: 420, rotate: '-3deg', background: '#FBF7EE', padding: '28px 34px', boxShadow: '0 24px 50px rgba(0,0,0,0.45)', fontFamily: hand, color: '#2B2522' }}>
        <div style={{ fontWeight: 700, fontSize: 44 }}>Table 4</div>
        {['2 × flat white, oat', '1 × croissant', '1 × matcha latte, iced', '1 × açaí bowl'].map(l => <div key={l} style={{ fontSize: 36, marginTop: 8 }}>{l}</div>)}
      </div>
      {/* …and the phone beside it that won't stop. */}
      <div style={{ position: 'absolute', left: 1020, top: 170, translate: `${buzz}px 0`, rotate: '4deg' }}>
        <Phone width={360}>
          <div style={{ position: 'absolute', inset: 0, background: '#F4EFEA', fontFamily: text }}>
            <div style={{ padding: '70px 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 26, color: BA.ink }}>Chats</span>
              <span style={{ minWidth: 34, height: 34, borderRadius: 17, background: '#E0245E', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 18, padding: '0 8px' }}>{unread}</span>
            </div>
            {[['Lucía', 'Do you have oat milk?'], ['Sofía', 'Are you open on the 24th?'], ['San Pedro Eats', 'Tagged you in a story'], ['Tom', 'Is the matcha iced or hot?'], ['Marta', 'Can you do a birthday cake?'], ['Julio', 'Can I swap Saturday?']].map(([n, m], i) => (
              <Pop key={n} at={10 + i * 12} from={-16} style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 12, padding: '12px 20px', borderTop: '1px solid #E8E1DA' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 22, background: BA.lilacSoft, flexShrink: 0 }} />
                  <div><div style={{ fontWeight: 600, fontSize: 18, color: BA.ink }}>{n}</div><div style={{ fontSize: 16, color: BA.soft }}>{m}</div></div>
                </div>
              </Pop>
            ))}
          </div>
        </Phone>
      </div>
      {[10, 34, 58, 82].map(f => <Sfx key={f} name="vibrate" at={f} volume={0.16} />)}
    </Night>
  )
}

export function Call() {
  const frame = useCurrentFrame()
  const answered = frame >= 46
  return (
    <Night time="10:30" line={<>Calls about stock, <Rose>mid-rush.</Rose></>}>
      <div style={{ position: 'absolute', left: 960 - 190, top: 150 }}>
        <Phone width={380}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #2E3B33, #141A16)', fontFamily: text, color: '#fff', textAlign: 'center' }}>
            <div style={{ marginTop: 150, fontSize: 22, opacity: 0.7 }}>{answered ? '00:4' + Math.min(9, Math.floor((frame - 46) / 6)) : 'Incoming call'}</div>
            <div style={{ fontSize: 40, fontWeight: 600, marginTop: 10 }}>Eric · Bakery</div>
            {!answered && <div style={{ position: 'absolute', bottom: 110, left: 0, right: 0, display: 'flex', justifyContent: 'space-around' }}>
              <div style={{ width: 80, height: 80, borderRadius: 40, background: '#E5484D' }} />
              <div style={{ width: 80, height: 80, borderRadius: 40, background: '#30A46C', scale: String(1 + 0.08 * Math.sin(frame / 3)) }} />
            </div>}
          </div>
        </Phone>
      </div>
      {answered && (
        <Pop at={50} style={{ left: 1210, top: 300, width: 520 }}>
          <div style={{ background: '#fff', borderRadius: '28px 28px 28px 6px', padding: '26px 30px', fontFamily: display, fontSize: 44, lineHeight: 1.15, color: BA.ink, boxShadow: '0 24px 50px rgba(0,0,0,0.45)' }}>
            “No pain au chocolat till Friday. Want croissants instead?”
          </div>
        </Pop>
      )}
      <Sfx name="ring" at={4} volume={0.2} />
    </Night>
  )
}

export function Chalkboard() {
  const frame = useCurrentFrame()
  const lines = ['Croissants', '2 for €3', 'today only!']
  const chars = Math.floor(interpolate(frame, [10, 70], [0, lines.join('').length], clamp))
  let left = chars
  return (
    <Night time="12:00" line={<>Croissants left over. <Rose>Chalk a sign, post it… later.</Rose></>}>
      <div style={{ position: 'absolute', left: 960 - 330, top: 160, width: 660, height: 600 }}>
        <div style={{ position: 'absolute', inset: 0, background: '#8B6A45', borderRadius: 18, padding: 22, boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }}>
          <div style={{ width: '100%', height: '100%', background: '#2F3A33', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: hand, color: '#F4F1EA' }}>
            {lines.map((l, i) => {
              const show = l.slice(0, Math.max(0, left)); left -= l.length
              return <div key={i} style={{ fontSize: i === 1 ? 120 : 76, fontWeight: 700, lineHeight: 1.1, minHeight: i === 1 ? 132 : 84 }}>{show}</div>
            })}
          </div>
        </div>
        <Pop at={78} style={{ right: -210, top: 30, rotate: '6deg' }}>
          <div style={{ width: 230, padding: '18px 20px', background: '#FFF1BF', fontFamily: hand, fontSize: 34, color: '#2B2522', boxShadow: '0 16px 30px rgba(0,0,0,0.4)' }}>Post it on Instagram!!</div>
        </Pop>
      </div>
    </Night>
  )
}

export function Bills() {
  const frame = useCurrentFrame()
  const stamp = useEnter(52, 9)
  const papers = [['Tostadores del Sur', '€320,00', -9, -10], ['By Eric', '€600,00', 6, 30], ['Lácteos Costa del Sol', '€200,00', -3, 70], ['Endesa', '€184,60', 9, 110]] as const
  return (
    <Night time="14:00" line={<>Bills, receipts, <Rose>the tax return.</Rose></>}>
      <div style={{ position: 'absolute', left: 520, top: 170 }}>
        {papers.map(([who, amount, r, dy], i) => (
          <Pop key={who} at={6 + i * 8} style={{ left: i * 40, top: dy, rotate: `${r}deg` }}>
            <div style={{ width: 420, height: 520, background: '#FDFCF8', boxShadow: '0 20px 40px rgba(0,0,0,0.45)', padding: '36px 34px', fontFamily: text, color: BA.ink }}>
              <div style={{ fontWeight: 700, fontSize: 30 }}>INVOICE</div>
              <div style={{ fontSize: 22, color: BA.soft, marginTop: 8 }}>{who}</div>
              {[0, 1, 2, 3, 4].map(k => <div key={k} style={{ height: 10, background: '#ECE6DF', borderRadius: 5, marginTop: 22, width: `${90 - k * 9}%` }} />)}
              <div style={{ marginTop: 40, fontSize: 34, fontWeight: 700, textAlign: 'right' }}>{amount}</div>
            </div>
          </Pop>
        ))}
        <div style={{ position: 'absolute', left: 150, top: 230, rotate: '-14deg', opacity: Math.min(1, stamp * 1.5), scale: String(interpolate(stamp, [0, 1], [1.8, 1])),
          border: '8px solid #D7263D', color: '#D7263D', fontFamily: text, fontWeight: 800, fontSize: 76, padding: '4px 22px', borderRadius: 12, letterSpacing: '0.06em' }}>OVERDUE</div>
      </div>
      <Pop at={30} style={{ left: 1260, top: 420, rotate: '3deg' }}>
        <div style={{ width: 380, height: 250, background: '#C9A36B', borderRadius: 10, boxShadow: '0 24px 50px rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center' }}>
          <div style={{ background: '#FBF7EE', padding: '12px 22px', fontFamily: hand, fontSize: 40, color: '#2B2522', rotate: '-3deg' }}>Receipts Q4 (tax!)</div>
        </div>
      </Pop>
      {frame >= 0 && <Sfx name="stamp" at={52} volume={0.35} />}
    </Night>
  )
}

export function Closing() {
  return (
    <Night time="15:00" line={<>Close up. <Rose>Then the real work.</Rose></>}>
      <Clipboard title="Closing" items={['Clean the machine', 'Cash up', 'Fridges, pastries', 'Lock up']} start={14} every={14} />
    </Night>
  )
}

export function LateNight() {
  const frame = useCurrentFrame()
  const typed = Math.floor(interpolate(frame, [10, 90], [0, 38], clamp))
  const caption = 'Christmas hours! 24–26 Dec closed 🎄'.slice(0, typed)
  return (
    <Night time="21:30" warm={1} line={<>Still posting. <Rose>Still filing.</Rose></>}>
      <div style={{ position: 'absolute', left: 960 - 560, top: 150, width: 1120 }}>
        <div style={{ background: '#1A1A1C', borderRadius: '26px 26px 8px 8px', padding: 18, boxShadow: '0 0 120px rgba(160,190,255,0.12), 0 30px 60px rgba(0,0,0,0.5)' }}>
          <div style={{ height: 560, borderRadius: 10, background: '#F3F1EE', display: 'flex', gap: 14, padding: 14, fontFamily: text }}>
            <div style={{ flex: 1.15, background: '#fff', borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 18, color: '#1D6F42' }}>VAT Q4.xlsx</div>
              {Array.from({ length: 11 }, (_, r) => (
                <div key={r} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', borderBottom: '1px solid #E6E6E6' }}>
                  {[0, 1, 2].map(c => <div key={c} style={{ height: 38, borderRight: '1px solid #E6E6E6', fontSize: 15, padding: '9px 6px', color: '#333' }}>
                    {r > 0 && r < 8 ? (c === 0 ? ['Makro', 'Endesa', 'By Eric', 'Lácteos', 'Tostadores', 'Rent', 'Glovo fees'][r - 1] : c === 1 ? `€${(97 + r * 53).toFixed(2)}` : r === 7 && frame % 30 < 15 ? '|' : '') : r === 0 ? ['Supplier', 'Net', 'IVA'][c] : ''}
                  </div>)}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 18 }}><Logo icon={siInstagram} size={24} /> New post</div>
              <div style={{ marginTop: 14, height: 240, borderRadius: 8, background: 'linear-gradient(135deg, #F2D6C9, #E9C2B4)' }} />
              <div style={{ marginTop: 14, minHeight: 80, border: '1.5px solid #DADADA', borderRadius: 8, padding: 12, fontSize: 18, color: '#222' }}>{caption}<span style={{ opacity: frame % 20 < 10 ? 1 : 0 }}>|</span></div>
              <div style={{ marginTop: 12, fontSize: 16, color: '#8A8A8A' }}>Schedule for: 08:00 tomorrow</div>
            </div>
          </div>
        </div>
        <div style={{ height: 22, margin: '0 -50px', background: 'linear-gradient(#C9C6C2, #8F8B87)', borderRadius: '0 0 30px 30px' }} />
      </div>
      <div style={{ position: 'absolute', left: 1600, top: 640, width: 110, height: 120, borderRadius: '0 0 30px 30px', background: '#F4EFEA', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }} />
    </Night>
  )
}

export function Letter() {
  const frame = useCurrentFrame()
  const open = interpolate(frame, [6, 30], [0, 1], { ...clamp, easing: easeOut })
  return (
    <Night time="23:10" line={<>And something <Rose>always slips.</Rose></>}>
      <div style={{ position: 'absolute', left: 960 - 360, top: interpolate(open, [0, 1], [260, 140]), width: 720, rotate: '-1.5deg' }}>
        <div style={{ background: '#FDFCF8', padding: '46px 54px 50px', boxShadow: '0 40px 80px rgba(0,0,0,0.55)', fontFamily: text, color: BA.ink, opacity: open }}>
          <div style={{ fontWeight: 700, fontSize: 24, letterSpacing: '0.08em' }}>AYUNTAMIENTO DE MARBELLA</div>
          <div style={{ fontSize: 20, color: BA.soft, marginTop: 4 }}>Licencias · Ocupación de vía pública</div>
          <div style={{ height: 2, background: '#E7E1DA', margin: '22px 0' }} />
          <div style={{ fontFamily: display, fontSize: 46, lineHeight: 1.2 }}>Your terrace licence <span style={{ color: '#C62828' }}>has expired.</span></div>
          <div style={{ fontSize: 26, lineHeight: 1.5, marginTop: 18, color: BA.soft }}>The tables and chairs must come off the street until it is renewed.</div>
        </div>
      </div>
      <Sfx name="buzz" at={30} volume={0.22} />
    </Night>
  )
}
