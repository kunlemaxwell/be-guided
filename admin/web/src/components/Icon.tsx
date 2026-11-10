/** Line icons (24×24, stroke = currentColor). Decorative: always aria-hidden. */
export const ICONS = {
  pages: 'M4 4h11l5 5v11H4z M15 4v5h5',
  products: 'M4 7l8-4 8 4-8 4z M4 12l8 4 8-4 M4 17l8 4 8-4',
  requests: 'M4 12a8 8 0 1 0 2.3-5.6 M4 4v4h4 M12 8v4l3 2',
  audit: 'M9 4h6 M9 4a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1 M8 6H6v14h12V6h-2 M9 11h6 M9 15h4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12h2 M3 12h2 M12 3v2 M12 19v2 M17 7l1.5-1.5 M5.5 18.5L7 17 M17 17l1.5 1.5 M5.5 5.5L7 7',
  components: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  collapse: 'M15 6l-6 6 6 6',
  sidebarClose: 'M4 5h16v14H4z M9 5v14 M16 9l-3 3 3 3',
  sidebarOpen: 'M4 5h16v14H4z M9 5v14 M13 9l3 3-3 3',
  expand: 'M9 6l6 6-6 6',
  more: 'M12 5.5v.01 M12 12v.01 M12 18.5v.01',
  chevronDown: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12 M18 6L6 18',
  external: 'M14 5h5v5 M19 5l-8 8 M18 14v5H5V6h5',
  history: 'M3 12a9 9 0 1 0 3-6.7 M3 4v4h4 M12 7v5l3 2',
  video: 'M4 6h11v12H4z M15 10l5-3v10l-5-3',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4',
  folder: 'M3 6h6l2 2h10v11H3z',
  check: 'M5 12l5 5 9-10',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
  reset: 'M4 12a8 8 0 1 0 2.3-5.6 M4 4v4h4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  thumb: 'M7 11v9H4v-9z M7 11l4-7a2 2 0 0 1 2.5 2.6L12.5 10H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  );
}
