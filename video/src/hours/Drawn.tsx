// The "Adding up hours and tips" video's drawn scenes: the title; month end by hand (a paper timesheet, each day's
// hours added up and crossed out, and the tip jar with "÷ hours?" round it); and at the end Maria's phone with her
// share of the tips, as the app's bell words it (the share is the one the app worked out in the recording,
// video/capture/hours.mjs → hours-shares.json), with what the owner gets.
import type { ReactNode } from 'react'
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { Caption, Cream, Em, Phone, Sfx, Tick, useEnter } from '../kit'
import { BA, display, hand, text } from '../theme'
import shares from '../../public/clips/hours-shares.json'

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
          opacity: eyebrow, translate: `0 ${interpolate(eyebrow, [0, 1], [14, 0])}px`, marginBottom: 26 }}>Easy Beans Coffee · Hours & tips</div>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: 132, lineHeight: 1.06, letterSpacing: '-0.02em', textAlign: 'center' }}>
          <div><Word at={10}>Month</Word><Word at={14}>end</Word></div>
          <div><Word at={28} italic>without</Word><Word at={32} italic>the</Word><Word at={36} italic>spreadsheet.</Word></div>
        </div>
      </AbsoluteFill>
      <Sfx name="pop" at={30} volume={0.22} />
    </Cream>
  )
}

/** A line written by hand, a letter at a time from `at`; `strike` crosses it out at that frame. */
function Written({ children, at, strike, color = BA.ink, weight = 500 }: { children: string; at: number; strike?: number; color?: string; weight?: number }) {
  const frame = useCurrentFrame()
  const shown = Math.round(interpolate(frame, [at, at + children.length * 0.9], [0, children.length], clamp))
  const cross = strike === undefined ? 0 : interpolate(frame, [strike, strike + 8], [0, 1], clamp)
  return (
    <span style={{ position: 'relative', display: 'inline-block', color, fontWeight: weight, whiteSpace: 'pre' }}>
      {children.slice(0, shown)}
      <span style={{ position: 'absolute', left: -4, top: '54%', height: 4, width: `${cross * 104}%`, background: BA.ink, borderRadius: 2, rotate: '-2deg' }} />
    </span>
  )
}

/** The timesheet on paper: each person's days added up by hand, totals crossed out and tried again. */
function Timesheet({ at }: { at: number }) {
  const p = useEnter(at - 10, 200)
  const rows: [string, string, number][] = [
    ['Sam', '7¼  7½  7¼  7½  7¼', at + 20],
    ['Maria', '5  5  7½  5  5  6', at + 52],
    ['Cleaner', '2  2  2', at + 84],
  ]
  return (
    <div style={{ width: 660, padding: '34px 44px 40px', background: '#FFFDF6', rotate: '-2deg', boxShadow: '0 24px 50px rgba(60,40,30,0.20)',
      backgroundImage: 'repeating-linear-gradient(transparent 0 61px, #D8E3EE 61px 63px)', backgroundPositionY: 24,
      opacity: p, translate: `0 ${interpolate(p, [0, 1], [40, 0])}px`, fontFamily: hand, fontSize: 46, lineHeight: '63px', color: BA.ink }}>
      <div style={{ fontWeight: 700, color: BA.roseDeep }}><Written at={at} color={BA.roseDeep} weight={700}>Hours, November</Written></div>
      {rows.map(([who, days, from]) => (
        <div key={who} style={{ display: 'flex', gap: 22 }}>
          <span style={{ width: 150 }}><Written at={from}>{who}</Written></span>
          <Written at={from + 8}>{days}</Written>
          <Written at={from + 26} color={BA.roseDeep}>= ?</Written>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 22, marginTop: 4 }}>
        <Written at={at + 112} strike={at + 140} weight={700}>Total 101½</Written>
        <Written at={at + 150} strike={at + 176} weight={700}>102¼</Written>
        <Written at={at + 186} color={BA.roseDeep} weight={700}>101?</Written>
      </div>
    </div>
  )
}

/** The tip jar: coins and a note in it, and the sums written round it. */
function Jar({ at }: { at: number }) {
  const p = useEnter(at - 10, 200)
  const coins = [[118, 352, 26], [166, 360, 22], [214, 350, 26], [140, 318, 22], [192, 322, 24], [236, 318, 20], [168, 288, 20]]
  const notes: [string, number, number, number][] = [['€64,80 in the jar', 330, -30, at + 30], ['+ the card tips?', 380, 60, at + 70], ['÷ hours??', 420, 150, at + 110]]
  return (
    <div style={{ position: 'relative', width: 760, height: 520, opacity: p, translate: `0 ${interpolate(p, [0, 1], [40, 0])}px` }}>
      <svg width="340" height="460" viewBox="0 0 340 460" style={{ position: 'absolute', left: 0, top: 40 }}>
        <rect x="70" y="20" width="200" height="40" rx="10" fill="#C9B79C" />
        <path d="M80 60 h180 v30 c40 20 50 60 50 110 v190 c0 40 -30 60 -70 60 h-140 c-40 0 -70 -20 -70 -60 v-190 c0 -50 10 -90 50 -110 z" fill="#EEF5F7" stroke="#B9CCD3" strokeWidth="4" />
        <rect x="62" y="270" width="216" height="140" rx="20" fill="#E4D6BF" opacity="0.5" />
        <rect x="120" y="248" width="110" height="56" rx="6" fill="#B9D7B0" stroke="#7FA673" strokeWidth="3" transform="rotate(-14 175 276)" />
        {coins.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#E2B85C" stroke="#B98B2F" strokeWidth="3" />)}
        <rect x="100" y="150" width="140" height="64" rx="12" fill="#fff" stroke={BA.line} strokeWidth="3" />
        <text x="170" y="194" textAnchor="middle" fontFamily={display} fontSize="34" fontWeight="600" fill={BA.roseDeep}>TIPS</text>
      </svg>
      {notes.map(([s, x, y, from]) => (
        <div key={s} style={{ position: 'absolute', left: x, top: 120 + y, fontFamily: hand, fontSize: 50, rotate: '-3deg' }}>
          <Written at={from} color={s.startsWith('÷') ? BA.roseDeep : BA.ink} weight={700}>{s}</Written>
        </div>
      ))}
    </div>
  )
}

export function Problem({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const second = 180
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Sequence durationInFrames={second} layout="none"><Caption title={<>Month end. <Em>An evening gone.</Em></>} at={4} out={second} width={1400} size={64} /></Sequence>
        <Sequence from={second} layout="none"><Caption title={<>Whose hours? <Em>Whose tips?</Em></>} width={1400} size={64} /></Sequence>
        <div style={{ position: 'absolute', left: 230, top: 330, scale: '1.15', transformOrigin: 'top left' }}><Timesheet at={12} /></div>
        <div style={{ position: 'absolute', left: 980, top: 330, scale: '1.15', transformOrigin: 'top left' }}><Jar at={150} /></div>
      </AbsoluteFill>
      <Sfx name="key" at={30} volume={0.12} />
      <Sfx name="buzz" at={152} volume={0.12} />
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}

/** Maria's phone on Monday morning: the bell's notice of her share of last week's tips. */
function Notice({ at }: { at: number }) {
  const p = useEnter(at, 14)
  // The bell's words for a share (the `tips` migration): "Your tips: 105.05 €", and the week.
  const amount = `${(shares.maria ?? '').replace('€', '').replace(',', '.')} €`
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: text, color: BA.ink,
      background: `linear-gradient(170deg, ${BA.roseSoft} 0%, #F6EEF6 45%, ${BA.lilacSoft} 100%)` }}>
      <div style={{ textAlign: 'center', marginTop: 96 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: BA.soft }}>Monday 30 November</div>
        <div style={{ fontFamily: display, fontSize: 92, fontWeight: 500, lineHeight: 1.05 }}>09:42</div>
      </div>
      <div style={{ margin: '40px 14px 0', padding: '14px 16px', borderRadius: 22, background: 'rgba(255,255,255,0.92)',
        boxShadow: '0 12px 30px rgba(60,40,30,0.14)', opacity: Math.min(1, p * 1.4), translate: `0 ${interpolate(p, [0, 1], [-30, 0])}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: BA.faint }}>
          <Img src={staticFile('brand/icon.png')} style={{ width: 22, height: 22, borderRadius: 6, background: '#fff' }} />
          <span style={{ fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Easy Beans Coffee</span>
          <span style={{ marginLeft: 'auto' }}>now</span>
        </div>
        <div style={{ fontWeight: 700, fontSize: 23, marginTop: 8 }}>Your tips: {amount}</div>
        <div style={{ fontSize: 17, color: BA.soft, marginTop: 2 }}>23/11–29/11/2026</div>
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
  const phone = useEnter(4, 200)
  const line = useEnter(140, 200)
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>Month end. <Em>Already done.</Em></>} at={0} width={1400} size={64} />
        <div style={{ position: 'absolute', left: 380, top: 170, opacity: phone, translate: `0 ${interpolate(phone, [0, 1], [70, 0])}px` }}>
          <Phone width={400}><Notice at={24} /></Phone>
        </div>
        <div style={{ position: 'absolute', left: 960, top: 340, width: 640, display: 'flex', flexDirection: 'column', gap: 28 }}>
          <Point at={50}>Clocked in and out on their phone</Point>
          <Point at={68}>The hours add themselves up</Point>
          <Point at={86}>Card tips in from Square</Point>
          <Point at={104}>Shared out by hours worked</Point>
          <div style={{ fontFamily: text, fontSize: 27, lineHeight: 1.5, color: BA.soft, marginTop: 8, opacity: line }}>
            Payroll hours ready at month end, and no arguments about the tips.
          </div>
        </div>
      </AbsoluteFill>
      <Sfx name="chime" at={24} volume={0.2} />
      {[50, 68, 86, 104].map(f => <Sfx key={f} name="pop" at={f + 4} volume={0.16} />)}
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}
