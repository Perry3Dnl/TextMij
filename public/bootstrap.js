if (new URLSearchParams(location.search).get('preview') === '1') {
  await import('./app.js');
} else {
  await import('./live-app.js');
}
