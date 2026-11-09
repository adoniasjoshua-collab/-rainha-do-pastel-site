// Gera dist/ a partir de data/ e src/. Falha se algum dado obrigatório estiver errado.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { gerarFotos, gerarSocial, gerarIcones } from './imagens.mjs';
import '../src/js/regras.js';

const R = globalThis.Regras;
const raiz = fileURLToPath(new URL('../', import.meta.url));
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8');
const textoNegocio = ler('data/negocio.json');
const negocio = JSON.parse(textoNegocio);
const cardapio = JSON.parse(ler('data/cardapio.json'));
const fotos = JSON.parse(ler('data/fotos.json'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = v => JSON.stringify(v).replace(/</g, '\\u003c');

// Regras que impedem publicar dado errado.
const erros = [];
if (textoNegocio.includes('[CONFIRMAR]')) erros.push('negocio.json ainda tem [CONFIRMAR]');
for (const i of cardapio.itens) {
  if (i.disponivel && !(Number.isInteger(i.preco) && i.preco > 0)) erros.push(`${i.id}: item disponível sem preço em centavos`);
  if (i.imagem && !fotos[i.imagem]) erros.push(`${i.id}: imagem "${i.imagem}" não existe em fotos.json`);
  if (i.categoria === 'espumantes' && !i.teorRotulo) erros.push(`${i.id}: espumante sem teorRotulo`);
  if (!cardapio.categorias.some(c => c.id === i.categoria)) erros.push(`${i.id}: categoria inexistente`);
}
for (const e of cardapio.esteira) if (!cardapio.itens.some(i => i.id === e.item)) erros.push(`esteira: item "${e.item}" não existe`);
if (erros.length) { console.error('BUILD FALHOU:\n- ' + erros.join('\n- ')); process.exit(1); }

const dist = path.join(raiz, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });

const { dupla, avulso } = cardapio.regraPastel;
const taxa = negocio.entrega.taxa;
const url = negocio.dominio + '/';
const site = negocio.nome;
const mapa = await gerarFotos(raiz, fotos, path.join(dist, 'img'));
await gerarSocial(raiz, { arquivo: fotos['cesta-dois-pasteis'].arquivo }, path.join(dist, 'img/compartilhar.jpg'), {
  marca: site, cidade: `Delivery em ${negocio.cidade}`, oferta1: `1 por ${R.curto(avulso)}`, oferta2: `2 por ${R.curto(dupla)}`
});
await gerarIcones(path.join(dist, 'assets'));

const hash = t => crypto.createHash('sha1').update(t).digest('hex').slice(0, 10);
const js = ler('src/js/regras.js') + '\n' + ler('src/js/app.js');
const arquivoJs = `app.${hash(js)}.js`;
fs.writeFileSync(path.join(dist, 'assets', arquivoJs), js);
const css = ler('src/css/site.css');

const srcset = (lista) => lista.map(([a, w]) => `/img/${a} ${w}w`).join(', ');
function picture(nome, sizes, attrs = 'loading="lazy" decoding="async"') {
  const f = mapa[nome];
  return `<picture><source type="image/avif" srcset="${srcset(f.avif)}" sizes="${sizes}"><source type="image/webp" srcset="${srcset(f.webp)}" sizes="${sizes}"><img src="/img/${f.webp[1][0]}" width="${f.largura}" height="${f.altura}" alt="${esc(f.alt)}" ${attrs}></picture>`;
}

const nomesRep = {};
cardapio.itens.forEach(i => { nomesRep[i.nome] = (nomesRep[i.nome] || 0) + 1; });
const rotuloItem = i => i.nome + (nomesRep[i.nome] > 1 ? ` (${i.detalhe})` : '');

function controle(i) {
  if (!i.disponivel) return '<span class="esgotado">Esgotado</span>';
  const n = esc(rotuloItem(i));
  return `<div class="ctrl so-com-js"><button type="button" class="add" data-add="${i.id}" aria-label="Adicionar ${n}">Adicionar</button><div class="stepper" hidden><button type="button" data-menos="${i.id}" aria-label="Tirar 1 ${n}">−</button><span class="q" aria-live="polite">0</span><button type="button" data-mais="${i.id}" aria-label="Pôr mais 1 ${n}">+</button></div></div>`;
}
function cartaoFoto(i) {
  return `<article class="card${i.disponivel ? '' : ' off'}" data-item="${i.id}">${picture(i.imagem, '(min-width:720px) 340px, calc(100vw - 32px)')}<div class="card-c"><h3>${esc(i.nome)}<span class="detalhe">${esc(i.detalhe)}</span></h3><span class="preco">${R.curto(i.preco)}</span>${controle(i)}</div></article>`;
}
function ficha(i) {
  return `<article class="ficha${i.disponivel ? '' : ' off'}" data-item="${i.id}"><h3>${esc(i.nome)}<span class="detalhe">${esc(i.detalhe)}</span></h3><span class="preco">${R.curto(i.preco)}</span>${controle(i)}</article>`;
}
// Categoria sem item com preço real não aparece.
const categorias = cardapio.categorias.map(c => ({ ...c, itens: cardapio.itens.filter(i => i.categoria === c.id && (i.preco > 0)) })).filter(c => c.itens.length);

const linkDireto = R.linkWhatsApp(negocio.whatsapp, 'Olá! Quero fazer um pedido.');

function secaoMenu(c) {
  const comFoto = c.itens.filter(i => i.imagem), semFoto = c.itens.filter(i => !i.imagem);
  const nota = c.id === 'pasteis' ? `<p class="nota">1 pastelão <strong>${R.curto(avulso)}</strong>. Cada 2, de qualquer recheio, <strong>${R.curto(dupla)}</strong>. O desconto entra sozinho. Fotos ilustrativas, bebida vendida à parte.</p>` : '';
  return `<section class="secao" id="${c.id}" aria-labelledby="t-${c.id}"><h2 id="t-${c.id}">${esc(c.nome)}</h2>${nota}${comFoto.length ? `<div class="fotos">${comFoto.map(cartaoFoto).join('')}</div>` : ''}${semFoto.length ? `<div class="lista">${semFoto.map(ficha).join('')}</div>` : ''}</section>`;
}
const areaTexto = negocio.entrega.area;
const pagamentos = negocio.pagamentos.map(p => p.nome.replace('Cartão de crédito pelo link InfinityPay', 'cartão de crédito pelo link InfinityPay')).join(', ').replace(/, ([^,]*)$/, ' ou $1');
const faq = [
  ['Quanto custa o pastelão?', `1 pastelão sai por ${R.curto(avulso)}. Cada 2, com qualquer recheio, saem por ${R.curto(dupla)}. Três ficam ${R.curto(R.precoPasteis(3, cardapio.regraPastel))} e quatro, ${R.curto(R.precoPasteis(4, cardapio.regraPastel))}.`],
  ['Vem bebida junto?', 'Não. Coca lata e sucos naturais são vendidos à parte e entram no mesmo pedido.'],
  ['Quanto é a entrega em Canaã dos Carajás?', `${R.curto(taxa)} por pedido, cobrados uma única vez, em ${areaTexto}.`],
  ['Posso retirar?', `Sim, ${negocio.retirada.charAt(0).toLowerCase() + negocio.retirada.slice(1)}`],
  ['Como posso pagar?', `${pagamentos.charAt(0).toUpperCase() + pagamentos.slice(1)}. Se for dinheiro, é só avisar o troco.`]
];

function comanda() {
  const pags = negocio.pagamentos.map(p => `<label><input type="radio" name="pagamento" value="${p.id}">${esc(p.id === 'credito' ? 'Cartão de crédito' : p.nome)}${p.id === 'credito' ? '<small>pelo link InfinityPay</small>' : ''}</label>`).join('');
  return `<dialog class="comanda" id="comanda" aria-labelledby="t-comanda"><div class="ticket"><div class="t-topo"><h2 id="t-comanda">Sua comanda<small id="t-codigo"></small></h2><button type="button" id="fechar" aria-label="Fechar comanda e voltar ao cardápio">×</button></div><div id="t-linhas"></div><p class="t-par" id="t-par" hidden></p><div class="sug" id="sug-esteira" hidden></div><div class="t-totais" id="t-totais" aria-live="polite" aria-atomic="true"></div></div>
<form class="form" id="form-pedido" novalidate>
<fieldset><legend>Como quer receber?</legend><div class="opcoes"><label><input type="radio" name="tipo" value="entrega" checked>Entrega<small>${R.curto(taxa)} por pedido</small></label><label><input type="radio" name="tipo" value="retirada">Retirada<small>sem taxa</small></label></div></fieldset>
<div class="campo" id="campo-endereco"><label class="tit" for="endereco">Endereço e ponto de referência</label><textarea id="endereco" name="endereco" rows="2" maxlength="200" autocomplete="street-address" aria-describedby="erro-endereco"></textarea><p class="erro" id="erro-endereco" role="alert" hidden>Falta o endereço para a entrega.</p></div>
<div class="campo"><label class="tit" for="nome">Nome <small>(opcional)</small></label><input type="text" id="nome" name="nome" maxlength="60" autocomplete="name"></div>
<fieldset><legend>Pagamento <small>(opcional)</small></legend><div class="opcoes">${pags}</div></fieldset>
<div class="campo" id="campo-troco" hidden><label class="tit" for="troco">Troco para quanto?</label><input type="text" id="troco" name="troco" maxlength="12" inputmode="decimal" placeholder="Ex.: 100"></div>
<fieldset><legend>Quando?</legend><div class="opcoes"><label><input type="radio" name="quando" value="agora" checked>O quanto antes</label><label><input type="radio" name="quando" value="agendar">Agendar</label></div></fieldset>
<div class="campo dupla" id="campo-agendar" hidden><div><label class="tit" for="dia">Dia</label><select id="dia" name="dia"><option value="hoje">Hoje</option><option value="amanha">Amanhã</option></select></div><div><label class="tit" for="hora">Hora</label><input type="time" id="hora" name="hora"></div></div>
<div class="campo" id="campo-caixa" hidden><label class="tit" for="personalizacao">Nome ou mensagem na caixinha <small>(opcional)</small></label><textarea id="personalizacao" name="personalizacao" rows="2" maxlength="180"></textarea></div>
<div class="campo"><label class="tit" for="obs">Observação <small>(opcional)</small></label><textarea id="obs" name="obs" rows="2" maxlength="300"></textarea></div>
<label class="lembrar"><input type="checkbox" name="lembrar">Lembrar nome e endereço neste aparelho</label>
<button type="button" class="link-btn" id="apagar-dados" hidden>Apagar meus dados deste aparelho</button>
<details class="conferir"><summary>Conferir mensagem</summary><pre id="previa"></pre></details>
<a class="btn btn-wa" id="enviar" target="_blank" rel="noopener noreferrer">Enviar no WhatsApp</a>
<p class="linha-info" style="margin-top:10px">O atendente confirma disponibilidade e horário no WhatsApp. Tem alergia? Pergunte antes de pedir.</p>
<div class="pos" id="pos-envio" hidden><p>Abrimos o WhatsApp com seu pedido. Falta só tocar em enviar lá.</p><button type="button" class="btn" id="novo-pedido">Começar outro pedido</button></div>
</form></dialog>`;
}
const barra = `<div class="barra" id="barra" hidden><div class="cx"><p class="b-par" id="b-par" hidden></p><div class="sug" id="sug-bebida" hidden></div><button type="button" class="btn btn-barra" id="abrir"><span><span id="b-qtd"></span><small id="b-taxa"></small></span><span>Ver pedido</span><span id="b-total" aria-live="polite"></span></button></div></div>`;

const COROA = '<svg viewBox="0 0 512 400" aria-hidden="true"><path fill="currentColor" d="M96 306 64 110l112 84 80-132 80 132 112-84-32 196zM96 324h320v34H96z"/></svg>';
const topo = `<header class="cx topo"><a class="marca" href="/">${COROA}${esc(site)}</a><span class="cidade">Delivery em ${esc(negocio.cidade)}</span></header>`;

function rodape() {
  const l = negocio.legal;
  return `<footer class="rodape"><div class="cx"><p><strong>${esc(site)}</strong> · ${esc(negocio.cidade)}-${negocio.uf}</p>${l ? `<p>${esc(l.razaoSocial)} · ${esc(l.documento)}${l.endereco ? ' · ' + esc(l.endereco) : ''}${l.email ? ' · ' + esc(l.email) : ''}</p>` : ''}<p><a href="${esc(linkDireto)}" target="_blank" rel="noopener noreferrer">WhatsApp ${esc(negocio.telefoneVisivel)}</a>${negocio.instagram ? ` · <a href="https://www.instagram.com/${esc(negocio.instagram)}/" target="_blank" rel="noopener noreferrer">Instagram</a>` : ''} · <a href="/privacidade/">Privacidade</a></p></div></footer>`;
}

const brl = c => (c / 100).toFixed(2);
const precos = cardapio.itens.filter(i => i.disponivel).map(i => i.preco);
const NOMES_DIAS = { seg: 'Monday', ter: 'Tuesday', qua: 'Wednesday', qui: 'Thursday', sex: 'Friday', sab: 'Saturday', dom: 'Sunday' };
const restaurante = {
  '@type': 'FastFoodRestaurant', '@id': url + '#negocio', name: site, url, image: `${negocio.dominio}/img/compartilhar.jpg`,
  telephone: '+' + negocio.whatsapp, servesCuisine: ['Pastel', 'Lanches'],
  priceRange: `${R.moeda(Math.min(...precos))} a ${R.moeda(Math.max(...precos))}`,
  areaServed: { '@type': 'City', name: negocio.cidade }, hasMenu: { '@id': url + '#cardapio' }
};
if (negocio.legal && negocio.legal.endereco && negocio.legal.enderecoNoGoogle) restaurante.address = negocio.legal.enderecoNoGoogle;
if (negocio.horarios) {
  restaurante.openingHoursSpecification = Object.entries(negocio.horarios).flatMap(([d, turnos]) => turnos.map(([opens, closes]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: NOMES_DIAS[d], opens, closes })));
}
const menuLd = {
  '@type': 'Menu', '@id': url + '#cardapio', name: `Cardápio ${site}`, url: url + '#cardapio',
  hasMenuSection: categorias.map(c => ({ '@type': 'MenuSection', name: c.nome, hasMenuItem: c.itens.filter(i => i.disponivel).map(i => ({
    '@type': 'MenuItem', name: rotuloItem(i), description: i.detalhe, offers: { '@type': 'Offer', price: brl(i.preco), priceCurrency: 'BRL' }
  })) }))
};
const ldInicial = { '@context': 'https://schema.org', '@graph': [restaurante, menuLd] };

const dadosCliente = {
  negocio: { nome: site, whatsapp: negocio.whatsapp, entrega: negocio.entrega, pagamentos: negocio.pagamentos, horarios: negocio.horarios, medicao: negocio.medicao },
  regraPastel: cardapio.regraPastel, esteira: cardapio.esteira,
  nomesDias: { seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado', dom: 'domingo' },
  itens: cardapio.itens.filter(i => i.preco > 0).map(({ id, categoria, nome, detalhe, preco, disponivel, regraPar, personalizavel }) => ({ id, categoria, nome, detalhe, preco, disponivel, regraPar: !!regraPar, personalizavel: !!personalizavel }))
};

function pagina({ caminho, titulo, descricao, corpo, indexar = true, ld = null, comApp = false, preload = '' }) {
  const canon = negocio.dominio + caminho;
  const social = `${negocio.dominio}/img/compartilhar.jpg`;
  return `<!doctype html>
<html lang="pt-BR" class="no-js"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script>document.documentElement.className='js'</script>
<title>${esc(titulo)}</title><meta name="description" content="${esc(descricao)}">
${indexar ? `<link rel="canonical" href="${canon}">` : '<meta name="robots" content="noindex">'}
<meta name="theme-color" content="#17100b"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/assets/icone-180.png"><link rel="manifest" href="/manifest.webmanifest">
<meta property="og:type" content="website"><meta property="og:locale" content="pt_BR"><meta property="og:site_name" content="${esc(site)}"><meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}"><meta property="og:url" content="${canon}"><meta property="og:image" content="${social}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Dois pastelões em cesta, com os preços do ${esc(site)}"><meta name="twitter:card" content="summary_large_image">
${preload}<style>${css}</style>
${ld ? `<script type="application/ld+json">${json(ld)}</script>` : ''}
${comApp ? `<script src="/assets/${arquivoJs}" defer></script>` : ''}
</head><body>${corpo}</body></html>
`;
}

const h = mapa['cesta-dois-pasteis'];
const hsizes = '(min-width:720px) 500px, calc(100vw - 32px)';
const preload = `<link rel="preload" as="image" type="image/avif" imagesrcset="${srcset(h.avif)}" imagesizes="${hsizes}" fetchpriority="high">`;
const menuHtml = categorias.map(secaoMenu).join('');
const abas = categorias.length > 1 ? `<nav class="abas" aria-label="Categorias do cardápio"><ul class="cx">${categorias.map(c => `<li><a href="#${c.id}">${esc(c.nome)}</a></li>`).join('')}</ul></nav>` : '';
const semJs = `<p class="so-sem-js" style="margin-top:16px"><a class="btn btn-wa" href="${esc(linkDireto)}" target="_blank" rel="noopener noreferrer">Pedir pelo WhatsApp</a></p>`;
const cardapioHtml = `${abas}<div class="cx" id="cardapio"><div class="novo" id="novo" hidden><p><strong>Pedir de novo?</strong><span id="novo-resumo"></span></p><button type="button" class="mini" id="pedir-de-novo">Repetir</button></div>${semJs}${menuHtml}<p class="alergia"><strong>Tem alergia?</strong> Pergunte antes de pedir.</p></div>`;
const ajuda = `<section class="cx ajuda" aria-labelledby="t-ajuda"><h2 id="t-ajuda">Pastel delivery em ${esc(negocio.cidade)}</h2>${faq.map(([p, r], i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(p)}</summary><p>${esc(r)}</p></details>`).join('')}</section>`;
const heroTitulo = `Pastelão com muito queijo <span>em Canaã dos Carajás</span>`;
const inicial = `<a class="pular" href="#cardapio">Pular para o cardápio</a>${topo}<main><section class="cx hero"><div class="hero-texto"><p class="status" id="status-loja" hidden></p><h1>${heroTitulo}</h1><p class="oferta"><span>1 por <b>${R.curto(avulso)}</b></span><span>2 por <b>${R.curto(dupla)}</b></span></p><a class="btn" href="#pasteis">Escolher meu pastelão</a><p class="linha-info"><strong>Entrega ${R.curto(taxa)}</strong> na zona urbana. <strong>Retirada sem taxa.</strong></p></div><figure>${picture('cesta-dois-pasteis', hsizes, 'fetchpriority="high" decoding="async"')}<figcaption>Bebida vendida à parte</figcaption></figure></section>${cardapioHtml}${ajuda}</main>${rodape()}${barra}${comanda()}<script type="application/json" id="dados">${json(dadosCliente)}</script>`;

const titulo = `Pastel Delivery em ${negocio.cidade} | ${site}`;
const descricao = `Pastelão ${R.curto(avulso)}, 2 por ${R.curto(dupla)}. Entrega ${R.curto(taxa)} em ${negocio.cidade} ou retirada sem taxa. Monte o pedido e envie no WhatsApp.`;
fs.writeFileSync(path.join(dist, 'index.html'), pagina({ caminho: '/', titulo, descricao, corpo: inicial, ld: ldInicial, comApp: true, preload }));

const corpo404 = `${topo}<main><section class="cx" style="padding:10px 0 4px"><h1 style="font-size:2.2rem;color:var(--ouro)">Essa página não existe</h1><p class="nota">Mas o cardápio está aqui embaixo.</p></section>${cardapioHtml}</main>${rodape()}${barra}${comanda()}<script type="application/json" id="dados">${json(dadosCliente)}</script>`;
fs.writeFileSync(path.join(dist, '404.html'), pagina({ caminho: '/404.html', titulo: `Página não encontrada | ${site}`, descricao, corpo: corpo404, indexar: false, comApp: true }));

const temTag = negocio.medicao.googleTag || negocio.medicao.metaPixel;
const privacidade = `${topo}<main class="cx legal"><h1>Privacidade</h1>
<p>Este site não tem cadastro e não recebe seus dados. O pedido só sai do seu aparelho quando você toca em enviar e abre o WhatsApp.</p>
<h2>O que fica no seu aparelho</h2><p>A comanda fica guardada por 24 horas e o último pedido fica salvo para o botão "Pedir de novo". Nome e endereço só ficam guardados se você marcar "Lembrar nome e endereço". Você pode apagar esses dados na própria comanda, ou limpando os dados do site no navegador.</p>
<h2>O que vai para o WhatsApp</h2><p>Os itens, os valores e os dados que você preencher vão na mensagem que você mesmo envia. A partir daí valem também as regras do WhatsApp.</p>
<h2>Medição</h2><p>${temTag ? 'O site usa ferramentas do Google e da Meta para contar visitas e etapas do pedido. Nome, endereço e observações não são enviados a essas ferramentas.' : 'Hoje o site não usa ferramentas de anúncio nem de medição de terceiros.'}</p>
<h2>Fale com a gente</h2><p>Para tirar dúvidas ou pedir a exclusão de dados de uma conversa: <a href="${esc(linkDireto)}" target="_blank" rel="noopener noreferrer">WhatsApp ${esc(negocio.telefoneVisivel)}</a>.</p>
<p><a href="/">Voltar ao cardápio</a></p></main>${rodape()}`;
fs.mkdirSync(path.join(dist, 'privacidade'));
fs.writeFileSync(path.join(dist, 'privacidade/index.html'), pagina({ caminho: '/privacidade/', titulo: `Privacidade | ${site}`, descricao: `Como o ${site} trata seus dados nos pedidos pelo WhatsApp.`, corpo: privacidade, indexar: false }));

fs.writeFileSync(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${negocio.dominio}/sitemap.xml\n`);
fs.writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url}</loc></url></urlset>\n`);
fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify({ name: site, short_name: site, lang: 'pt-BR', start_url: '/', display: 'browser', background_color: '#17100b', theme_color: '#17100b', icons: [192, 512].map(t => ({ src: `/assets/icone-${t}.png`, sizes: `${t}x${t}`, type: 'image/png' })) }, null, 1));
fs.writeFileSync(path.join(dist, '.htaccess'), `ErrorDocument 404 /404.html
RewriteEngine On
RewriteCond %{HTTPS} off [OR]
RewriteCond %{HTTP_HOST} ^www\\. [NC]
RewriteRule ^ https://${new URL(negocio.dominio).host}%{REQUEST_URI} [L,R=301]
<IfModule mod_headers.c>
<FilesMatch "\\.(html|xml|txt|webmanifest)$">
Header set Cache-Control "public, max-age=300, must-revalidate"
</FilesMatch>
<FilesMatch "\\.(js|avif|webp|jpg|png|svg)$">
Header set Cache-Control "public, max-age=31536000, immutable"
</FilesMatch>
<FilesMatch "compartilhar\\.jpg|favicon\\.svg|icone-.*\\.png$">
Header set Cache-Control "public, max-age=86400"
</FilesMatch>
</IfModule>
<IfModule mod_deflate.c>
AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml application/manifest+json
</IfModule>
`);

const pend = [];
if (!negocio.horarios) pend.push('horário da cozinha (site não mostra aberto/fechado)');
if (!negocio.legal) pend.push('razão social e CNPJ no rodapé (obrigatório antes de publicar)');
if (!negocio.instagram) pend.push('Instagram');
console.log(`Site gerado em dist/ · ${cardapio.itens.length} itens · ${categorias.length} categorias`);
if (pend.length) console.log('Pendências do dono:\n- ' + pend.join('\n- '));
