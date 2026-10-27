const paths = {
  flag: '<path d="M5 21V3m0 1c5-3 9 3 14 0v10c-5 3-9-3-14 0"/>',
  scan: '<path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M4 12h16"/>',
  qr: '<path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h3v3h-3zm3 3h3v3h-3zM12 3v6m0 3h9m-9 0v9"/>',
  edit: '<path d="m15 5 4 4M4 20l4-1L20 7a3 3 0 0 0-4-4L4 15z"/>',

  home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 21v-8h6v8"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8Z"/><path d="M8 10h8M8 14h5"/>',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m9 3-.8 2.3-2 .9-2.3-.3-1.8 3.2 1.5 1.9v2l-1.5 1.9 1.8 3.2 2.3-.3 2 .9L9 21h6l.8-2.3 2-.9 2.3.3 1.8-3.2-1.5-1.9v-2l1.5-1.9-1.8-3.2-2.3.3-2-.9L15 3Z"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/>',
  share: '<path d="M12 16V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  bellOff: '<path d="m3 3 18 18M10 21h4M6.4 6.4A6 6 0 0 0 6 8c0 7-3 7-3 9h14M10 2.4A6 6 0 0 1 18 8c0 2 .3 3.5.7 4.6"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  send: '<path d="m21 3-7 18-4-7-7-4L21 3Zm0 0L10 14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  leaf: '<path d="M20 4c-8-2-15 2-15 8a6 6 0 0 0 6 6c6 0 9-7 9-14ZM4 21l10-10"/>',
  business: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a20 20 0 0 0 18 0M12 11v4"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};

export function icon(name, className = '') {
  return `<svg class="${className}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.info}</svg>`;
}
