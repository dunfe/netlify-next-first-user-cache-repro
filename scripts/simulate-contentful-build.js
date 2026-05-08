const { writeFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')

const marker = join(process.cwd(), '.contentful-build-failed')

if (process.env.SIMULATE_CONTENTFUL_FAILURE === '1') {
  console.warn('[prebuild] Simulating Contentful connection failure during static generation')
  console.warn('[prebuild] Build will continue and write .contentful-build-failed marker')
  writeFileSync(marker, new Date().toISOString())
} else {
  rmSync(marker, { force: true })
  console.log('[prebuild] Contentful simulation OK; marker removed')
}
