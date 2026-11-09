// Servidor simples para ver dist/ no computador ou no celular na mesma rede Wi-Fi.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };

export function servir(porta = 8080) {
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.normalize(path.join(dist, p));
    if (!f.startsWith(path.normalize(dist))) { res.writeHead(403).end(); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    let codigo = 200;
    if (!fs.existsSync(f)) { f = path.join(dist, '404.html'); codigo = 404; }
    res.writeHead(codigo, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(ok => srv.listen(porta, '0.0.0.0', () => ok(srv)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const porta = Number(process.argv[2]) || 8080;
  await servir(porta);
  console.log(`Prévia no computador: http://localhost:${porta}/`);
  for (const lista of Object.values(os.networkInterfaces())) for (const a of lista) if (a.family === 'IPv4' && !a.internal) console.log(`No celular, mesma rede: http://${a.address}:${porta}/`);
}
