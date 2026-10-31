import { Composition } from 'remotion'
import { LandingVideo } from './LandingVideo'
import { FPS, TOTAL } from './timeline'

export const Root = () => (
  <Composition id="LandingVideo" component={LandingVideo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
)
