// Ask it anything: three questions, said or typed, each answered from the café's own figures through the
// connector (who's working, the licences, the team's hours), as the AI assistants page suggests asking.
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { Caption, Cream, Em, Sfx, useEnter } from '../kit'
import { AiText, ChatWindow, Composer, ToolCall, UserBubble, keysOf, typed, typedBy } from './chat'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

interface Q { q: string; said: boolean; tool: string; a: string }
const QS: Q[] = [
  { q: 'Who’s working on Saturday?', said: true, tool: 'Who’s working', a: 'Maria from 08:00 to 15:00 and Julio from 09:00 to 15:00. No open shifts.' },
  { q: 'Which licences run out in the next two months?', said: false, tool: 'Licences and renewals', a: 'One: the terrace licence, on 12 January. Shall I remind you a month before?' },
  { q: 'How many hours did the team work last week?', said: true, tool: 'Labour summary', a: '164 hours across five people, two of them on overtime on Friday.' },
]
/** When each question starts (frames into the scene), how long it's said or typed for, and when it's sent. */
const AT = [12, 160, 318]
const lead = (q: Q, at: number) => (q.said ? at + 34 : typedBy(q.q, at, 1.6) + 8)

export function Ask({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const win = useEnter(2, 200)
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  // The box: listening while a question is said, the letters while one is typed, empty once it's sent.
  const now = QS.findIndex((q, i) => frame >= AT[i] && frame < lead(q, AT[i]))
  const q = now >= 0 ? QS[now] : null
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>Ask it anything. <Em>It knows your business.</Em></>} at={0} />
        <ChatWindow x={305} y={190} width={1310} height={820} style={{ opacity: win, translate: `0 ${interpolate(win, [0, 1], [80, 0])}px` }}
          composer={<Composer value={q && !q.said ? typed(q.q, frame, AT[now], 1.6) : ''} typing={!!q && !q.said} listening={!!q?.said} size={24}
            micAt={q?.said ? AT[now] : undefined} />}>
          {QS.map((x, i) => {
            const sent = lead(x, AT[i])
            return frame >= sent && (
              <div key={x.q} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <UserBubble at={sent} said={x.said} size={26}>{x.q}</UserBubble>
                <ToolCall at={sent + 12} done={sent + 34} tool={x.tool} size={21} />
                <AiText at={sent + 40} text={x.a} size={26} per={2.5} />
              </div>
            )
          })}
        </ChatWindow>
      </AbsoluteFill>
      {QS.map((x, i) => {
        const sent = lead(x, AT[i])
        return [
          x.said ? <Sfx key={`m${i}`} name="mic" at={AT[i]} volume={0.26} /> : keysOf(x.q, AT[i], 1.6).map((f, j) => <Sfx key={`k${i}-${j}`} name="key" at={f} volume={0.14} />),
          <Sfx key={`s${i}`} name="click" at={sent} volume={0.24} />,
          <Sfx key={`d${i}`} name="ping" at={sent + 34} volume={0.16} />,
        ]
      })}
      <Sfx name="whoosh" at={len - 10} volume={0.2} />
    </Cream>
  )
}
