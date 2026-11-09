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

  var carrinho = {}, tipo = 'entrega', dispensou = {}, codigo = novoCodigo(), iniciou = false;
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
      troco: valor('troco'), personalizacao: temCaixa(pedido()) ? valor('personalizacao') : '', quando: valor('quando') || 'agora', dia: valor('dia'), hora: valor('hora'), obs: valor('obs') };
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

  function temCaixa(p) { return p.linhas.some(function (l) { return l.item.personalizavel; }); }
  /* Esteira: mostra uma oferta por vez, na ordem definida em cardapio.json. */
  function proximaEtapa(p) {
    return D.esteira.filter(function (e) {
      var item = porId[e.item];
      var jaTem = p.linhas.some(function (l) { return e.ocultarSeTiver.indexOf(l.item.id) > -1 || e.ocultarSeTiver.indexOf(l.item.categoria) > -1; });
      return !dispensou[e.id] && item && item.disponivel && !jaTem && (e.id !== 'bebida' || p.nPasteis > 0);
    })[0] || null;
  }
  function caixaSugestao(alvo, etapa) {
    if (!etapa) { alvo.hidden = true; alvo.innerHTML = ''; return; }
    var item = porId[etapa.item];
    alvo.hidden = false;
    alvo.innerHTML = '<span>' + esc(etapa.titulo) + ' <b>' + esc(item.nome) + ' ' + R.curto(item.preco) + '</b></span>' +
      '<button type="button" class="mini" data-mais="' + item.id + '" aria-label="Adicionar ' + esc(item.nome) + '">Adicionar</button>' +
      '<button type="button" class="fechar-sug" data-dispensar="' + etapa.id + '" aria-label="Dispensar sugestão">×</button>';
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
    caixaSugestao($('#sug-esteira'), proximaEtapa(p));
    $('#campo-caixa').hidden = !temCaixa(p);
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
    var etapa = proximaEtapa(p);
    caixaSugestao($('#sug-bebida'), etapa && etapa.id === 'bebida' ? etapa : null);
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
    else if (t.dataset.dispensar) {
      dispensou[t.dataset.dispensar] = true; render();
      if (comanda.open) ($('#sug-esteira .mini') || $('#fechar')).focus();
    }
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
    carrinho = {}; codigo = novoCodigo(); iniciou = false; dispensou = {};
    form.elements.obs.value = ''; form.elements.personalizacao.value = '';
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
