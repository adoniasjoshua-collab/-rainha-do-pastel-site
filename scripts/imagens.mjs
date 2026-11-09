// Gera AVIF e WebP em 480 e 960 px, a imagem de compartilhamento e os ícones.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const LARGURAS = [480, 960];
const COROA = (cor, fundo) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${fundo}"/><path fill="${cor}" d="M96 366 64 170l112 84 80-132 80 132 112-84-32 196z"/><rect x="96" y="384" width="320" height="34" rx="10" fill="${cor}"/></svg>`;

export async function gerarFotos(raiz, fotos, destino) {
  fs.mkdirSync(destino, { recursive: true });
  const mapa = {};
  for (const [nome, foto] of Object.entries(fotos)) {
    const origem = path.join(raiz, 'assets-src/fotos', foto.arquivo);
    if (!fs.existsSync(origem)) throw new Error(`Imagem ausente: ${foto.arquivo}`);
    const bytes = fs.readFileSync(origem);
    const hash = crypto.createHash('sha1').update(bytes).update(JSON.stringify(foto.recorte || {})).digest('hex').slice(0, 8);
    const base = () => foto.recorte ? sharp(bytes).extract(foto.recorte) : sharp(bytes);
    const meta = foto.recorte ? foto.recorte : await sharp(bytes).metadata();
    const proporcao = meta.height / meta.width;
    const larguras = foto.miniatura ? [168, 336] : LARGURAS;
    const maior = larguras[1];
    const item = { alt: foto.alt, largura: maior, altura: foto.miniatura ? maior : Math.round(maior * proporcao), avif: [], webp: [] };
    const medida = w => foto.miniatura ? { width: w, height: w, fit: foto.ajuste || 'cover', background: '#ffffff' } : { width: w };
    for (const w of larguras) {
      const a = `${nome}-${w}-${hash}.avif`, b = `${nome}-${w}-${hash}.webp`;
      await base().resize(medida(w)).avif({ quality: 52, effort: 4 }).toFile(path.join(destino, a));
      await base().resize(medida(w)).webp({ quality: 72 }).toFile(path.join(destino, b));
      item.avif.push([a, w]); item.webp.push([b, w]);
    }
    mapa[nome] = item;
  }
  return mapa;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export async function gerarSocial(raiz, foto, arquivoDestino, linhas) {
  const origem = path.join(raiz, 'assets-src/fotos', foto.arquivo);
  const img = await sharp(origem).resize(630, 630, { fit: 'cover' }).toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="570" height="630">
  <rect width="570" height="630" fill="#17100b"/>
  <text x="44" y="120" font-family="Arial Narrow, Arial, sans-serif" font-weight="700" font-size="46" fill="#ffc233">${esc(linhas.marca)}</text>
  <text x="44" y="230" font-family="Arial, sans-serif" font-weight="900" font-size="66" fill="#fff5e4">PASTELÃO</text>
  <text x="44" y="290" font-family="Arial, sans-serif" font-size="32" fill="#fff5e4">${esc(linhas.cidade)}</text>
  <text x="44" y="400" font-family="Arial, sans-serif" font-weight="900" font-size="56" fill="#ffc233">${esc(linhas.oferta1)}</text>
  <text x="44" y="470" font-family="Arial, sans-serif" font-weight="900" font-size="56" fill="#ffc233">${esc(linhas.oferta2)}</text>
  <text x="44" y="570" font-family="Arial, sans-serif" font-size="26" fill="#d5c3aa">Bebida vendida à parte</text></svg>`;
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#17100b' } })
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }, { input: img, left: 570, top: 0 }])
    .jpeg({ quality: 82, mozjpeg: true }).toFile(arquivoDestino);
}

export async function gerarIcones(destino) {
  fs.writeFileSync(path.join(destino, 'favicon.svg'), COROA('#ffc233', '#17100b'));
  for (const t of [180, 192, 512]) {
    await sharp(Buffer.from(COROA('#ffc233', '#17100b'))).resize(t, t).png().toFile(path.join(destino, `icone-${t}.png`));
  }
}
