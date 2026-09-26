import Svg, { Path } from 'react-native-svg';

// Stroke icons lifted from the design canvas (24×24 viewBox).
const paths = {
  sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z'],
  sparkleSm: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z'],
  shield: ['M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z', 'M9 12l2 2 4-4'],
  bell: ['M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16z', 'M10 20a2 2 0 004 0'],
  back: ['M15 6l-6 6 6 6'],
  chevron: ['M9 6l6 6-6 6'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  plus: ['M12 5v14', 'M5 12h14'],
  clock: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 7v5l3 2'],
  info: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 11v5', 'M12 7.8v.1'],
  warn: ['M12 4l9 16H3l9-16z', 'M12 10v4', 'M12 17.2v.1'],
  search: ['M11 18a7 7 0 100-14 7 7 0 000 14z', 'M20 20l-4-4'],
  external: ['M14 5h5v5', 'M19 5l-8 8', 'M18 14v5H5V6h5'],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 017 0v3'],
  faceId: ['M4 8V5a1 1 0 011-1h3', 'M16 4h3a1 1 0 011 1v3', 'M20 16v3a1 1 0 01-1 1h-3', 'M8 20H5a1 1 0 01-1-1v-3', 'M9 10v1', 'M15 10v1', 'M12 10v3h-1', 'M9.5 16a4 4 0 005 0'],
  unlink: ['M9 15l-2 2a3 3 0 01-4-4l2-2', 'M15 9l2-2a3 3 0 014 4l-2 2', 'M4 4l16 16'],
  refresh: ['M20 11a8 8 0 00-14.5-4.5L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0014.5 4.5L20 16', 'M20 20v-4h-4'],
  home: ['M4 11l8-7 8 7v9h-5v-6h-6v6H4z'],
  chat: ['M4 5h16v11H9l-5 4V5z'],
  wallet: ['M4 7h15a1 1 0 011 1v11H4V7z', 'M4 7l11-3v3'],
  settings: ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M4 12h2M18 12h2M12 4v2M12 18v2'],
  send: ['M4 12l16-8-6 16-3-7-7-1z'],
  mic: ['M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3z', 'M5 11a7 7 0 0014 0', 'M12 18v3'],
  micOff: ['M15 9.3V6a3 3 0 00-5.8-1', 'M9 9v3a3 3 0 004.8 2.4', 'M5 11a7 7 0 0011.5 5.4', 'M19 11a7 7 0 01-.6 2.8', 'M12 18v3', 'M4 4l16 16'],
  phoneOff: ['M4 4l16 16', 'M8.6 13.4A15 15 0 014 7.5 2 2 0 015.9 5h2.6l1.3 3.3-1.6 1.2', 'M13.2 16.2l1.2-1.6 3.3 1.3v2.6a2 2 0 01-2.2 2 15 15 0 01-4.6-1.4'],
  waveform: ['M4 10v4', 'M8 7v10', 'M12 4v16', 'M16 7v10', 'M20 10v4'],
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false}>
      {paths[name].map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
