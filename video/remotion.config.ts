// Remotion's settings for `npx remotion studio|render|still` in this folder.
import { Config } from '@remotion/cli/config'

// Cloud sessions have Chrome's headless shell pre-installed; elsewhere Remotion fetches its own.
const shell = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'
import { existsSync } from 'node:fs'
if (existsSync(shell)) Config.setBrowserExecutable(shell)
Config.setVideoImageFormat('jpeg')
Config.setJpegQuality(95)
Config.setConcurrency(4)
