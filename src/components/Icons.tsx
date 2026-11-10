import type { SVGProps } from 'react';

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
