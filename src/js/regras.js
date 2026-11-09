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
      if (limparTexto(c.personalizacao)) l.push('✨ Na caixinha: ' + limparTexto(c.personalizacao));
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
