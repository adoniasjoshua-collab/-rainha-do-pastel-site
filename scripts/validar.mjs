// Validações sem navegador: regras de negócio, WhatsApp, SEO e peso. Use --producao antes de publicar.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import '../src/js/regras.js';

const R = globalThis.Regras;
const raiz = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(raiz, 'dist');
const negocio = JSON.parse(fs.readFileSync(path.join(raiz, 'data/negocio.json'), 'utf8'));
const cardapio = JSON.parse(fs.readFileSync(path.join(raiz, 'data/cardapio.json'), 'utf8'));
// Valores fixos para testar a lógica; mudar preço no cardápio não deve quebrar estes testes.
const REGRA_TESTE = { avulso: 1500, dupla: 2500 };
const dados = { negocio: { ...negocio, entrega: { ...negocio.entrega, taxa: 700 } }, regraPastel: REGRA_TESTE,
  itens: cardapio.itens.map(i => ({ ...i, regraPar: !!i.regraPar, preco: i.regraPar ? 1500 : i.id === 'coca-lata' ? 600 : i.id === 'caixinha-personalizada' ? 1000 : i.preco })) };
const producao = process.argv.includes('--producao');
let ok = 0; const falhas = [];
const checar = (cond, nome) => { if (cond) ok++; else falhas.push(nome); };
const igual = (a, b, nome) => checar(a === b, `${nome} (veio ${JSON.stringify(a)}, esperado ${JSON.stringify(b)})`);

// Tabela de preços da seção 3, com recheios misturados.
const TABELA = { 1: 1500, 2: 2500, 3: 4000, 4: 5000, 5: 6500, 6: 7500 };
const RECHEIOS = ['carne-queijo', 'frango-queijo', 'presunto-queijo'];
for (const [n, v] of Object.entries(TABELA)) {
  const c = {}; for (let i = 0; i < Number(n); i++) { const r = RECHEIOS[i % 3]; c[r] = (c[r] || 0) + 1; }
  igual(R.calcular(c, dados, 'retirada').produtos, v, `Tabela ${n} pastéis`);
}
const ctx = (extra = {}) => ({ codigo: 'Z4K7', origem: '', regra: REGRA_TESTE, rotuloEntrega: negocio.entrega.rotulo, ...extra });
const cli = (e = {}) => ({ nome: 'Ana', endereco: 'Rua A, 10', pagamento: 'Dinheiro', ehDinheiro: true, troco: '100', quando: 'agora', dia: 'hoje', hora: '', obs: '', ...e });
const exemplo = { 'carne-queijo': 2, 'frango-queijo': 1, 'coca-lata': 1 };

// Taxa e totais.
const ent = R.calcular(exemplo, dados, 'entrega'), ret = R.calcular(exemplo, dados, 'retirada');
igual(ent.taxa, 700, 'Taxa cobrada uma vez'); igual(ent.total, 5300, 'Total da entrega'); igual(ret.taxa, 0, 'Retirada zera taxa'); igual(ret.total, 4600, 'Total da retirada');
igual(R.calcular({}, dados, 'entrega').total, 0, 'Vazio não cobra taxa');

// Item esgotado e "Pedir de novo" com preço atual.
const alterado = { ...dados, itens: dados.itens.map(i => i.id === 'coca-lata' ? { ...i, preco: 700 } : i.id === 'frango-queijo' ? { ...i, disponivel: false } : i) };
const refeito = R.calcular(exemplo, alterado, 'retirada');
checar(!refeito.linhas.some(l => l.item.id === 'frango-queijo'), 'Item esgotado não entra');
igual(refeito.produtos, 2500 + 700, 'Pedir de novo usa preço atual');

// Mensagem igual ao modelo.
const msg = R.mensagem(ent, cli(), ctx(), false);
const esperado = `Olá! Quero fazer este pedido:

✅ *ENTREGA* · 3 pastelões
Pedido Z4K7
━━━━━━━━━━━━━━

*PASTELÕES*
⭐ 2× Carne com queijo
⭐ 1× Frango com queijo
▸ 1 dupla × R$ 25,00 + 1 avulso × R$ 15,00 = R$ 40,00

*BEBIDAS E ADICIONAIS*
➕ 1× Coca lata gelada: R$ 6,00

━━━━━━━━━━━━━━
*VALORES*
Produtos: R$ 46,00
Entrega na zona urbana: R$ 7,00
▶ *TOTAL: R$ 53,00*

*DADOS DO CLIENTE*
▸ Nome: Ana
▸ Endereço: Rua A, 10
▸ Pagamento: Dinheiro (troco para R$ 100)
⏰ Horário: o quanto antes

Pode confirmar a disponibilidade e o horário?
_Origem: site · inicial_`;
igual(msg, esperado, 'Mensagem no formato combinado');

// WhatsApp: nada acima de U+FFFF, mesmo com emoji digitado pelo cliente.
const semAstral = t => ![...t].some(ch => ch.codePointAt(0) > 0xFFFF);
const comEmoji = R.mensagem(ent, cli({ nome: 'Ana 🥟', endereco: 'Rua 🛵 A & B #10 + casa', obs: 'Sem 💵 troco\nLinha 2' }), ctx(), false);
checar(semAstral(comEmoji), 'Sem caractere acima de U+FFFF');
const u = new URL(R.linkWhatsApp(negocio.whatsapp, comEmoji));
igual(u.searchParams.get('text'), comEmoji, 'Codificação ida e volta');
checar(comEmoji.includes('Rua A & B #10 + casa'), 'Acentos e símbolos preservados');
checar(!u.href.includes('utm_'), 'Sem UTM no wa.me');

// Caixinha personalizada.
const comCaixa = R.calcular({ 'carne-queijo': 1, 'caixinha-personalizada': 1 }, dados, 'entrega');
igual(comCaixa.total, 1500 + 1000 + 700, 'Caixinha soma R$ 10');
const msgCaixa = R.mensagem(comCaixa, cli({ personalizacao: 'Para Ana 💝 com carinho' }), ctx(), false);
checar(msgCaixa.includes('➕ 1× Caixinha personalizada: R$ 10,00') && msgCaixa.includes('✨ Na caixinha: Para Ana com carinho'), 'Caixinha e mensagem no pedido');
checar(semAstral(msgCaixa), 'Mensagem da caixinha sem emoji de 4 bytes');

// Pedido grande.
const grande = {}; dados.itens.forEach(i => { grande[i.id] = 2; }); grande['carne-queijo'] = 8;
const pg = R.calcular(grande, dados, 'entrega');
const eg = R.montarEnvio(negocio.whatsapp, pg, cli({ obs: 'x'.repeat(300) }), ctx());
checar(eg.link.length <= R.LIMITE_URL, `Pedido grande cabe no link (${eg.link.length})`);
pg.linhas.forEach(l => checar(eg.texto.includes(l.item.nome), `Pedido grande mantém ${l.item.nome}`));
checar(eg.texto.includes(R.moeda(pg.total)), 'Pedido grande mantém total');
const muitos = { ...dados, itens: Array.from({ length: 120 }, (_, i) => ({ id: 'i' + i, categoria: 'bebidas', nome: 'Item de nome bem comprido número ' + i, detalhe: 'x', preco: 100, disponivel: true, regraPar: false })) };
const cm = {}; muitos.itens.forEach(i => { cm[i.id] = 1; });
const em = R.montarEnvio(negocio.whatsapp, R.calcular(cm, muitos, 'entrega'), cli(), ctx());
checar(em.resumido, 'Link longo demais vira resumo controlado');
checar(em.texto.includes('TOTAL'), 'Resumo mantém total');

// Horários em Belém (UTC-3), incluindo virada de dia.
const h = { seg: [['18:00', '23:00']], sex: [['18:00', '02:00']] };
const st = iso => R.statusLoja(h, new Date(iso));
igual(R.statusLoja(null, new Date()).estado, 'desconhecido', 'Sem horário não afirma nada');
igual(st('2026-11-09T22:00:00Z').estado, 'aberto', 'Segunda 19h aberto');
igual(st('2026-11-10T02:30:00Z').estado, 'fechado', 'Segunda 23h30 fechado');
igual(st('2026-11-14T04:30:00Z').estado, 'aberto', 'Sexta para sábado 01h30 aberto');
igual(st('2026-11-14T05:30:00Z').estado, 'fechado', 'Sábado 02h30 fechado');
igual(st('2026-11-09T12:00:00Z').abre, '18:00', 'Fechado informa quando abre');
checar(/^Z[A-Z2-9]{3}$/.test(R.codigoPedido(Math.random)), 'Código do pedido');

// SEO e arquivos gerados.
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const tag = re => (html.match(re) || [])[1] || '';
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const titulo = decode(tag(/<title>([^<]*)<\/title>/)), desc = decode(tag(/name="description" content="([^"]*)"/));
checar(titulo && titulo.length <= 60, `Title até 60 (${titulo.length})`);
checar(desc && desc.length <= 155, `Description até 155 (${desc.length})`);
igual((html.match(/<h1[ >]/g) || []).length, 1, 'H1 único');
igual(tag(/rel="canonical" href="([^"]*)"/), negocio.dominio + '/', 'Canonical absoluto');
for (const p of ['og:title', 'og:description', 'og:image', 'og:url']) checar(html.includes(`property="${p}"`), p);
const ld = JSON.parse(tag(/<script type="application\/ld\+json">(.*?)<\/script>/s));
const menu = ld['@graph'].find(g => g['@type'] === 'Menu');
const secoes = menu.hasMenuSection.flatMap(s => s.hasMenuItem);
checar(secoes.length > 0, 'JSON-LD com itens');
for (const m of secoes) {
  const item = cardapio.itens.find(i => (i.nome === m.name || m.name === `${i.nome} (${i.detalhe})`));
  checar(item && Number(m.offers.price) * 100 === item.preco, `JSON-LD preço ${m.name}`);
  checar(item && html.includes(`<span class="preco">${R.curto(item.preco)}</span>`), `Preço visível ${m.name}`);
}
const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
igual((sitemap.match(/<loc>/g) || []).length, 1, 'Sitemap só com página indexável');
checar(!sitemap.includes('privacidade'), 'Sitemap sem noindex');
checar(fs.readFileSync(path.join(dist, 'privacidade/index.html'), 'utf8').includes('noindex'), 'Privacidade noindex');
checar(fs.statSync(path.join(dist, 'img/compartilhar.jpg')).size <= 300 * 1024, 'og:image até 300 KB');
for (const m of html.matchAll(/(?:src|srcset|href)="(\/(?:img|assets)\/[^" ]+)/g)) checar(fs.existsSync(path.join(dist, m[1])), `Arquivo existe ${m[1]}`);

// Termos proibidos em tudo o que vai para o ar.
function arquivos(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? arquivos(path.join(d, e.name)) : [path.join(d, e.name)]); }
const textos = arquivos(dist).filter(f => /\.(html|js|xml|txt|webmanifest)$/.test(f));
const temTeor = cardapio.itens.some(i => /0,0\s*%/.test(i.teorRotulo || ''));
for (const f of textos) {
  const t = fs.readFileSync(f, 'utf8'), n = path.relative(dist, f);
  checar(!/aggregateRating|"review"/.test(t), `Sem avaliação inventada em ${n}`);
  checar(!t.includes('[CONFIRMAR]'), `Sem [CONFIRMAR] em ${n}`);
  checar(!/#7a2f55|Zadoni Presentes/i.test(t), `Sem marca da loja de presentes em ${n}`);
  for (const m of t.matchAll(/espumante/gi)) checar(/sem álcool/i.test(t.slice(m.index, m.index + 40)), `"espumante" sem "sem álcool" em ${n}`);
  if (!temTeor) checar(!/0,0\s*%/.test(t), `"0,0%" sem rótulo em ${n}`);
}
const emojiJs = fs.readFileSync(path.join(raiz, 'src/js/regras.js'), 'utf8');
checar(semAstral(emojiJs), 'Código da mensagem sem emoji de 4 bytes');

// Peso.
const gz = t => zlib.gzipSync(t, { level: 9 }).length;
const js = textos.find(f => /assets[\\/]app\./.test(f));
const kbTexto = (gz(html) + gz(fs.readFileSync(js))) / 1024;
const imgs = fs.readdirSync(path.join(dist, 'img'));
const hero = fs.statSync(path.join(dist, 'img', imgs.find(f => /^cesta-dois-pasteis-480.*avif$/.test(f)))).size / 1024;
checar(kbTexto <= 60, `HTML+CSS+JS até 60 KB (${kbTexto.toFixed(1)})`);
console.log(`Peso comprimido HTML+CSS+JS: ${kbTexto.toFixed(1)} KB · foto principal (celular): ${hero.toFixed(1)} KB`);

if (producao) {
  checar(!!negocio.legal, 'Produção: falta razão social e CNPJ em negocio.json (legal)');
}
console.log(`${ok} verificações passaram · ${falhas.length} falharam`);
if (falhas.length) { console.error('FALHAS:\n- ' + falhas.join('\n- ')); process.exit(1); }
