import type { SVGProps, ReactElement } from 'react';
import type { HeroIconName } from '@/types/content';

/** Inline stroke icons. Decorative by default (aria-hidden). */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...rest,
  };
}

export const SearchIcon = (p: IconProps) => (<svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>);
export const MoonIcon = (p: IconProps) => (<svg {...base(p)}><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>);
export const SunIcon = (p: IconProps) => (<svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
export const SparkIcon = (p: IconProps) => (<svg {...base(p)}><path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z" /></svg>);
export const DownloadIcon = (p: IconProps) => (<svg {...base(p)}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>);
export const ChevronDownIcon = (p: IconProps) => (<svg {...base(p)}><path d="M6 9l6 6 6-6" /></svg>);
export const CloseIcon = (p: IconProps) => (<svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const ExternalIcon = (p: IconProps) => (<svg {...base(p)}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg>);
export const CheckCircleIcon = (p: IconProps) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></svg>);
export const PlayIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
);
export const SidebarIcon = (p: IconProps) => (<svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>);
export const SendIcon = (p: IconProps) => (<svg {...base(p)}><path d="M5 12h13M13 6l6 6-6 6" /></svg>);
export const ChatIcon = (p: IconProps) => (<svg {...base(p)}><path d="M20 12a8 8 0 01-11.6 7.1L4 20l1-4.2A8 8 0 1120 12z" /><path d="M9 11h6M9 14h4" /></svg>);
export const TrashIcon = (p: IconProps) => (<svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>);
export const CopyIcon = (p: IconProps) => (<svg {...base(p)}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 011-1h10" /></svg>);
export const CheckIcon = (p: IconProps) => (<svg {...base(p)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);

/** Icons for a hero's floating labels, by the name used in product.json. */
const HERO_ICON_PATHS: Record<HeroIconName, ReactElement> = {
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.6a3.5 3.5 0 010 6.8M21.5 20a6.5 6.5 0 00-4-6" /></>,
  building: <><path d="M4 21V4a1 1 0 011-1h9a1 1 0 011 1v17M15 9h4a1 1 0 011 1v11M2 21h20M8 7h3M8 11h3M8 15h3" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M3 13h18" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  box: <><path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" /></>,
  wallet: <><path d="M4 7a2 2 0 012-2h12v4M4 7v11a2 2 0 002 2h14V9H6a2 2 0 01-2-2zM16 14.5h.01" /></>,
  truck: <><path d="M2 6h12v10H2zM14 10h4l4 3v3h-8zM6 19.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 19.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  file: <><path d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6" /></>,
  check: <><path d="M5 12.5l4.5 4.5L19 7.5" /></>,
  play: <><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l6-3.5z" /></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
};
export const HeroIcon = ({ name, ...p }: IconProps & { name: HeroIconName }) => (<svg {...base(p)}>{HERO_ICON_PATHS[name]}</svg>);
