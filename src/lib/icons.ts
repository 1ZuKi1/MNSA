/** Line icon paths (24×24 viewBox, drawn with stroke = currentColor). Rendered by components/Icon.astro. */
export const ICONS = {
  // three people, shoulder to shoulder
  unity: '<circle cx="12" cy="7" r="3"/><circle cx="5" cy="9" r="2.4"/><circle cx="19" cy="9" r="2.4"/><path d="M6.5 20v-2.5a5.5 5.5 0 0 1 11 0V20"/><path d="M1.5 19v-1.2a3.6 3.6 0 0 1 4.3-3.5M22.5 19v-1.2a3.6 3.6 0 0 0-4.3-3.5"/>',
  // a hand holding up a heart
  support: '<path d="M12 11.5s-4-2.4-4-5.1A2.3 2.3 0 0 1 12 5a2.3 2.3 0 0 1 4 1.4c0 2.7-4 5.1-4 5.1z"/><path d="M3 14.5h3.2l3.3 1.4h4.1a1.6 1.6 0 0 1 0 3.2H9.8"/><path d="M13.6 19.1l5.2-2.6a1.7 1.7 0 0 1 2.2 2.3l-.3.4-6.7 3.3H6.2L3 21"/>',
  // a ger under a sun
  culture: '<path d="M3 20h18"/><path d="M4.5 20v-6.5L12 9l7.5 4.5V20"/><path d="M4.5 13.5h15"/><path d="M10 20v-4.5h4V20"/><circle cx="12" cy="4" r="1.6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
  camera: '<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.8"/><path d="M8.5 6l1.4-2.2h4.2L15.5 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  handshake: '<path d="M2.5 12l4-4 3.2 1.2L13 7l3 1 5.5 4.5"/><path d="M6.5 8L4 15.5l3 2.5M21.5 12.5L18 16l-3 2-4.5-3"/><path d="M9.8 16.5l1.8 1.5M12.6 14.6l2.2 1.8"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  // workspace
  home: '<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.4l2 2h8.6A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1a6 6 0 0 1 12 0v1"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.2a5.5 5.5 0 0 1 3 4.8v1"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  logout: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 16.5L5.5 12 10 7.5M5.5 12H15"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  hand: '<path d="M8 13V5.8a1.4 1.4 0 0 1 2.8 0V12"/><path d="M10.8 11V4.4a1.4 1.4 0 0 1 2.8 0V11"/><path d="M13.6 11V5.6a1.4 1.4 0 0 1 2.8 0V12"/><path d="M16.4 12V8.6a1.4 1.4 0 0 1 2.8 0V14a7 7 0 0 1-7 7h-.6a6.5 6.5 0 0 1-5.2-2.6L4 15.4a1.4 1.4 0 0 1 2.2-1.7L8 15.6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.5"/>',
  inbox: '<path d="M3.5 13.5L6 5h12l2.5 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M3.5 13.5H9l1 2h4l1-2h5.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="1.5"/><path d="M7 14h10v6.5H7z"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  // a rubber stamp
  stamp: '<path d="M9.5 3.5h5a1 1 0 0 1 1 1v1.2c0 1.4-1.5 2.4-1.5 4.3v1.5h4a2 2 0 0 1 2 2V16H4v-2.5a2 2 0 0 1 2-2h4V10c0-1.9-1.5-2.9-1.5-4.3V4.5a1 1 0 0 1 1-1z"/><path d="M5 20h14"/>',
  download: '<path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M21 15.5l-5-5-9.5 9"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5v-1a7.5 7.5 0 0 1 15 0v1"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5S9.6 5.8 12 3.5z"/>',
} as const;

export type IconName = keyof typeof ICONS;
