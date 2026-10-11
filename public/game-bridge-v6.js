/* Configuração de rede local antes da inicialização do GameShell original. */
(()=>{
 'use strict';
 const origin=location.origin;
 const ticket=new URL(location.href).searchParams.get('t')||'';
 const spinStorage='pg-pending-'+ticket.slice(-32);
 let pendingSpin=null;
 let knownBalance=null, externalBalance=null, walletRefreshTimer=null;
 function reconcileWallet(){
  if(knownBalance===null||externalBalance===null||pendingSpin||knownBalance===externalBalance)return;
  clearTimeout(walletRefreshTimer);
  walletRefreshTimer=setTimeout(()=>{if(!pendingSpin&&knownBalance!==externalBalance)location.reload()},750);
 }
 window.addEventListener('message',event=>{
  if(event.origin!==origin||event.source!==window.parent||event.data?.type!=='PG_AUTHORITATIVE_BALANCE')return;
  const amount=Number(event.data.balance);
  if(!Number.isFinite(amount)||amount<0)return;
  externalBalance=Math.round(amount*100);reconcileWallet();
 });
 try{pendingSpin=JSON.parse(sessionStorage.getItem(spinStorage)||'null')}catch{}
 const uuid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
 const api=url=>/^\/(?:web-api|game-api|local-api)\//.test(new URL(String(url),location.href).pathname);
 const spin=url=>new URL(String(url),location.href).pathname.endsWith('/Spin');
 function key(body){
  const fingerprint=typeof body==='string'?body:String(body||'');
  if(!pendingSpin||pendingSpin.fingerprint!==fingerprint){pendingSpin={key:uuid(),fingerprint};try{sessionStorage.setItem(spinStorage,JSON.stringify(pendingSpin))}catch{}}
  return pendingSpin.key;
 }
 function received(url,text,requestKey){
  try{
   const data=typeof text==='string'?JSON.parse(text):text;
   if(spin(url)&&!data.err&&data.dt?.si){
    knownBalance=Math.round(data.dt.si.bl*100);
    externalBalance=knownBalance;
    if(pendingSpin?.key===requestKey){pendingSpin=null;try{sessionStorage.removeItem(spinStorage)}catch{}}
    window.parent.postMessage({type:'PG_WALLET_CHANGED'},origin);
   }
   if(spin(url)&&data.err){
    if(pendingSpin?.key===requestKey){pendingSpin=null;try{sessionStorage.removeItem(spinStorage)}catch{}}
    if(Number.isFinite(Number(data.dt?.si?.bl)))knownBalance=Math.round(Number(data.dt.si.bl)*100);
    window.parent.postMessage({type:'PG_WALLET_CHANGED'},origin);
   }
   if(String(url).includes('/GameInfo/Get')&&!data.err){knownBalance=Math.round(data.dt.bl*100);externalBalance=knownBalance;pendingSpin=null;try{sessionStorage.removeItem(spinStorage)}catch{}}
  }catch{}
 }
 const gid=location.pathname.split('/').find(x=>/^\d+$/.test(x))||'126';
 // O worker do jogo fica restrito à sua pasta e preserva o PWA da ZeroBet.
 if(navigator.serviceWorker?.register){
  const register=navigator.serviceWorker.register.bind(navigator.serviceWorker);
  navigator.serviceWorker.register=(url,options)=>register(url,/shared\/service-worker/.test(String(url))?{...options,scope:'/'+gid+'/'}:options);
 }
 // Limita o custo de pixel em telas Retina sem alterar a arte do jogo.
 if(window.devicePixelRatio>1.5)try{Object.defineProperty(window,'devicePixelRatio',{get:()=>1.5,configurable:true})}catch{}
 if(typeof document!=='undefined'){
  const style=document.createElement('style');
  style.textContent='html,body{margin:0!important;overflow:hidden!important;width:100%;height:100%;overscroll-behavior:none}';
  document.head.appendChild(style);
 }

 // Normaliza também favoritos e URLs de versões anteriores.
 if(window.history?.replaceState){
  const launch=new URL(location.href);
  // Sites canonicaliza .html; mantém a base esperada pelo bootstrap PG.
  launch.pathname='/'+gid+'/index.html';
  launch.searchParams.set('or','00'+origin);
  launch.searchParams.set('l','pt');
  window.history.replaceState(null,'',launch.href);
 }
 // O GameShell original cria https://api.<host>/ quando ApiDomain não existe.
 // O parâmetro antigo ?api= não configura esta versão do GameShell.
 window.ApiDomain=origin+'/';
 const originalFetch=window.fetch;
 function local(url){
  const value=typeof url==='string'?url:url instanceof URL?url.href:null;
  if(value===null)return url;
  try{
   const u=new URL(value,location.href);
   const gameAPI=/^\/(?:web-api|game-api|local-api)\//.test(u.pathname);
   const localHost=u.hostname===location.hostname||['localhost','api.localhost','127.0.0.1','api.127.0.0.1','[::1]'].includes(u.hostname);
   const pgHost=/(^|\.)(?:pgsoft\.com|pg-nmga\.com)$/.test(u.hostname);
   if(gameAPI||localHost||pgHost)return origin+u.pathname+u.search+u.hash;
  }catch{}
  return value;
 }
 const append=Element.prototype.appendChild;
 Element.prototype.appendChild=function(el){
  if(el.tagName==='SCRIPT'&&el.src&&/googletagmanager|google-analytics/.test(el.src))el.src=origin+'/telemetry-disabled.js';
  return append.call(this,el);
 };
 const open=XMLHttpRequest.prototype.open;
 XMLHttpRequest.prototype.open=function(method,url,...args){
  const mapped=local(url);this.__localURL=String(mapped);
  return open.call(this,method,mapped,...args);
 };
 const send=XMLHttpRequest.prototype.send;
 XMLHttpRequest.prototype.send=function(...args){
  if(api(this.__localURL))this.setRequestHeader('X-PG-Session',ticket);
  const requestKey=spin(this.__localURL)?key(args[0]):null;
  if(requestKey)this.setRequestHeader('X-PG-Request-ID',requestKey);
  this.addEventListener('error',()=>report('network','Falha em '+this.__localURL));
  this.addEventListener('timeout',()=>report('network','Tempo esgotado em '+this.__localURL));
  this.addEventListener('load',()=>{if(this.status>=400)report('network','HTTP '+this.status+' em '+this.__localURL);else if(api(this.__localURL)&&['','text','json'].includes(this.responseType))received(this.__localURL,this.responseType==='json'?this.response:this.responseText,requestKey)});
  return send.apply(this,args);
 };
 window.fetch=async function(input,...args){
  if(typeof Request!=='undefined'&&input instanceof Request){const url=local(input.url);if(url!==input.url)input=new Request(url,input)}else input=local(input);
  const url=input instanceof Request?input.url:String(input);
  let requestKey=null;
  if(api(url)){
   if(input instanceof Request){const h=new Headers(input.headers);h.set('X-PG-Session',ticket);if(spin(url)){requestKey=key(await input.clone().text());h.set('X-PG-Request-ID',requestKey)}input=new Request(input,{headers:h})}
   else {const options=args[0]||{};const h=new Headers(options.headers);h.set('X-PG-Session',ticket);if(spin(url)){requestKey=key(options.body);h.set('X-PG-Request-ID',requestKey)}args[0]={...options,headers:h}}
  }
  const response=await originalFetch.call(window,input,...args);
  if(api(url)&&response.ok)received(url,await response.clone().text(),requestKey);
  return response;
 };
 let reports=0;
 function report(kind,message){
  if(reports++>=20)return;
  originalFetch.call(window,origin+'/local-api/client-log',{method:'POST',headers:{'Content-Type':'application/json','X-PG-Session':ticket},body:JSON.stringify({kind,message:String(message).slice(0,1600)})}).catch(()=>{});
 }
 window.addEventListener('error',e=>report('javascript',e.message||'Falha ao carregar recurso '+(e.target?.src||'')),true);
 window.addEventListener('unhandledrejection',e=>report('javascript',e.reason?.message||String(e.reason)));
 console.info('[PG local] API configurada:',window.ApiDomain);
})();

window.addEventListener('DOMContentLoaded',()=>{const a=document.createElement('a');a.href='/';a.textContent='‹ Jogos';a.onclick=e=>{if(window.parent!==window){e.preventDefault();window.parent.postMessage({type:'PG_CLOSE_GAME'},location.origin)}};a.style.cssText='position:fixed;top:8px;left:8px;z-index:2147483647;padding:8px 12px;color:white;background:#171b25dd;border-radius:20px;font:14px Arial;text-decoration:none';document.body.appendChild(a)});
