// "Right on Google.": Google reviews & opening hours, for the Sales page's card of that name. Easy Beans Coffee on
// a Sunday afternoon: Google Maps says it's open until four, the door says closed, and a two-star review has had no
// reply. Then each changed once in the app, and everywhere it shows follows (the owner video's chapters, recorded
// again for this one): Sunday's hours → Google Maps and the website; the review answered → Google Maps. The listing
// put right, and the brand. 72 seconds over video/music/listing.py.
import { Audio } from '@remotion/media'
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion'
import { EndCard } from '../day/After'
import { BA } from '../theme'
import { Hours, Reviews } from './Chapters'
import { Problem, Recap, Title } from './Drawn'
import { LISTING, lenOf, type ListingScene } from './timeline'

const at = (k: ListingScene) => ({ from: LISTING[k][0], durationInFrames: lenOf(k) })

export function ListingVideo() {
  const { durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ background: BA.bg }}>
      <Sequence name="Right on Google. Every time." {...at('title')}><Title /></Sequence>
      <Sequence name="Sunday, 15:30" {...at('problem')}><Problem len={lenOf('problem')} /></Sequence>
      <Sequence name="1 Opening hours" {...at('hours')}><Hours len={lenOf('hours')} /></Sequence>
      <Sequence name="2 Reviews" {...at('reviews')}><Reviews len={lenOf('reviews')} /></Sequence>
      <Sequence name="The listing, right" {...at('recap')}><Recap len={lenOf('recap')} /></Sequence>
      <Sequence name="Brand" {...at('end')}><EndCard /></Sequence>
      <Audio src={staticFile('audio/listing-music.mp3')}
        volume={f => interpolate(f, [0, 6, durationInFrames - 45, durationInFrames], [0, 0.9, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  )
}
