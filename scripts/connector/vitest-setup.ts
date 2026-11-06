// Tests run against the page list as the app is now (shared/connectorPages.generated.ts is not in git).
import { writeConnectorPages } from './pages'

export default function setup() {
  writeConnectorPages()
}
