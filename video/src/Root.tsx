import { Composition } from 'remotion'
import { LandingVideo } from './LandingVideo'
import { DayVideo } from './day/DayVideo'
import { DAY_TOTAL } from './day/timeline'
import { OwnerVideo } from './owner/OwnerVideo'
import { OWNER_TOTAL } from './owner/timeline'
import { SayVideo } from './say/SayVideo'
import { SAY_TOTAL } from './say/timeline'
import { WasteVideo } from './waste/WasteVideo'
import { WASTE_TOTAL } from './waste/timeline'
import { ListingVideo } from './listing/ListingVideo'
import { LISTING_TOTAL } from './listing/timeline'
import { CompetitorsVideo } from './competitors/CompetitorsVideo'
import { COMPETITORS_TOTAL } from './competitors/timeline'
import { RegularsVideo } from './regulars/RegularsVideo'
import { REGULARS_TOTAL } from './regulars/timeline'
import { CostingVideo } from './costing/CostingVideo'
import { COSTING_TOTAL } from './costing/timeline'
import { SocialVideo } from './social/SocialVideo'
import { SOCIAL_TOTAL } from './social/timeline'
import { FPS, TOTAL } from './timeline'

export const Root = () => (
  <>
    <Composition id="LandingVideo" component={LandingVideo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="DayVideo" component={DayVideo} durationInFrames={DAY_TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="OwnerVideo" component={OwnerVideo} durationInFrames={OWNER_TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="SayVideo" component={SayVideo} durationInFrames={SAY_TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="WasteVideo" component={WasteVideo} durationInFrames={WASTE_TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="ListingVideo" component={ListingVideo} durationInFrames={LISTING_TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="CompetitorsVideo" component={CompetitorsVideo} durationInFrames={COMPETITORS_TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="RegularsVideo" component={RegularsVideo} durationInFrames={REGULARS_TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="CostingVideo" component={CostingVideo} durationInFrames={COSTING_TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="SocialVideo" component={SocialVideo} durationInFrames={SOCIAL_TOTAL} fps={FPS} width={1920} height={1080} />
  </>
)
