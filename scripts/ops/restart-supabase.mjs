// Reboots the Supabase project — the dashboard's "Restart project" — and waits for it to come
// back. For when the database instance freezes: connections hang, sign-in buttons do nothing,
// /api/health?deep=1 times out. GitHub Actions only (needs SUPABASE_ACCESS_TOKEN).
const REF = process.env.SUPABASE_PROJECT_REF ?? 'lhakrmmoxaareykglmtx'
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) { console.log('::error::SUPABASE_ACCESS_TOKEN is not set'); process.exit(1) }
const api = (path, init = {}) => fetch(`https://api.supabase.com/v1${path}`, {
  ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
})

const restart = await api(`/projects/${REF}/restart`, { method: 'POST' })
if (!restart.ok) { console.log(`::error::Restart failed: ${restart.status} ${await restart.text()}`); process.exit(1) }
console.log('Restart requested. Waiting for the database, auth and REST services to come back…')

for (let i = 0; i < 40; i++) {
  await new Promise(r => setTimeout(r, 15_000))
  const res = await api(`/projects/${REF}/health?services=db,auth,rest`).catch(() => null)
  if (!res?.ok) { console.log(`…health not readable yet (${res?.status ?? 'network error'})`); continue }
  const services = await res.json()
  console.log(services.map(s => `${s.name}: ${s.status}`).join('  '))
  if (services.length && services.every(s => s.status === 'ACTIVE_HEALTHY')) {
    console.log('All services healthy again.')
    process.exit(0)
  }
}
console.log('::warning::Not confirmed healthy after 10 minutes — check the Supabase dashboard.')
process.exit(1)
