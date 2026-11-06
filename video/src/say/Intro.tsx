// The opening: "Just say it." Then the set-up, once: in the AI's settings, Connectors, add a custom
// connector (its name and the app's connector address, as the AI assistants page gives them), connect,
// sign in with the team account, connected. It works in Claude, ChatGPT and any AI that takes connectors,
// and acts as you: what you can do in the app and nothing more, every change logged as made via AI.
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { siClaude } from 'simple-icons'
import { Caption, Cream, Em, Logo, Sfx, useEnter } from '../kit'
import { BA, display, text } from '../theme'
import { Caret, Check, keysOf, typed, typedBy } from './chat'

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
  const sub = useEnter(40, 200)
  const out = interpolate(frame, [108, 120], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out }}>
        <div style={{ fontFamily: text, fontWeight: 600, fontSize: 28, letterSpacing: '0.16em', textTransform: 'uppercase', color: BA.roseDeep,
          opacity: eyebrow, translate: `0 ${interpolate(eyebrow, [0, 1], [14, 0])}px`, marginBottom: 26 }}>Easy Beans Coffee · from your AI</div>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: 150, lineHeight: 1.04, letterSpacing: '-0.02em', textAlign: 'center' }}>
          <Word at={10}>Just</Word><Word at={18} italic>say</Word><Word at={24} italic>it.</Word>
        </div>
        <div style={{ fontFamily: text, fontSize: 36, color: BA.soft, marginTop: 30, opacity: sub, translate: `0 ${interpolate(sub, [0, 1], [16, 0])}px` }}>
          Type it or say it, the way it comes to you. Your business follows.
        </div>
      </AbsoluteFill>
      <Sfx name="pop" at={20} volume={0.22} />
    </Cream>
  )
}

const NAME = 'Easy Beans Coffee'
const URL = 'https://businesssagent.com/mcp'

/** A field in the dialog, typed into from `at`. */
function Field({ label, value, at, frame, focus }: { label: string; value: string; at: number; frame: number; focus: boolean }) {
  const shown = typed(value, frame, at, 2)
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontFamily: text, fontWeight: 600, fontSize: 21, color: BA.soft, marginBottom: 8 }}>{label}</div>
      <div style={{ height: 58, borderRadius: 14, border: `2px solid ${focus ? BA.roseDeep : BA.line}`, display: 'flex', alignItems: 'center', padding: '0 18px',
        fontFamily: label === 'URL' ? 'ui-monospace, Menlo, monospace' : text, fontSize: 24, color: BA.ink, background: '#fff' }}>
        {shown}{focus && <Caret height={26} />}
      </div>
    </div>
  )
}

/** A button that's pressed at `at`. */
function Btn({ children, at, dark, style }: { children: string; at?: number; dark?: boolean; style?: React.CSSProperties }) {
  const frame = useCurrentFrame()
  const s = at === undefined ? 1 : interpolate(frame, [at, at + 4, at + 10], [1, 0.9, 1], clamp)
  return (
    <span style={{ display: 'inline-block', padding: '13px 28px', borderRadius: 999, background: dark ? BA.ink : '#fff', color: dark ? '#fff' : BA.ink,
      border: dark ? 'none' : `1px solid ${BA.line}`, fontFamily: text, fontWeight: 600, fontSize: 23, scale: String(s), whiteSpace: 'nowrap', ...style }}>{children}</span>
  )
}

// When each thing happens, in frames from the start of the scene.
const T = { open: 34, name: 52, url: 0, add: 0, connect: 0, signIn: 0, connected: 0, after: 0 }
T.url = typedBy(NAME, T.name, 2) + 8
T.add = typedBy(URL, T.url, 2) + 10
T.connect = T.add + 34
T.signIn = T.connect + 10
T.connected = T.signIn + 44
T.after = T.connected + 26

export function Connect({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const win = useEnter(4, 200)
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  const dialog = frame >= T.open && frame < T.add + 6
  const dlg = useEnter(T.open, 200)
  const row = useEnter(T.add + 6, 200)
  const sheet = frame >= T.signIn && frame < T.connected
  const notes = useEnter(T.after, 200)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>Connect it once. <Em>That’s the set-up.</Em></>} at={0} />
        {/* The AI's settings: Connectors. */}
        <div style={{ position: 'absolute', left: 305, top: 210, width: 1310, height: 640, borderRadius: 22, overflow: 'hidden', background: '#FDFBF9', display: 'flex',
          boxShadow: '0 40px 90px rgba(60,40,30,0.22), 0 0 0 1px rgba(43,37,34,0.08)', opacity: win, translate: `0 ${interpolate(win, [0, 1], [80, 0])}px` }}>
          <div style={{ width: 300, background: '#F7F2EE', borderRight: `1px solid ${BA.line}`, padding: '30px 22px', fontFamily: text, fontSize: 24, color: BA.soft }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: display, fontSize: 30, color: BA.ink, marginBottom: 30 }}><Logo icon={siClaude} size={30} />Settings</div>
            {['General', 'Account', 'Privacy', 'Connectors', 'Billing'].map(n => (
              <div key={n} style={{ padding: '12px 16px', borderRadius: 12, marginBottom: 4, background: n === 'Connectors' ? '#fff' : 'transparent',
                color: n === 'Connectors' ? BA.ink : BA.soft, fontWeight: n === 'Connectors' ? 600 : 400 }}>{n}</div>
            ))}
          </div>
          <div style={{ flex: 1, padding: '34px 44px', fontFamily: text }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ fontFamily: display, fontSize: 40, color: BA.ink, flex: 1 }}>Connectors</div>
              <Btn at={T.open - 6}>+ Add custom connector</Btn>
            </div>
            <div style={{ fontSize: 22, color: BA.soft, marginTop: 8 }}>Let Claude use your apps and data.</div>
            <div style={{ marginTop: 34, borderRadius: 18, border: `1px solid ${BA.line}`, background: '#fff' }}>
              {['Google Drive', 'Gmail'].map(n => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', padding: '20px 24px', borderBottom: `1px solid ${BA.lineSoft}`, fontSize: 24, color: BA.ink }}>
                  <span style={{ flex: 1 }}>{n}</span><span style={{ color: BA.good, fontWeight: 600, fontSize: 21 }}>Connected</span>
                </div>
              ))}
              {frame >= T.add + 6 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px', fontSize: 24, color: BA.ink, background: frame < T.connected ? BA.roseSoft : '#fff',
                  opacity: row, translate: `${interpolate(row, [0, 1], [30, 0])}px 0` }}>
                  <Img src={staticFile('brand/icon.png')} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${BA.line}`, padding: 3, background: '#fff' }} />
                  <span style={{ fontWeight: 600 }}>{NAME}</span>
                  <span style={{ flex: 1, fontSize: 19, color: BA.faint, fontFamily: 'ui-monospace, Menlo, monospace' }}>businesssagent.com/mcp</span>
                  {frame < T.connected ? <Btn dark at={T.connect}>Connect</Btn>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: BA.good, fontWeight: 600, fontSize: 22 }}><Check size={28} />Connected</span>}
                </div>
              )}
            </div>
          </div>
          {/* Add custom connector: its name and the address. */}
          {dialog && (
            <AbsoluteFill style={{ background: 'rgba(43,37,34,0.28)', alignItems: 'center', justifyContent: 'center', opacity: Math.min(1, dlg * 1.5) }}>
              <div style={{ width: 660, padding: '30px 34px 28px', borderRadius: 24, background: '#fff', boxShadow: '0 30px 80px rgba(0,0,0,0.25)',
                scale: String(interpolate(dlg, [0, 1], [0.94, 1])) }}>
                <div style={{ fontFamily: display, fontSize: 34, color: BA.ink }}>Add custom connector</div>
                <Field label="Name" value={NAME} at={T.name} frame={frame} focus={frame < T.url} />
                <Field label="URL" value={URL} at={T.url} frame={frame} focus={frame >= T.url} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28 }}><Btn>Cancel</Btn><Btn dark at={T.add}>Add</Btn></div>
              </div>
            </AbsoluteFill>
          )}
          {/* Sign in with the team account. */}
          {sheet && (
            <AbsoluteFill style={{ background: 'rgba(43,37,34,0.28)', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 520, padding: '34px 34px 30px', borderRadius: 24, background: '#fff', textAlign: 'center', fontFamily: text, boxShadow: '0 30px 80px rgba(0,0,0,0.25)' }}>
                <Img src={staticFile('brand/icon.png')} style={{ width: 70, height: 70, borderRadius: 20, border: `1px solid ${BA.line}`, padding: 6 }} />
                <div style={{ fontFamily: display, fontSize: 30, color: BA.ink, marginTop: 14 }}>Sign in to Business Agent</div>
                <div style={{ fontSize: 21, color: BA.soft, marginTop: 6 }}>Claude will act as you: what you can do, nothing more.</div>
                <Btn dark at={T.signIn + 22} style={{ marginTop: 22 }}>Continue as Aron</Btn>
              </div>
            </AbsoluteFill>
          )}
        </div>
        {/* Under it: where it works, and what it can do. */}
        <div style={{ position: 'absolute', left: 305, top: 880, width: 1310, display: 'flex', gap: 18, justifyContent: 'center', opacity: notes,
          translate: `0 ${interpolate(notes, [0, 1], [20, 0])}px` }}>
          {['Claude, ChatGPT or any AI that takes connectors', 'Acts as you: your permissions', 'Every change logged as made via AI'].map(n => (
            <span key={n} style={{ padding: '14px 24px', borderRadius: 999, background: '#fff', boxShadow: '0 10px 30px rgba(60,40,30,0.10)', fontFamily: text, fontWeight: 600,
              fontSize: 24, color: BA.ink, whiteSpace: 'nowrap' }}>{n}</span>
          ))}
        </div>
      </AbsoluteFill>
      {[T.open - 6, T.add, T.connect, T.signIn + 22].map(f => <Sfx key={f} name="click" at={f} volume={0.28} />)}
      {[...keysOf(NAME, T.name, 2), ...keysOf(URL, T.url, 2)].map((f, i) => <Sfx key={`k${i}`} name="key" at={f} volume={0.16} />)}
      <Sfx name="ping" at={T.connected} volume={0.3} />
      <Sfx name="whoosh" at={len - 10} volume={0.2} />
    </Cream>
  )
}
