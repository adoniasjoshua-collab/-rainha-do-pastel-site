// Cenários em Chrome de verdade: pedido completo, toques, sem JS, larguras e velocidade.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servir } from './previa.mjs';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const saida = path.join(raiz, 'docs/prints');
fs.mkdirSync(saida, { recursive: true });
const PORTA_SITE = 8123, PORTA_CDP = 9333;
const origem = `http://localhost:${PORTA_SITE}`;
const pausa = ms => new Promise(r => setTimeout(r, ms));
const srv = await servir(PORTA_SITE);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORTA_CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });

const res = []; const falhas = []; let ultimo = '';
// Trava de segurança: se algo ficar preso, o teste falha em vez de esperar para sempre.
const trava = setTimeout(() => { console.error('TESTE FALHOU: tempo esgotado em: ' + ultimo + ' | ok até aqui: ' + res.length + ' | última etapa: ' + res[res.length - 1]); chrome.kill(); process.exit(2); }, 150000);
void trava;
let alvo;
for (let i = 0; i < 60 && !alvo; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORTA_CDP}/json`)).json(); alvo = l.find(t => t.type === 'page'); } catch { await pausa(250); }
}
if (!alvo) throw new Error('Chrome não respondeu');
const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pend = new Map(); const errosConsole = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { const { ok, no } = pend.get(m.id); pend.delete(m.id); m.error ? no(new Error(m.error.message)) : ok(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') errosConsole.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/status of 404/.test(m.params.entry.text)) errosConsole.push(m.params.entry.text);
};
const cdp = (method, params = {}) => new Promise((ok, no) => { ultimo = method + ' ' + JSON.stringify(params).slice(0, 160); const n = ++id; pend.set(n, { ok, no }); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async expr => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable'); await cdp('Network.enable');

async function abrir(url = '/') {
  await cdp('Page.navigate', { url: origem + url });
  for (let i = 0; i < 100; i++) { await pausa(50); if (await ev(`document.readyState==='complete'`)) break; }
  await pausa(150);
}
const larg = async (w, h = 800) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: w < 768 ? 2 : 1, mobile: w < 768 });
const print = async (nome, inteira = false) => { const s = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: inteira }); fs.writeFileSync(path.join(saida, nome), Buffer.from(s.data, 'base64')); };

const checar = async (expr, nome) => { let v = false; try { v = await ev(expr); } catch (e) { v = false; nome += ' -> ' + e.message; } (v ? res : falhas).push(nome); };
const limpar = () => ev(`localStorage.clear()`);

// Larguras
for (const w of [360, 390, 768, 1440]) {
  await larg(w); await abrir(); await limpar(); await abrir();
  await checar(`document.documentElement.scrollWidth<=innerWidth`, `Sem rolagem horizontal ${w}`);
  await ev(`(async()=>{for(const i of document.images){i.loading='eager';await Promise.race([i.decode().catch(()=>{}),new Promise(r=>setTimeout(r,4000))])}})()`);
  await checar(`[...document.images].every(i=>i.complete&&i.naturalWidth>0)`, `Imagens carregadas ${w}`);
  await checar(`[...document.querySelectorAll('main button,main a.btn,.abas a')].filter(e=>e.offsetParent).every(e=>e.getBoundingClientRect().height>=44)`, `Área de toque 44px ${w}`);
  await print(`inicial-${w}.png`);
  if (w === 390) { await ev(`document.querySelector('#refrigerantes').scrollIntoView({behavior:'instant'})`); await pausa(200); await print('lista-390.png'); }
}

// Fluxo: 2 pastéis + Coca, contando toques
await larg(390); await abrir(); await limpar(); await abrir();
await ev(`window.toques=0;document.addEventListener('click',()=>{window.toques++},true);window.clique=s=>{const e=document.querySelector(s);if(!e)throw new Error('nao achei '+s);e.click()};document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('#enviar'))e.preventDefault()});`);
await checar(`document.querySelector('#barra').hidden`, 'Barra escondida com carrinho vazio');
const inicio = Date.now();
await ev(`clique('[data-add="carne-queijo"]')`);
await checar(`document.querySelector('#b-par').textContent.includes('2º sai por R$ 10')`, 'Aviso do 2º pastel');
await checar(`!document.querySelector('#sug-bebida').hidden`, 'Sugestão de bebida após o 1º pastel');
await print('carrinho-barra-390.png');
await ev(`clique('[data-add="frango-queijo"]')`);
await checar(`document.querySelector('#b-par').hidden && document.querySelector('#b-total').textContent.includes('32,00')`, 'Dupla R$ 25 + entrega R$ 7 na barra');
await ev(`clique('#sug-bebida [data-mais="coca-lata"]')`);
await checar(`document.querySelector('#sug-bebida').hidden && document.querySelector('#b-total').textContent.includes('38,00')`, 'Coca na barra');
await ev(`clique('#abrir')`);
await checar(`document.querySelector('#comanda').open && document.querySelector('#barra').hidden`, 'Comanda abre e barra some');
await ev(`clique('#enviar')`);
await checar(`document.activeElement.id==='endereco' && !document.querySelector('#erro-endereco').hidden`, 'Entrega sem endereço não envia');
// O toque acima só testa o erro de endereço vazio; o cliente que preenche não passa por ele.
await ev('window.toques--');
await ev(`window.campo=(n,v)=>{const e=document.querySelector('[name='+n+']');e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))};clique('#endereco');campo('endereco','Rua das Flores, 10 & casa #2 perto do mercado');`);
await print('comanda-390.png');
await ev(`window.msg=()=>new URL(document.querySelector('#enviar').href).searchParams.get('text')`);
await checar(`msg().includes('⭐ 1× Carne com queijo')&&msg().includes('⭐ 1× Frango com queijo')&&msg().includes('1 dupla × R$ 25,00 = R$ 25,00')&&msg().includes('➕ 1× Coca lata gelada: R$ 6,00')&&msg().includes('TOTAL: R$ 38,00')&&msg().includes('casa #2')`, 'Mensagem correta');
await checar(`document.querySelector('#t-totais').textContent.includes('R$ 38,00')&&document.querySelector('#enviar').textContent.includes('R$ 38,00')`, 'Total igual na tela, botão e mensagem');
await checar(`![...msg()].some(c=>c.codePointAt(0)>65535)`, 'Mensagem sem emoji de 4 bytes no navegador');
await checar(`/Pedido Z[A-Z2-9]{3}/.test(msg())`, 'Código do pedido na mensagem');
await ev(`clique('#enviar')`);
const duracao = Date.now() - inicio;
const toques = await ev('window.toques');
// Toques do cliente: 3 adições, abrir comanda, tocar no endereço, enviar.
const toquesCliente = toques;
(toquesCliente <= 6 ? res : falhas).push(`Pedido em até 6 toques (${toquesCliente})`);
await checar(`!document.querySelector('#pos-envio').hidden`, 'Aviso depois de enviar');
await checar(`!!localStorage.getItem('rp_ultimo_v1')`, 'Último pedido guardado');
await checar(`!localStorage.getItem('rp_dados_v1')`, 'Dados pessoais só com opção marcada');

// Retirada zera taxa
await ev(`document.querySelector('input[name=tipo][value=retirada]').click()`);
await checar(`msg().includes('✅ *RETIRADA*')&&msg().includes('TOTAL: R$ 31,00')&&!msg().includes('Endereço')&&document.querySelector('#t-totais').textContent.includes('sem taxa')&&document.querySelector('#campo-endereco').hidden`, 'Retirada zera taxa e tira endereço');
await ev(`document.querySelector('input[name=tipo][value=entrega]').click();document.querySelector('input[name=pagamento][value=dinheiro]').click();campo('troco','100')`);
await checar(`msg().includes('Dinheiro (troco para R$ 100)')&&!document.querySelector('#campo-troco').hidden`, 'Troco na mensagem');
await ev(`document.querySelector('input[name=quando][value=agendar]').click();campo('hora','19:30')`);
await checar(`msg().includes('agendar para hoje às 19:30')`, 'Agendamento na mensagem');
await checar(`(()=>{const d=document.querySelector('#comanda');return d.scrollWidth<=d.clientWidth})()`, 'Comanda sem rolagem horizontal');

// Persistência
await abrir();
await checar(`document.querySelector('#b-total').textContent.includes('38,00')`, 'Carrinho sobrevive ao recarregar');
await ev(`const c=JSON.parse(localStorage.rp_carrinho_v1);c.t=Date.now()-25*36e5;localStorage.rp_carrinho_v1=JSON.stringify(c)`);
await abrir();
await checar(`document.querySelector('#barra').hidden`, 'Carrinho expira em 24 horas');
await checar(`!document.querySelector('#novo').hidden&&document.querySelector('#novo-resumo').textContent.includes('Carne')`, 'Aparece "Pedir de novo"');
await ev(`document.querySelector('#pedir-de-novo').click()`);
await checar(`document.querySelector('#comanda').open&&document.querySelector('#t-totais').textContent.includes('38,00')`, '"Pedir de novo" remonta o pedido');
await ev(`document.querySelector('#comanda').close()`);
await pausa(50);
// Lembrar dados
await ev(`document.querySelector('#abrir').click();const f=document.querySelector('#form-pedido');f.elements.lembrar.click();f.elements.endereco.value='Rua B, 5';f.elements.endereco.dispatchEvent(new Event('input',{bubbles:true}));document.addEventListener('click',e=>{if(e.target.id==='enviar')e.preventDefault()},true);document.querySelector('#enviar').click()`);
await checar(`JSON.parse(localStorage.rp_dados_v1).endereco==='Rua B, 5'`, '"Lembrar" guarda endereço');
await abrir();
await checar(`document.querySelector('[name=endereco]').value==='Rua B, 5'&&!document.querySelector('#apagar-dados').hidden`, 'Dados voltam ao abrir');
await ev(`document.querySelector('#abrir').click();document.querySelector('#apagar-dados').click()`);
await checar(`!localStorage.getItem('rp_dados_v1')&&document.querySelector('[name=endereco]').value===''`, 'Apagar meus dados');
await ev(`document.querySelector('#comanda').close()`);
await checar(`document.querySelector('#status-loja').hidden`, 'Sem horário confirmado não mostra aberto/fechado');

// Esteira: uma oferta por vez, com a caixa por último
await ev(`localStorage.clear()`); await abrir();
await ev(`document.querySelector('[data-add="carne-queijo"]').click();document.querySelector('[data-dispensar=bebida]').click();document.querySelector('#abrir').click()`);
const slot = `document.querySelector('#sug-esteira').textContent`;
await checar(`${slot}.includes('Pão de queijo')&&document.querySelectorAll('#sug-esteira .mini').length===1`, 'Esteira: 1ª oferta na comanda');
await ev(`document.querySelector('#sug-esteira [data-dispensar]').click()`);
await checar(`${slot}.includes('Barrinha Cacau Show')`, 'Esteira: doce depois do lanche');
await ev(`document.querySelector('#sug-esteira [data-dispensar]').click()`);
await checar(`${slot}.includes('Caixinha personalizada')&&document.querySelector('#campo-caixa').hidden`, 'Esteira: caixa é a última opção');
await print('esteira-caixa-390.png');
await ev(`document.querySelector('#sug-esteira [data-mais]').click();const t=document.querySelector('[name=personalizacao]');t.value='Para Ana';t.dispatchEvent(new Event('input',{bubbles:true}))`);
await ev(`window.msg=()=>new URL(document.querySelector('#enviar').href).searchParams.get('text')`);
await checar(`document.querySelector('#sug-esteira').hidden&&!document.querySelector('#campo-caixa').hidden&&msg().includes('1× Caixinha personalizada: R$ 10,00')&&msg().includes('Na caixinha: Para Ana')&&msg().includes('TOTAL: R$ 32,00')`, 'Caixa entra no pedido com a mensagem');
await ev(`document.querySelector('#comanda').close()`);

// Sem JavaScript
await cdp('Emulation.setScriptExecutionDisabled', { value: true });
await abrir();
const semJs = async (e) => (await cdp('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
const tx = await semJs(`document.body.innerText`);
(tx.includes('R$ 15') && tx.includes('Coca lata gelada') && tx.includes('Pedir pelo WhatsApp') ? res : falhas).push('Sem JavaScript: cardápio, preços e botão');
await cdp('Emulation.setScriptExecutionDisabled', { value: false });

// 404 e privacidade
await abrir('/nao-existe/');
await checar(`document.body.innerText.includes('Coca lata gelada')`, '404 mostra o cardápio');
await abrir('/privacidade/');
await checar(`document.querySelectorAll('h1').length===1`, 'Privacidade abre');

// Velocidade: celular simulado em 4G, 3 medições
await larg(390);
await cdp('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
await cdp('Emulation.setCPUThrottlingRate', { rate: 4 });
await cdp('Network.setCacheDisabled', { cacheDisabled: true });
const medidas = [];
for (let i = 0; i < 3; i++) {
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__lcp=0;window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:'layout-shift',buffered:true});` });
  await cdp('Page.navigate', { url: origem + '/' });
  await pausa(5000);
  medidas.push(await ev(`({lcp:Math.round(__lcp),cls:+__cls.toFixed(3),peso:Math.round(performance.getEntriesByType('resource').reduce((s,r)=>s+r.encodedBodySize,performance.getEntriesByType('navigation')[0].encodedBodySize)/1024),reqs:performance.getEntriesByType('resource').length+1})`));
}
const med = k => medidas.map(m => m[k]).sort((a, b) => a - b)[1];
const vel = { lcp: med('lcp'), cls: med('cls'), pesoKB: med('peso'), requisicoes: med('reqs') };
(vel.lcp <= 2000 ? res : falhas).push(`LCP até 2,0 s (${vel.lcp} ms)`);
(vel.cls <= 0.05 ? res : falhas).push(`CLS até 0,05 (${vel.cls})`);
(vel.pesoKB <= 400 ? res : falhas).push(`Carga inicial até 400 KB (${vel.pesoKB} KB)`);
if (errosConsole.length) falhas.push('Erros no console: ' + [...new Set(errosConsole)].join(' | '));
else res.push('Sem erro no console');

const relatorio = { data: new Date().toISOString(), passaram: res, falharam: falhas, toques: toquesCliente, duracaoScriptMs: duracao, velocidade: vel, medidas };
fs.writeFileSync(path.join(raiz, 'docs/resultado-testes.json'), JSON.stringify(relatorio, null, 1));
console.log(`${res.length} cenários passaram · ${falhas.length} falharam`);
console.log(`Toques registrados: ${toquesCliente} · velocidade:`, vel);
if (falhas.length) console.error('FALHAS:\n- ' + falhas.join('\n- '));
ws.close(); chrome.kill(); srv.close();
process.exit(falhas.length ? 1 : 0);
