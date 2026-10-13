/**
 * @module studio/components/Icon
 *
 * Tek renkli (currentColor) ince çizgi ikon seti — emoji yerine profesyonel
 * araç ikonografisi. 24×24 viewBox, stroke tabanlı.
 */

export type IconName =
  | 'dashboard'
  | 'flow'
  | 'packages'
  | 'ai'
  | 'project'
  | 'search'
  | 'plus'
  | 'rules'
  | 'reviews'
  | 'webhook'
  | 'settings'
  | 'logout'
  | 'plug'
  | 'copy'

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  flow: (
    <>
      <circle cx="5" cy="6" r="2.4" />
      <circle cx="19" cy="6" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <path d="M7 7.2 10.5 16 M17 7.2 13.5 16" />
    </>
  ),
  packages: (
    <>
      <path d="M12 3 21 7.5 12 12 3 7.5Z" />
      <path d="M3 12 12 16.5 21 12" />
      <path d="M3 16.5 12 21 21 16.5" />
    </>
  ),
  ai: (
    <>
      <path d="M12 3v4 M12 17v4 M3 12h4 M17 12h4" />
      <path d="M12 8.5 13.3 10.7 15.5 12 13.3 13.3 12 15.5 10.7 13.3 8.5 12 10.7 10.7Z" />
    </>
  ),
  project: (
    <>
      <path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  plus: <path d="M12 5v14 M5 12h14" />,
  rules: (
    <>
      <path d="M8 6h11 M8 12h11 M8 18h11" />
      <path d="M4 6h.01 M4 12h.01 M4 18h.01" />
    </>
  ),
  reviews: (
    <>
      <path d="M4 5h16v11H7l-3 3Z" />
      <path d="M8 9h8 M8 12h5" />
    </>
  ),
  webhook: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M10.5 9.6 7 16 M13.5 9.6 17 16 M7 16h10" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
      <path d="M10 12h9 M16 9l3 3-3 3" />
    </>
  ),
  plug: (
    <>
      <path d="M9 2v5 M15 2v5" />
      <path d="M7 7h10v3a5 5 0 0 1-10 0Z" />
      <path d="M12 15v7" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  )
}

/** Tek renkli ikon. */
export const Icon = ({
  name,
  size = 16
}: {
  readonly name: IconName
  readonly size?: number
}): React.JSX.Element => (
  <svg
    className="icon"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {PATHS[name]}
  </svg>
)
