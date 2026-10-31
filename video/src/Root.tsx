import { Composition } from 'remotion'
import { LandingVideo } from './LandingVideo'
import { DayVideo } from './day/DayVideo'
import { DAY_TOTAL } from './day/timeline'
import { FPS, TOTAL } from './timeline'

export const Root = () => (
  <>
    <Composition id="LandingVideo" component={LandingVideo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="DayVideo" component={DayVideo} durationInFrames={DAY_TOTAL} fps={FPS} width={1920} height={1080} />
  </>
)
