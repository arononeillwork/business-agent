import type { Modifier } from '@dnd-kit/core'

/** Keep a dragged item on its column (the sidebar only reorders vertically). */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })
