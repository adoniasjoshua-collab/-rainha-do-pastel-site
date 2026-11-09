/* Regras do pedido. Tudo em centavos inteiros. Roda no navegador e nos testes. */
(function (raiz) {
  'use strict';
  var LIMITE_URL = 6000;
  var LINHA = '━━━━━━━━━━━━━━';
  var DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

  function moeda(c) {
    var t = (Math.abs(c) / 100).toFixed(2).split('.');
    return 'R$ ' + t[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + t[1];
  }
  function curto(c) { return moeda(c).replace(',00', ''); }

  function precoPasteis(n, regra) {
    return Math.floor(n / 2) * regra.dupla + (n % 2) * regra.avulso;
  }
  function textoRegra(n, regra) {
    var pares = Math.floor(n / 2), partes = [];
    if (pares) partes.push(pares + (pares === 1 ? ' dupla' : ' duplas') + ' × ' + moeda(regra.dupla));
    if (n % 2) partes.push('1 avulso × ' + moeda(regra.avulso));
    return partes.join(' + ');
  }
  function rotuloPasteis(n) { return n + (n === 1 ? ' pastelão' : ' pastelões'); }
  function rotuloItens(n) { return n + (n === 1 ? ' item' : ' itens'); }

  /* Só entra item que existe e está disponível, sempre com o preço atual. */
  function calcular(carrinho, dados, tipo) {
    var linhas = [];
    dados.itens.forEach(function (item) {
      var q = Math.floor(Number(carrinho[item.id]) || 0);
      if (q > 0 && item.disponivel && item.preco > 0) linhas.push({ item: item, qtd: q, subtotal: q * item.preco });
    });
    var pasteis = linhas.filter(function (l) { return l.item.regraPar; });
    var outros = linhas.filter(function (l) { return !l.item.regraPar; });
    var nPasteis = pasteis.reduce(function (s, l) { return s + l.qtd; }, 0);
    var valorPasteis = precoPasteis(nPasteis, dados.regraPastel);
    var valorOutros = outros.reduce(function (s, l) { return s + l.subtotal; }, 0);
    var produtos = valorPasteis + valorOutros;
    var qtdTotal = linhas.reduce(function (s, l) { return s + l.qtd; }, 0);
    var taxa = tipo === 'entrega' && qtdTotal > 0 ? dados.negocio.entrega.taxa : 0;
    return { linhas: linhas, pasteis: pasteis, outros: outros, nPasteis: nPasteis, valorPasteis: valorPasteis,
      valorOutros: valorOutros, produtos: produtos, taxa: taxa, total: produtos + taxa, qtdTotal: qtdTotal, tipo: tipo };
  }

  /* Emoji de 4 bytes chega como "�" no WhatsApp: nada acima de U+FFFF pode sair. */
  function limparTexto(s) {
    return String(s == null ? '' : s)
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
      .replace(/[\uD800-\uDFFF️‍]/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  function linhasCliente(p, c) {
    var l = [];
    if (limparTexto(c.nome)) l.push('▸ Nome: ' + limparTexto(c.nome));
    if (p.tipo === 'entrega' && limparTexto(c.endereco)) l.push('▸ Endereço: ' + limparTexto(c.endereco));
    if (c.pagamento) {
      var t = limparTexto(c.troco);
      if (/^\d+([.,]\d{1,2})?$/.test(t)) t = 'R$ ' + t;
      l.push('▸ Pagamento: ' + c.pagamento + (c.ehDinheiro && t ? ' (troco para ' + t + ')' : ''));
    }
    if (c.quando === 'agendar') {
      l.push('⏰ Horário: ' + (c.hora ? 'agendar para ' + (c.dia === 'amanha' ? 'amanhã' : 'hoje') + ' às ' + c.hora : 'quero agendar (combino por aqui)'));
    } else {
      l.push('⏰ Horário: o quanto antes');
    }
    return l;
  }

  function mensagem(p, c, ctx, resumido) {
    var regra = ctx.regra;
    var cab = (p.tipo === 'entrega' ? '✅ *ENTREGA*' : '✅ *RETIRADA*') + ' · ' + (p.nPasteis ? rotuloPasteis(p.nPasteis) : rotuloItens(p.qtdTotal));
    var l = ['Olá! Quero fazer este pedido:', '', cab, 'Pedido ' + ctx.codigo, LINHA];
    if (p.nPasteis) {
      l.push('', '*PASTELÕES*');
      if (resumido) l.push('⭐ ' + p.pasteis.map(function (x) { return x.qtd + '× ' + x.item.nome; }).join(', '));
      else p.pasteis.forEach(function (x) { l.push('⭐ ' + x.qtd + '× ' + x.item.nome); });
      l.push('▸ ' + textoRegra(p.nPasteis, regra) + ' = ' + moeda(p.valorPasteis));
    }
    if (p.outros.length) {
      l.push('', '*BEBIDAS E ADICIONAIS*');
      var nome = function (x) { return x.item.nome + (ctx.detalharNome && ctx.detalharNome(x.item) ? ' (' + x.item.detalhe + ')' : ''); };
      if (resumido) l.push('➕ ' + p.outros.map(function (x) { return x.qtd + '× ' + nome(x); }).join(', ') + ': ' + moeda(p.valorOutros));
      else p.outros.forEach(function (x) { l.push('➕ ' + x.qtd + '× ' + nome(x) + ': ' + moeda(x.subtotal)); });
    }
    l.push('', LINHA, '*VALORES*', 'Produtos: ' + moeda(p.produtos),
      p.tipo === 'entrega' ? ctx.rotuloEntrega + ': ' + moeda(p.taxa) : 'Retirada: sem taxa',
      '▶ *TOTAL: ' + moeda(p.total) + '*');
    l.push('', '*DADOS DO CLIENTE*');
    Array.prototype.push.apply(l, linhasCliente(p, c));
    var obs = limparTexto(c.obs);
    if (obs) l.push('✏ Obs.: ' + (resumido && obs.length > 120 ? obs.slice(0, 120) + '... (completo por aqui)' : obs));
    l.push('', p.tipo === 'entrega' ? 'Pode confirmar a disponibilidade e o horário?' : 'Pode confirmar a disponibilidade, o local e o horário de retirada?',
      '_Origem: site · ' + (ctx.origem || 'inicial') + '_');
    return l.join('\n');
  }

  function linkWhatsApp(numero, texto) { return 'https://wa.me/' + numero + '?text=' + encodeURIComponent(texto); }

  /* Pedido muito longo vira versão compacta, sem perder item nem valor. */
  function montarEnvio(numero, p, c, ctx) {
    var texto = mensagem(p, c, ctx, false), link = linkWhatsApp(numero, texto), resumido = false;
    if (link.length > LIMITE_URL) { texto = mensagem(p, c, ctx, true); link = linkWhatsApp(numero, texto); resumido = true; }
    return { texto: texto, link: link, resumido: resumido };
  }

  function codigoPedido(aleatorio) {
    var alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', s = 'Z';
    for (var i = 0; i < 3; i++) s += alfabeto[Math.floor(aleatorio() * alfabeto.length) % alfabeto.length];
    return s;
  }

  function agoraBelem(data) {
    var partes = {};
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Belem', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(data).forEach(function (p) { partes[p.type] = p.value; });
    var dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(partes.weekday);
    return { dia: dia, minutos: Number(partes.hour) * 60 + Number(partes.minute) };
  }
  function minutos(h) { var p = h.split(':'); return Number(p[0]) * 60 + Number(p[1]); }

  /* Sem horário confirmado o site não afirma aberto nem fechado. */
  function statusLoja(horarios, data) {
    if (!horarios) return { estado: 'desconhecido' };
    var a = agoraBelem(data);
    var hoje = horarios[DIAS[a.dia]] || [], ontem = horarios[DIAS[(a.dia + 6) % 7]] || [], i;
    for (i = 0; i < hoje.length; i++) {
      var ini = minutos(hoje[i][0]), fim = minutos(hoje[i][1]);
      if (fim > ini ? (a.minutos >= ini && a.minutos < fim) : a.minutos >= ini) return { estado: 'aberto', ate: hoje[i][1] };
    }
    for (i = 0; i < ontem.length; i++) {
      if (minutos(ontem[i][1]) <= minutos(ontem[i][0]) && a.minutos < minutos(ontem[i][1])) return { estado: 'aberto', ate: ontem[i][1] };
    }
    for (var d = 0; d < 8; d++) {
      var turnos = (horarios[DIAS[(a.dia + d) % 7]] || []).slice().sort(function (x, y) { return minutos(x[0]) - minutos(y[0]); });
      for (i = 0; i < turnos.length; i++) {
        if (d > 0 || minutos(turnos[i][0]) > a.minutos) return { estado: 'fechado', emDias: d, abre: turnos[i][0], dia: DIAS[(a.dia + d) % 7] };
      }
    }
    return { estado: 'fechado' };
  }

  raiz.Regras = { LIMITE_URL: LIMITE_URL, moeda: moeda, curto: curto, precoPasteis: precoPasteis, textoRegra: textoRegra, rotuloPasteis: rotuloPasteis,
    rotuloItens: rotuloItens, calcular: calcular, limparTexto: limparTexto, mensagem: mensagem, linkWhatsApp: linkWhatsApp, montarEnvio: montarEnvio,
    codigoPedido: codigoPedido, statusLoja: statusLoja };
})(typeof window !== 'undefined' ? window : globalThis);

/* Carrinho e finalização. Nenhum dado pessoal sai do aparelho antes de abrir o WhatsApp. */
(function () {
  'use strict';
  var R = window.Regras;
  var D = JSON.parse(document.getElementById('dados').textContent);
  var $ = function (s, b) { return (b || document).querySelector(s); };
  var $$ = function (s, b) { return Array.prototype.slice.call((b || document).querySelectorAll(s)); };
  var esc = function (v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var LS = {
    ler: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    gravar: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    apagar: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var CHAVES = { carrinho: 'rp_carrinho_v1', ultimo: 'rp_ultimo_v1', dados: 'rp_dados_v1' };
  var DIA_MS = 864e5;
  var porId = {};
  D.itens.forEach(function (i) { porId[i.id] = i; });

  var carrinho = {}, tipo = 'entrega', dispensou = { bebida: false, doce: false }, codigo = novoCodigo(), iniciou = false;
  var comanda = $('#comanda'), form = $('#form-pedido'), barra = $('#barra'), enviar = $('#enviar');
  var origem = (new URLSearchParams(location.search).get('origem') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
  var nomesRepetidos = {};
  D.itens.forEach(function (i) { nomesRepetidos[i.nome] = (nomesRepetidos[i.nome] || 0) + 1; });
  var nomeCompleto = function (i) { return i.nome + (nomesRepetidos[i.nome] > 1 ? ' (' + i.detalhe + ')' : ''); };

  function novoCodigo() {
    return R.codigoPedido(function () {
      var n = new Uint32Array(1); crypto.getRandomValues(n); return n[0] / 4294967296;
    });
  }
  function evento(nome, dados) {
    (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: nome }, dados || {}));
    if (window.gtag) window.gtag('event', nome, dados || {});
    if (window.fbq) window.fbq('trackCustom', nome, dados || {});
  }
  function pedido() { return R.calcular(carrinho, D, tipo); }
  function valor(nome) { var e = form.elements[nome]; return e ? e.value : ''; }

  function cliente() {
    var pag = D.negocio.pagamentos.filter(function (p) { return p.id === valor('pagamento'); })[0];
    return { nome: valor('nome'), endereco: valor('endereco'), pagamento: pag ? pag.nome : '', ehDinheiro: !!pag && pag.id === 'dinheiro',
      troco: valor('troco'), quando: valor('quando') || 'agora', dia: valor('dia'), hora: valor('hora'), obs: valor('obs') };
  }
  function contexto() {
    return { codigo: codigo, origem: origem, regra: D.regraPastel, rotuloEntrega: D.negocio.entrega.rotulo,
      detalharNome: function (i) { return nomesRepetidos[i.nome] > 1; } };
  }
  function salvar() {
    if (Object.keys(carrinho).length) LS.gravar(CHAVES.carrinho, { t: Date.now(), itens: carrinho });
    else LS.apagar(CHAVES.carrinho);
  }
  function mudar(id, delta) {
    var item = porId[id];
    if (!item || !item.disponivel) return;
    var q = Math.max(0, Math.min(99, (carrinho[id] || 0) + delta));
    if (q) carrinho[id] = q; else delete carrinho[id];
    if (delta > 0) evento('adicionar_item', { item_id: id, valor: item.preco / 100 });
    render();
  }
  function linhaTicket(l) {
    var i = l.item;
    return '<div class="t-linha"><div class="t-nome">' + esc(i.nome) + '<small>' + esc(i.detalhe) + (i.regraPar ? '' : ' · ' + R.moeda(l.subtotal)) + '</small></div>' +
      '<div class="stepper"><button type="button" data-menos="' + i.id + '" aria-label="Tirar 1 ' + esc(nomeCompleto(i)) + '">−</button>' +
      '<span class="q">' + l.qtd + '</span><button type="button" data-mais="' + i.id + '" aria-label="Pôr mais 1 ' + esc(nomeCompleto(i)) + '">+</button></div></div>';
  }
  function linhaValor(a, b, c) { return '<div class="t-valor ' + (c || '') + '"><span>' + a + '</span><strong>' + b + '</strong></div>'; }
  function textoPar(p) {
    if (p.nPasteis % 2 !== 1) return '';
    return 'Adicione mais 1 e o ' + (p.nPasteis + 1) + 'º sai por ' + R.curto(D.regraPastel.dupla - D.regraPastel.avulso);
  }
  function temCategoria(p, cat) { return p.linhas.some(function (l) { return l.item.categoria === cat; }); }

  function caixaSugestao(alvo, tipoSug, visivel, titulo) {
    var item = porId[D.sugestoes[tipoSug]];
    if (!visivel || !item || !item.disponivel) { alvo.hidden = true; alvo.innerHTML = ''; return; }
    alvo.hidden = false;
    alvo.innerHTML = '<span>' + titulo + ' <b>' + esc(item.nome) + ' ' + R.curto(item.preco) + '</b></span>' +
      '<button type="button" class="mini" data-mais="' + item.id + '" aria-label="Adicionar ' + esc(item.nome) + '">Adicionar</button>' +
      '<button type="button" class="fechar-sug" data-dispensar="' + tipoSug + '" aria-label="Dispensar sugestão">×</button>';
  }

  function renderComanda(p) {
    var foco = document.activeElement, alvoFoco = foco && foco.dataset && (foco.dataset.mais ? '[data-mais="' + foco.dataset.mais + '"]' : foco.dataset.menos ? '[data-menos="' + foco.dataset.menos + '"]' : '');
    var html = '';
    if (p.nPasteis) html += p.pasteis.map(linhaTicket).join('') + linhaValor('<small>' + R.textoRegra(p.nPasteis, D.regraPastel) + '</small>', R.moeda(p.valorPasteis), 'sub');
    html += p.outros.map(linhaTicket).join('');
    $('#t-linhas').innerHTML = html;
    if (alvoFoco && $('#t-linhas ' + alvoFoco)) $('#t-linhas ' + alvoFoco).focus();
    $('#t-par').textContent = textoPar(p);
    $('#t-par').hidden = !textoPar(p);
    caixaSugestao($('#sug-doce'), 'doce', !temCategoria(p, 'doces') && !dispensou.doce, 'Um docinho?');
    $('#t-totais').innerHTML = linhaValor('Produtos', R.moeda(p.produtos)) +
      linhaValor(tipo === 'entrega' ? esc(D.negocio.entrega.rotulo) : 'Retirada', tipo === 'entrega' ? R.moeda(p.taxa) : 'sem taxa') +
      linhaValor('TOTAL', R.moeda(p.total), 'total');
    $('#t-codigo').textContent = 'Pedido ' + codigo;
    $('#campo-endereco').hidden = tipo !== 'entrega';
    $('#campo-troco').hidden = valor('pagamento') !== 'dinheiro';
    $('#campo-agendar').hidden = valor('quando') !== 'agendar';
    var envio = R.montarEnvio(D.negocio.whatsapp, p, cliente(), contexto());
    $('#previa').textContent = envio.texto;
    enviar.href = envio.link;
    enviar.textContent = 'Enviar no WhatsApp · ' + R.moeda(p.total);
  }

  function render() {
    var p = pedido();
    $$('[data-item]').forEach(function (el) {
      var q = carrinho[el.dataset.item] || 0, add = $('[data-add]', el), st = $('.stepper', el);
      if (!add) return;
      add.hidden = q > 0; st.hidden = q === 0;
      $('.q', st).textContent = q;
    });
    barra.hidden = !p.qtdTotal || comanda.open;
    document.body.classList.toggle('com-barra', !barra.hidden);
    $('#b-total').textContent = R.moeda(p.total);
    $('#b-qtd').textContent = p.nPasteis ? R.rotuloPasteis(p.nPasteis) + (p.outros.length ? ' + extras' : '') : R.rotuloItens(p.qtdTotal);
    $('#b-taxa').textContent = tipo === 'entrega' ? 'com entrega' : 'retirada';
    $('#b-par').textContent = textoPar(p);
    $('#b-par').hidden = !textoPar(p);
    caixaSugestao($('#sug-bebida'), 'bebida', p.nPasteis > 0 && !temCategoria(p, 'bebidas') && !dispensou.bebida, 'Bebida gelada?');
    salvar();
    if (comanda.open) { if (p.qtdTotal) renderComanda(p); else fecharComanda(); }
  }

  function abrirComanda() {
    if (!pedido().qtdTotal) return;
    comanda.showModal();
    document.body.classList.add('travado');
    evento('abrir_carrinho', { valor: pedido().total / 100 });
    render();
  }
  function fecharComanda() {
    if (comanda.open) comanda.close();
    document.body.classList.remove('travado');
    render();
  }

  function validar() {
    var erro = $('#erro-endereco');
    if (tipo === 'entrega' && !R.limparTexto(valor('endereco'))) {
      erro.hidden = false; form.elements.endereco.setAttribute('aria-invalid', 'true');
      form.elements.endereco.focus();
      return false;
    }
    erro.hidden = true; form.elements.endereco.removeAttribute('aria-invalid');
    return true;
  }
  function guardarDados() {
    if (form.elements.lembrar.checked) {
      LS.gravar(CHAVES.dados, { nome: valor('nome'), endereco: valor('endereco') });
    } else LS.apagar(CHAVES.dados);
    atualizarApagar();
  }
  function atualizarApagar() { $('#apagar-dados').hidden = !LS.ler(CHAVES.dados); }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('button,a');
    if (!t) return;
    if (t.dataset.add) mudar(t.dataset.add, 1);
    else if (t.dataset.mais) mudar(t.dataset.mais, 1);
    else if (t.dataset.menos) mudar(t.dataset.menos, -1);
    else if (t.dataset.dispensar) { dispensou[t.dataset.dispensar] = true; render(); }
    else if (t.id === 'abrir') abrirComanda();
    else if (t.id === 'fechar') fecharComanda();
    else if (t.id === 'pedir-de-novo') pedirDeNovo();
    else if (t.id === 'novo-pedido') novoPedido();
    else if (t.id === 'apagar-dados') {
      LS.apagar(CHAVES.dados);
      form.elements.nome.value = ''; form.elements.endereco.value = ''; form.elements.lembrar.checked = false;
      atualizarApagar(); render();
    }
  });
  enviar.addEventListener('click', function (e) {
    if (!validar()) { e.preventDefault(); return; }
    var p = pedido();
    render();
    guardarDados();
    LS.gravar(CHAVES.ultimo, { t: Date.now(), itens: carrinho });
    evento('enviar_whatsapp', { valor: p.total / 100, quantidade: p.qtdTotal, codigo: codigo });
    $('#pos-envio').hidden = false;
  });
  form.addEventListener('input', function () {
    if (!iniciou) { iniciou = true; evento('iniciar_finalizacao', { valor: pedido().total / 100 }); }
    if (R.limparTexto(valor('endereco'))) $('#erro-endereco').hidden = true;
    render();
  });
  form.addEventListener('change', function (e) {
    if (e.target.name === 'tipo') tipo = e.target.value === 'retirada' ? 'retirada' : 'entrega';
    render();
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  comanda.addEventListener('close', function () { document.body.classList.remove('travado'); render(); });

  function novoPedido() {
    carrinho = {}; codigo = novoCodigo(); iniciou = false; dispensou = { bebida: false, doce: false };
    form.elements.obs.value = '';
    $('#pos-envio').hidden = true;
    fecharComanda();
    mostrarPedirDeNovo();
  }
  function itensValidos(itens) {
    var r = {};
    Object.keys(itens || {}).forEach(function (id) {
      var q = Math.floor(Number(itens[id]));
      if (porId[id] && porId[id].disponivel && q > 0) r[id] = Math.min(q, 99);
    });
    return r;
  }
  function pedirDeNovo() {
    var u = LS.ler(CHAVES.ultimo);
    if (!u) return;
    carrinho = itensValidos(u.itens);
    codigo = novoCodigo();
    $('#novo').hidden = true;
    render();
    abrirComanda();
  }
  function mostrarPedirDeNovo() {
    var u = LS.ler(CHAVES.ultimo), itens = u ? itensValidos(u.itens) : {};
    var ids = Object.keys(itens), caixa = $('#novo');
    if (!ids.length || Object.keys(carrinho).length) { caixa.hidden = true; return; }
    $('#novo-resumo').textContent = ids.map(function (id) { return itens[id] + '× ' + nomeCompleto(porId[id]); }).join(', ');
    caixa.hidden = false;
  }

  function aplicarStatus() {
    var s = R.statusLoja(D.negocio.horarios, new Date()), el = $('#status-loja');
    var fora = s.estado === 'fechado';
    var agora = form.querySelector('input[name=quando][value=agora]');
    if (agora) agora.disabled = fora;
    if (fora) form.querySelector('input[name=quando][value=agendar]').checked = true;
    if (!el || s.estado === 'desconhecido') return;
    if (s.estado === 'aberto') el.textContent = 'Aberto agora, até ' + s.ate;
    else el.textContent = 'Fechado agora' + (s.abre ? '. Abre ' + (s.emDias === 0 ? 'hoje' : s.emDias === 1 ? 'amanhã' : 'na ' + D.nomesDias[s.dia]) + ' às ' + s.abre + '. Pode agendar seu pedido.' : '. Pode agendar seu pedido.');
    el.dataset.estado = s.estado;
    el.hidden = false;
  }

  function iniciar() {
    var salvo = LS.ler(CHAVES.carrinho);
    if (salvo && Date.now() - salvo.t < DIA_MS) carrinho = itensValidos(salvo.itens);
    else LS.apagar(CHAVES.carrinho);
    var dados = LS.ler(CHAVES.dados);
    if (dados) { form.elements.nome.value = dados.nome || ''; form.elements.endereco.value = dados.endereco || ''; form.elements.lembrar.checked = true; }
    atualizarApagar();
    aplicarStatus();
    mostrarPedirDeNovo();
    render();
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { evento('ver_cardapio'); io.disconnect(); }
      });
      io.observe($('#cardapio'));
    }
    window.addEventListener('load', function () { setTimeout(carregarTags, 1500); });
  }
  function carregarTags() {
    var m = D.negocio.medicao || {};
    function script(src) { var s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); }
    if (m.googleTag) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date()); window.gtag('config', m.googleTag);
      script('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(m.googleTag));
    }
    if (m.metaPixel) {
      var f = window.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
      f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
      script('https://connect.facebook.net/en_US/fbevents.js');
      f('init', m.metaPixel); f('track', 'PageView');
    }
  }
  iniciar();
})();
