import type { CSSProperties } from 'react';
const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    bag: <><path d="M5 7h14l2 14H3L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></>,
    sparkle: <><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z"/><path d="M20 2v4m-2-2h4"/></>,
    activity: <path d="M2 12h4l3-8 6 16 3-8h4"/>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
    up: <path d="M6 16 18 4M6 4h12v12"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    bell: <><path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4l-2 4Zm5 3h4"/></>,
    settings: <><path d="m9 3-1 3-3 1 1 4-2 2 2 4 3-1 3 5 3-5 3 1 2-4-2-2 1-4-3-1-1-3H9Z"/><circle cx="12" cy="12" r="3"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/></>,
    headphones: <><path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="11" width="5" height="9" rx="2"/><rect x="16" y="11" width="5" height="9" rx="2"/></>,
    shoe: <><path d="m3 14 3-8 4 5 4 2 7 2v5H3v-6Z"/><path d="m9 10-2 3m5-1-2 3m-7 2h18"/></>,
    monitor: <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4m-4 0h8"/></>,
    mixer: <><path d="M5 5h12a3 3 0 0 1 0 6H6v9h14M6 5v15m5-9v5m-2-1h9l-1 5h-7l-1-5Z"/></>,
    receipt: <><path d="M5 3h14v19l-3-2-4 2-4-2-3 2V3Z"/><path d="M8 8h8m-8 4h8m-8 4h4"/></>,
    logout: <><path d="M9 4H4v16h5m5-13 5 5-5 5M9 12h11"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 1 1 4 3v3m-1 3h.01"/></>,
    filter: <><path d="M3 6h18M6 12h12m-8 6h4"/></>
};
export function Icon({ name, size = 20, style }: {
    name: string;
    size?: number;
    style?: CSSProperties;
}) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name] ?? paths.bag}</svg>; }
