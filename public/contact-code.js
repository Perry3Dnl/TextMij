export function contactCode(value, origin) {
  if (typeof value !== 'string' || value.length > 500) return null;
  let code = value.trim().toUpperCase().replace(/[–—]/g,'-').replace(/\s/g,'');
  if (!/^[0-9]{4}-[A-Z]{3}-[A-Z]{3}$/.test(code)) {
    try {
      const url = new URL(value.trim());
      if (url.origin !== origin || !url.hash.startsWith('#connect/')) return null;
      code = decodeURIComponent(url.hash.slice('#connect/'.length)).toUpperCase();
    } catch { return null; }
  }
  return /^[0-9]{4}-[A-Z]{3}-[A-Z]{3}$/.test(code) ? code : null;
}
