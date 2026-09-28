import { Box, Dialog, IconButton, InputBase, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, SvgIcon, Tooltip, Typography, type SvgIconProps } from '@mui/material'
import { useColorScheme } from '@mui/material/styles'
import SearchIcon from '@mui/icons-material/SearchRounded'
import SunIcon from '@mui/icons-material/LightModeOutlined'
import PersonIcon from '@mui/icons-material/PersonOutlineRounded'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from './AppContext'
import { applyPreferences } from './Appearance'
import { PersonAvatar } from '../components/common'
import { tokens } from '../theme'

// The two buttons at the top right: search (Ctrl/⌘ K) and the light/dark switch.

const roundButton = {
  width: 40, height: 40, borderRadius: '50%', color: tokens.inkSoft, border: `1px solid ${tokens.line}`, bgcolor: tokens.surface,
  transition: 'color .15s, border-color .15s, background .15s, transform .15s',
  '&:hover': { color: tokens.ink, borderColor: tokens.lineStrong, bgcolor: tokens.surface, transform: 'translateY(-1px)' },
}

/**
 * A crescent drawn so it sits in the middle of the button (the stock moon's weight is off to the
 * lower left, so it looked misplaced next to the search icon). Same stroke weight as the sun.
 */
function MoonIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M20.92 12.38A8 8 0 1 1 11.63 3.09A6.6 6.6 0 0 0 20.92 12.38Z" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
    </SvgIcon>
  )
}

/** Sun or moon: flips between light and dark, and remembers it on the person's account. */
export function ThemeToggle() {
  const { api, me, refresh } = useApp()
  const { mode, systemMode, setMode } = useColorScheme()
  const dark = (mode === 'system' ? systemMode : mode) === 'dark'
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  const toggle = () => {
    const theme = dark ? 'light' : 'dark'
    setMode(theme)
    if (!me) return
    const preferences = { ...me.preferences, theme } as const
    applyPreferences(preferences)
    api.updateProfile(me.id, { preferences }).then(refresh).catch(() => { /* the look still changed on this device */ })
  }
  return (
    <Tooltip title={label}>
      <IconButton aria-label={label} onClick={toggle} sx={roundButton}>
        <Box key={dark ? 'sun' : 'moon'} sx={{ display: 'grid', placeItems: 'center', animation: 'eb-theme-swap .3s ease',
          '@keyframes eb-theme-swap': { from: { opacity: 0, transform: 'scale(.7)' }, to: { opacity: 1, transform: 'none' } },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}>
          {dark ? <SunIcon fontSize="small" /> : <MoonIcon fontSize="small" />}
        </Box>
      </IconButton>
    </Tooltip>
  )
}

export interface SearchPage { key: string; to: string; label: string; icon: ReactNode; section: string | null }
interface Result { id: string; group: 'Pages' | 'People'; label: string; hint?: string; icon: ReactNode; to: string }

/** The search button, and the search box it opens (also Ctrl/⌘ K anywhere). */
export function SearchButton({ pages }: { pages: SearchPage[] }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
      <Tooltip title="Search (Ctrl K)">
        <IconButton aria-label="Search" aria-keyshortcuts="Control+K Meta+K" onClick={() => setOpen(true)} sx={roundButton}>
          <SearchIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {open && <SearchDialog pages={pages} onClose={() => setOpen(false)} />}
    </>
  )
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function SearchDialog({ pages, onClose }: { pages: SearchPage[]; onClose: () => void }) {
  const { profiles, isAdmin, isPartner, me } = useApp()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  // Type straight away (the dialog's own focus handling can land a beat later).
  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 0); return () => clearTimeout(t) }, [])
  const results = useMemo<Result[]>(() => {
    const words = norm(q).split(/\s+/).filter(Boolean)
    const hit = (...texts: (string | null | undefined)[]) => { const t = norm(texts.filter(Boolean).join(' ')); return words.every(w => t.includes(w)) }
    const pageHits: Result[] = pages.filter(p => hit(p.label, p.section)).map(p => ({
      id: `page:${p.key}`, group: 'Pages', label: p.label, hint: p.section ?? undefined, icon: p.icon, to: p.to,
    }))
    const people: Result[] = isPartner ? [] : profiles
      .filter(p => p.active && p.role !== 'kiosk' && p.role !== 'partner' && words.length > 0 && hit(p.full_name, p.email))
      .slice(0, 6)
      .map(p => ({
        id: `person:${p.id}`, group: 'People', label: p.full_name + (p.id === me?.id ? ' (you)' : ''), hint: p.role === 'admin' ? 'Admin' : 'Team',
        icon: <PersonAvatar name={p.full_name} colour={p.colour} size={26} />,
        to: `/team?q=${encodeURIComponent(p.full_name)}${isAdmin ? `&person=${p.id}` : ''}`,
      }))
    return [...pageHits, ...people]
  }, [q, pages, profiles, isAdmin, isPartner, me?.id])
  useEffect(() => setActive(0), [q])
  const go = (r: Result | undefined) => { if (!r) return; onClose(); navigate(r.to) }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-label="Search" disableAutoFocus
      slotProps={{ paper: { sx: { alignSelf: 'flex-start', mt: { xs: 2, sm: '12vh' }, overflow: 'hidden' } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.5, py: 1.75, borderBottom: `1px solid ${tokens.line}` }}>
        <SearchIcon sx={{ color: tokens.inkFaint }} />
        <InputBase autoFocus fullWidth inputRef={input} placeholder="Search pages and people…" value={q} onChange={e => setQ(e.target.value)}
          inputProps={{ 'aria-label': 'Search pages and people', role: 'combobox', 'aria-expanded': true, 'aria-controls': 'search-results',
            'aria-activedescendant': results[active] ? `sr-${active}` : undefined }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
            if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
          }}
          sx={{ fontSize: '1.05rem' }} />
        <Typography component="kbd" sx={{ fontSize: 11, color: tokens.inkFaint, border: `1px solid ${tokens.line}`, borderRadius: 1, px: 0.75, py: 0.25 }}>Esc</Typography>
      </Box>
      <List id="search-results" role="listbox" aria-label="Results" dense sx={{ maxHeight: '55vh', overflowY: 'auto', py: 1 }}>
        {results.length === 0 && <Typography sx={{ px: 3, py: 3, color: 'text.secondary' }}>Nothing matches “{q}”.</Typography>}
        {(['Pages', 'People'] as const).map(group => {
          const items = results.map((r, i) => ({ r, i })).filter(x => x.r.group === group)
          if (!items.length) return null
          return (
            <Box key={group} component="li" sx={{ listStyle: 'none' }}>
              <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '28px', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: tokens.inkFaint }}>{group}</ListSubheader>
              <Box component="ul" sx={{ p: 0, m: 0 }}>
                {items.map(({ r, i }) => (
                  <ListItemButton key={r.id} id={`sr-${i}`} role="option" aria-selected={i === active} selected={i === active}
                    onMouseEnter={() => setActive(i)} onClick={() => go(r)} sx={{ mx: 1, borderRadius: '10px', py: 0.9 }}>
                    <ListItemIcon sx={{ minWidth: 38, color: tokens.inkSoft }}>{r.icon ?? <PersonIcon />}</ListItemIcon>
                    <ListItemText primary={r.label} slotProps={{ primary: { sx: { fontWeight: 500 } } }} />
                    {r.hint && <Typography variant="caption" sx={{ color: tokens.inkFaint }}>{r.hint}</Typography>}
                  </ListItemButton>
                ))}
              </Box>
            </Box>
          )
        })}
      </List>
    </Dialog>
  )
}
