/** Brand mark, inline so it works in every build (including the single-file demo). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="96" fill="#3e2723" />
      <ellipse cx="256" cy="256" rx="120" ry="170" transform="rotate(35 256 256)" fill="#a5d6a7" />
      <path d="M200 140c70 60 70 170 112 232" stroke="#3e2723" strokeWidth="22" fill="none" strokeLinecap="round" />
    </svg>
  )
}
