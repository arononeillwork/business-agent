// Tests run against the page list as the app is now (shared/connectorPages.generated.ts is not in git).
import { writeFileSync } from 'node:fs'
import { OUT, buildPages, render } from './pages'

export default function setup() {
  writeFileSync(OUT, render(buildPages()))
}
