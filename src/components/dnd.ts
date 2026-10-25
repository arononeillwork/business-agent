import { KeyboardSensor, type KeyboardSensorProps, type Modifier } from '@dnd-kit/core'

/** Keep a dragged item on its column (the sidebar only reorders vertically). */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

// What the keyboard sensor keeps private in dnd-kit's types (not at run time).
interface KeyboardInternals {
  handleKeyDown: (e: Event) => void
  detach: () => void
  listeners: { add(type: string, fn: (e: Event) => void): void }
}

/**
 * dnd-kit's keyboard sensor, listening for the arrow keys and the drop from the moment something is
 * picked up. The library starts listening on a timer, so the key that picked it up isn't taken as the
 * drop too; while the page is busy (a slow tablet, or Today still working out its figures) that timer
 * runs late, and a quick "space, arrow, space" lands first and the drop is lost. This listens straight
 * away and skips that first key instead. When the library's timer comes it adds the same function,
 * which the browser doesn't add twice; after the drop it does nothing and takes itself off.
 */
export class KeyboardSensorNow extends KeyboardSensor {
  constructor(props: KeyboardSensorProps) {
    super(props)
    const self = this as unknown as KeyboardInternals
    const handle = self.handleKeyDown, detach = self.detach.bind(this)
    let ended = false
    const onKey = (e: Event) => {
      if (ended) e.currentTarget?.removeEventListener('keydown', onKey)
      else if (e !== props.event) handle(e)
    }
    self.handleKeyDown = onKey
    self.detach = () => { ended = true; detach() }
    self.listeners.add('keydown', onKey)
  }
}
