/** A small set of line icons, drawn to match the app's thin-rule look. Decorative unless given a label. */
const PATHS = {
  home: "M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z",
  building: "M5 20V5.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V20M15 10h3a1 1 0 0 1 1 1v9M3.5 20h17M8.5 8.5h3M8.5 12h3M8.5 15.5h3",
  users: "M9 11.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5zM3 19.5c.4-3 2.8-4.75 6-4.75s5.6 1.75 6 4.75M16 5.3a3.25 3.25 0 0 1 0 6M18 14.9c1.7.6 2.7 2.1 3 4.6",
  folder: "M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2.25H19A1.5 1.5 0 0 1 20.5 9.25V17A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z",
  file: "M7 3.5h6.5L18 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM13.5 3.5V8H18M9 12.5h6M9 16h4",
  pie: "M12 3.5v8.5h8.5A8.5 8.5 0 1 1 12 3.5zM15 3.9A8.5 8.5 0 0 1 20.1 9H15z",
  chart: "M4 20V4M4 20h16M8 16.5v-4M12 16.5V8M16 16.5v-6.5",
  trend: "M3.5 17 9 11.5l3.5 3.5 8-8M15.5 7h5v5",
  mail: "M4.5 6h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 7.5l8 6 8-6",
  handshake: "M3 8.5 7 7l3.5 1.5L13 7l4 1.5 4-1M3 8.5V15l3 .5 4 3.5 2.5-1.5 2 1 4.5-4.5 2-.5V7.5M10.5 8.5 8 12c1 1.2 2.8 1.2 4-.2l1-1.2 5 4.4",
  inbox: "M4 13.5 6.5 5.5h11l2.5 8M4 13.5V18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4.500M4 13.5h4.500l1 2.500h5l1-2.500H20",
  bank: "M3.5 9.5 12 4.500l8.5 5M5 9.500h14M6.5 9.500V17M10 9.500V17M14 9.500V17M17.5 9.500V17M4 19.500h16",
  clock: "M12 20.500a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 7.500V12l3 2",
  check: "M5 12.5 10 17.5 19.5 7",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.750a2.750 2.750 0 1 0 0-5.5 2.750 2.750 0 0 0 0 5.500z",
  lock: "M7 10.500V8a5 5 0 0 1 10 0v2.500M6 10.500h12a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7.500a1 1 0 0 1 1-1z",
  sparkle: "M12 3.500l1.7 5.3 5.3 1.7-5.3 1.700L12 17.500l-1.7-5.300L5 10.500l5.3-1.700zM18.5 15.500l.700 2.3 2.3.700-2.3.700-.700 2.3-.700-2.3-2.3-.700 2.3-.700z",
  upload: "M12 15.500V4.500M7.5 9 12 4.5 16.5 9M4.5 15.500V18a1.5 1.5 0 0 0 1.5 1.500h12a1.5 1.5 0 0 0 1.5-1.500v-2.5",
  calendar: "M5 6.500h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.500a1 1 0 0 1 1-1zM4 10.500h16M8 4v4M16 4v4",
  compass: "M12 20.500a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM15.5 8.500l-2 5-5 2 2-5z",
  bell: "M6.5 16.500V11a5.5 5.5 0 0 1 11 0v5.500l1.5 1.500H5zM10 20.500h4",
  flag: "M5.5 20.500V4.500M5.5 5.500h11l-2 3.5 2 3.500h-11",
  coins: "M9 12.500c3 0 5.5-1.1 5.5-2.500S12 7.5 9 7.5 3.5 8.6 3.5 10 6 12.5 9 12.500zM3.5 10v4c0 1.4 2.5 2.5 5.5 2.500s5.5-1.1 5.5-2.500v-4M14.5 11.600c3.4.2 6 1.3 6 2.7 0 1.5-2.7 2.7-6 2.700M20.5 14.300V18c0 1.4-2.5 2.5-5.5 2.5-1.7 0-3.2-.300-4.2-.900",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, label, className }: { name: IconName; size?: number; label?: string; className?: string }) {
  return (
    <svg className={`icon${className ? ` ${className}` : ""}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={PATHS[name]} />
    </svg>
  );
}
