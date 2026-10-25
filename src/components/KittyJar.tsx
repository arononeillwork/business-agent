import { Box, SvgIcon, type SvgIconProps } from '@mui/material'
import PartyIcon from '@mui/icons-material/CelebrationOutlined'
import DinnerIcon from '@mui/icons-material/RestaurantOutlined'
import TripIcon from '@mui/icons-material/FlightTakeoffOutlined'
import GiftIcon from '@mui/icons-material/CardGiftcardOutlined'
import EquipmentIcon from '@mui/icons-material/CoffeeMakerOutlined'
import OtherIcon from '@mui/icons-material/StarOutlineRounded'
import CheckIcon from '@mui/icons-material/CheckRounded'
import { useEffect, useId, useState, type ReactNode } from 'react'
import type { GoalIcon } from '../../shared/kitty'
import { tokens } from '../theme'

/** A pair of Wayfarer-style sunglasses (Material has no sunglasses). */
export function SunglassesIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M1 8.2h22v1.9H1z" />
      <path d="M2 10.1h8.7l-.75 5.2c-.25 1.65-1.35 2.6-2.9 2.6H4.9c-1.55 0-2.6-.95-2.85-2.6z" />
      <path d="M22 10.1h-8.7l.75 5.2c.25 1.65 1.35 2.6 2.9 2.6h2.15c1.55 0 2.6-.95 2.85-2.6z" />
      <path d="M10.4 10.5c1-.9 2.2-.9 3.2 0v1.1c-1-.8-2.2-.8-3.2 0z" />
      <path d="M3.6 12.6l3.4-1.5.35.75-3.4 1.5zM15.1 12.6l3.4-1.5.35.75-3.4 1.5z" fill="#FFFFFF" opacity=".6" />
    </SvgIcon>
  )
}

export const GOAL_ICON: Record<GoalIcon, (p: SvgIconProps) => ReactNode> = {
  party: p => <PartyIcon {...p} />, sunglasses: p => <SunglassesIcon {...p} />, dinner: p => <DinnerIcon {...p} />, trip: p => <TripIcon {...p} />,
  gift: p => <GiftIcon {...p} />, equipment: p => <EquipmentIcon {...p} />, other: p => <OtherIcon {...p} />,
}

// The jar, drawn in a 140 × 180 box: a rose lid, a glass mason jar, and inside it roasted beans up
// to how full the goal is, with the goal's picture on a cream label.
const BODY = 'M40 30h60v5c0 6 26 9 26 30v89c0 13-9 20-22 20H36c-13 0-22-7-22-20V65c0-21 26-24 26-30z'
const TOP = 42
const BOTTOM = 174

/** A bumpy line of beans across the jar at height y, closed along the bottom. */
function pile(y: number) {
  let d = `M8 ${y + 4}`
  for (let x = 8; x < 132; x += 12) d += ` q6 ${-9 + ((x / 12) % 3) * 2} 12 0`
  return `${d} V${BOTTOM + 8} H8 Z`
}

/**
 * A goal's jar, filling with coffee beans up to `share` (0 to 1). It fills up from empty when it
 * first appears (not when the person asked for less motion). `full` adds sparkles; `bought` a tick.
 */
export function KittyJar({ share, icon, full, bought, size = 140 }: { share: number; icon: GoalIcon; full?: boolean; bought?: boolean; size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(Math.max(0, Math.min(1, share))))
    return () => cancelAnimationFrame(raf)
  }, [share])
  // The beans are drawn full and lowered: a transform fills them up smoothly in every browser.
  const drop = (BOTTOM - TOP) * (1 - shown)
  const Icon = GOAL_ICON[icon]
  return (
    <Box aria-hidden sx={{ position: 'relative', width: size, height: size * 180 / 140, flexShrink: 0 }}>
      <svg viewBox="0 0 140 180" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <clipPath id={`jar-${id}`}><path d={BODY} /></clipPath>
          <pattern id={`beans-${id}`} width="26" height="21" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
            <rect width="26" height="21" fill="#4E3221" />
            {[[7, 5.5, 0, '#A2714A'], [19.5, 15.5, 28, '#86593A'], [20, 3.5, -20, '#93633F'], [6, 16, 15, '#7A4F33']].map(([x, y, r, c]) => (
              <g key={`${x}-${y}`} transform={`rotate(${r} ${x} ${y})`}>
                <ellipse cx={x} cy={y} rx="6" ry="4.4" fill={c as string} />
                <ellipse cx={(x as number) - 1.6} cy={(y as number) - 1.6} rx="2.4" ry="1.1" fill="#FFFFFF" opacity="0.18" />
                <path d={`M${(x as number) - 4.6} ${(y as number) + 0.6}c2.6-2.2 6.6-2.2 9.2 0`} stroke="#3A2416" strokeWidth="1.1" fill="none" strokeLinecap="round" />
              </g>
            ))}
          </pattern>
          <linearGradient id={`glass-${id}`} x1="0" x2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0.12" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.28" />
          </linearGradient>
        </defs>
        {/* The glass, the beans inside it, then the shine on top. */}
        <path d={BODY} fill={tokens.surface} opacity="0.5" />
        {share > 0 && (
          <g clipPath={`url(#jar-${id})`}>
            <g className="eb-beans" style={{ transform: `translateY(${drop}px)`, transition: 'transform 1.4s cubic-bezier(.2,.8,.2,1)' }}>
              <path d={pile(TOP)} fill={`url(#beans-${id})`} />
            </g>
          </g>
        )}
        <path d={BODY} fill={`url(#glass-${id})`} stroke={tokens.lineStrong} strokeWidth="2.5" />
        <path d="M24 74c0-9 4-15 10-17v95c-7-2-10-7-10-13z" fill="#FFFFFF" opacity="0.4" />
        <path d="M112 84v54" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.25" />
        {/* The lid. */}
        <rect x="34" y="11" width="72" height="22" rx="6" fill="#F79BA4" />
        <rect x="34" y="11" width="72" height="8" rx="4" fill="#FFFFFF" opacity="0.3" />
        {[46, 56, 66, 76, 86, 96].map(x => <path key={x} d={`M${x} 21v9`} stroke="#A85A68" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />)}
        {/* The label. */}
        <rect x="36" y="90" width="68" height="48" rx="11" fill="#FBF8F4" stroke="#E8DCD2" strokeWidth="1.5" />
        {full && !bought && [[18, 18, 1], [124, 30, 0.8], [116, 6, 0.6], [10, 52, 0.7]].map(([x, y, s]) => (
          <path key={`${x}-${y}`} d={`M${x} ${y - 7 * s}l${2 * s} ${5 * s} ${5 * s} ${2 * s}-${5 * s} ${2 * s}-${2 * s} ${5 * s}-${2 * s}-${5 * s}-${5 * s}-${2 * s} ${5 * s}-${2 * s}z`}
            fill="#F79BA4" className="eb-sparkle" style={{ transformBox: 'fill-box', transformOrigin: 'center', animationDelay: `${x * 7}ms` }} />
        ))}
      </svg>
      <Box sx={{ position: 'absolute', left: `${(36 / 140) * 100}%`, top: `${(90 / 180) * 100}%`, width: `${(68 / 140) * 100}%`, height: `${(48 / 180) * 100}%`,
        display: 'grid', placeItems: 'center', color: '#2B2522', '& svg': { width: '56%', height: 'auto' } }}>
        <Icon />
      </Box>
      {bought && (
        <Box sx={{ position: 'absolute', right: '6%', top: '14%', width: size * 0.24, height: size * 0.24, borderRadius: '50%', bgcolor: tokens.matcha, color: '#fff',
          display: 'grid', placeItems: 'center', boxShadow: `0 0 0 3px ${tokens.surface}`, '& svg': { width: '70%', height: '70%' } }}><CheckIcon /></Box>
      )}
    </Box>
  )
}

/** The sparkles' twinkle, for the page around the jars; still when the person asked for less motion. */
export const jarStyles = {
  '@keyframes eb-twinkle': { '0%, 100%': { opacity: 0.25, transform: 'scale(.6)' }, '50%': { opacity: 1, transform: 'scale(1.1)' } },
  '& .eb-sparkle': { animation: 'eb-twinkle 2.4s ease-in-out infinite' },
  '@media (prefers-reduced-motion: reduce)': { '& .eb-sparkle': { animation: 'none' }, '& .eb-beans': { transition: 'none !important' } },
} as const
