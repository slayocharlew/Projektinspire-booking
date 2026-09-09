import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const port = Number(process.env.BOOKING_PREVIEW_PORT || 8010);
const apiUrl = new URL(process.env.BOOKING_API_URL || 'http://127.0.0.1:8000/api/booking/v1');
if (!['http:', 'https:'].includes(apiUrl.protocol) || apiUrl.username || apiUrl.password) throw new Error('BOOKING_API_URL must be a public HTTP(S) URL without credentials.');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; connect-src ${apiUrl.origin}; form-action 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${apiUrl.origin}; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; frame-ancestors 'none'`);
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Submit bookings through the configured Laravel API.');
    return;
  }
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const route = path.replace(/\/index\.html$/, '').replace(/\/$/, '') || '/';
    const redirects = { '/': '/programs', '/lookup': '/programs', '/schedule': '/programs',
      '/book/individual-visit': '/book/stem-park-visit', '/book/group-visit': '/book/stem-park-visit',
      '/book/school-visit': '/book/stem-park-visit', '/book/birthday-visit': '/book/stem-themed-events' };
    if (Object.hasOwn(redirects, route)) {
      response.writeHead(302, { Location: redirects[route] });
      response.end();
      return;
    }
    const bookingMatch = route.match(/^\/book\/([^/]+)$/);
    if (route === '/admin' || route === '/admin/login' || route === '/login') {
      response.writeHead(302, { Location: new URL('/login', apiUrl).href }); response.end(); return;
    }
    if (route === '/programs' || bookingMatch) path = '/programs/index.html';
    else if (!extname(path)) path = path.replace(/\/$/, '') + '/index.html';
    if (extname(path) === '.js' && !['/assets/app.js', '/assets/programmes.js', '/assets/booking.js', '/assets/calendar.js', '/assets/api.js'].includes(path)) {
      response.writeHead(404); response.end('Script not found.'); return;
    }
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root.replace(/\/$/, '') + sep) || !types[extname(file)]) {
      response.writeHead(404);
      response.end('Page not captured.');
      return;
    }
    let content = await readFile(file);
    if (path === '/programs/index.html') content = Buffer.from(content.toString().replace('https://projektinspire.co.tz/api/booking/v1', apiUrl.href.replace(/\/$/, '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')));
    response.writeHead(200, { 'Content-Type': types[extname(file)] });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('This page is not part of the recovered design reference.');
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    process.stderr.write(`Port ${port} is in use. Try: BOOKING_PREVIEW_PORT=${port + 1} npm start\n`);
  } else {
    process.stderr.write(error.message + '\n');
  }
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Booking frontend: http://127.0.0.1:${port}\nLaravel API: ${apiUrl.href}\nSubmissions are saved in the configured backend.\n`);
});
