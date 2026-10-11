import {games,tables,packets,pick,coefficients,round} from './games.js';
import session from './data/session.json' with {type:'json'};
const error=(msg,cd='1302')=>({dt:null,err:{cd,msg,tid:crypto.randomUUID()}});
export async function handle(request,options){
 const u=new URL(request.url);let state,game;
 const reply=(obj,status=200)=>{const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};if(state&&game)headers['Set-Cookie']='pgDemo'+game.id+'='+encodeURIComponent(JSON.stringify(state))+'; Path=/game-api/'+game.slug+'/; HttpOnly; Secure; SameSite=Lax';options?.onState?.(state);return new Response(JSON.stringify(obj),{status,headers})};
 try{
 if(/^\/126\/play-v4\//.test(u.pathname)){u.pathname=u.pathname.replace('/126/play-v4/','/126/');return Response.redirect(u,307)}
 const badBase=u.pathname.match(/^\/(\d+)\/(?:play|index)\/(.+)$/);if(badBase){u.pathname='/'+badBase[1]+'/'+badBase[2];return Response.redirect(u,307)}
 const text=request.method==='POST'?await request.text():'';if(text.length>16384)return reply(error('Pedido muito grande'),413);
 const b=text?(request.headers.get('content-type')?.includes('json')?JSON.parse(text):Object.fromEntries(new URLSearchParams(text))):{};
 const slug=u.pathname.split('/')[2];game=games.find(g=>g.slug===slug||g.id===String(b.gi)||g.id===String(b.gameId)||g.slug==='bikini-paradise'&&slug==='bikine-paradise')||games[0];
 if(request.headers.get('origin')&&request.headers.get('origin')!==u.origin)return reply(error('Origem inválida'),403);
 if(u.pathname.endsWith('/verifySession')){const data=structuredClone(session);data.dt.tk=crypto.randomUUID();data.dt.geu='game-api/'+game.slug+'/';data.dt.gm[0].gid=game.id;data.dt.gm[0].rtp.df={min:20,max:20};return reply(data)}
 if(u.pathname.endsWith('/GameName/Get'))return reply({dt:Object.fromEntries(games.map(g=>[g.id,g.name])),err:null});
 if(u.pathname==='/local-api/client-log'){console.error('[Cliente]',String(b.kind||''),String(b.message||'').slice(0,1600));return reply({ok:true})}
 if(u.pathname.endsWith('/GetByResourcesTypeIds'))return reply({dt:[],err:null});
 if(/GetBetSummary/.test(u.pathname))return reply({dt:{lut:Date.now(),bs:[],bc:0},err:null});
 if(/GetBetHistory|GetBetDetails|GetBetHistoryList/.test(u.pathname))return reply({dt:{bh:[],lut:Date.now()},err:null});
 if(!u.pathname.startsWith('/game-api/'))return reply(error('Rota inexistente'),404);
 const cookie=request.headers.get('cookie')?.match(new RegExp('(?:^|;\\s*)pgDemo'+game.id+'=([^;]+)'))?.[1];
 if(options?.state)state=structuredClone(options.state);else try{state=JSON.parse(decodeURIComponent(cookie||''))}catch{}
 if(!state||!Number.isSafeInteger(state.balance)||state.balance<0||!state.last){const si=structuredClone(tables[game.slug].initial);Object.assign(si,{bl:1000,blb:1000,blab:1000,cs:game.cs[0],ml:1,tb:0,tbb:0,tw:0,np:0,aw:0});state={balance:100000,last:si,pending:null}}
 if(u.pathname.endsWith('/GameInfo/Get'))return reply({dt:{fb:null,wt:{mw:5,bw:20,mgw:35,smgw:50},maxwm:null,cs:game.cs,ml:[1,2,3,4,5,6,7,8,9,10],mxl:game.mxl,bl:state.balance/100,inwe:false,iuwe:false,ls:{si:state.last},cc:'BRL'},err:null});
 if(!u.pathname.endsWith('/Spin'))return reply(error('Rota inexistente'),404);
 if(request.method!=='POST')return reply(error('Use POST'),405);
 let cs=Number(b.cs),ml=Number(b.ml),bet=0,packet,won,psid,step=0,aw=0;
 if(state.pending){const p=state.pending;cs=p.cs;ml=p.ml;psid=p.psid;step=p.step;aw=p.aw;const chain=packets(tables[game.slug].wins[p.index]);packet=structuredClone(chain[step]);won=true;if(step+1<chain.length)state.pending={...p,step:step+1};else state.pending=null}
 else{
 if(!game.cs.includes(cs)||!Number.isInteger(ml)||ml<1||ml>10)return reply(error('Aposta inválida','1034'),400);
 bet=Math.round(cs*ml*game.lines*100);if(state.balance<bet)return reply({dt:{si:state.last},err:{cd:'3202',msg:'Not enough cash.',tid:crypto.randomUUID()}});
 const result=pick(game,options?.rng);won=result.won;packet=structuredClone(result.packets[0]);psid=crypto.randomUUID();if(won&&result.packets.length>1)state.pending={index:result.index,step:1,cs,ml,psid,aw:0};
 }
 const value=won?round(cs*ml*coefficients(packet)):0,win=Math.round(value*100),before=state.balance;state.balance+=win-bet;
 const si={...structuredClone(tables[game.slug].initial),...packet,ml,cs,wp:packet.wp||null,lw:packet.rwsp?Object.fromEntries(Object.entries(packet.rwsp['0']&&typeof packet.rwsp['0']==='object'?packet.rwsp['0']:packet.rwsp).map(([k,v])=>[k,round(cs*ml*v)])):packet.lw||null,rwsp:packet.rwsp||null,sid:crypto.randomUUID(),psid,blb:before/100,blab:(before-bet)/100,bl:state.balance/100,tb:bet/100,tbb:round(cs*ml*game.lines),tw:value,ctw:value,aw:round(aw+value),np:round(value-bet/100),st:packet.st??(step?4:1),nst:packet.nst??1,hashr:null};
 if(!si.rl)si.rl=packet.orl||tables[game.slug].initial.rl;
 if(!won){si.wp=null;si.lw=null;si.fs=game.id==='98'?false:null;si.rwsp=null;si.nst=1}
 if(packet.mrl){for(const v of Object.values(si.mrl)){const val=coefficients({mrl:{v}})*cs*ml;v.tw=round(val);if(v.wp)v.lw={'1':round(val)}}}
 const winCount=won&&value>0?(game.id==='1695365'?2:game.id==='68'?0:1):0;
 si.gwt=packet.gwt??(won?(game.id==='40'?1:-1):0);si.cwc=packet.cwc??winCount;si.pcwc=packet.pcwc??winCount;
 if(game.id==='48'&&won)si.slw=[value];
 if(game.id==='126')Object.assign(si,{wc:won?17:31,itw:!won,gwt:won?si.tbb:-1,cwc:won?si.tbb:0,pcwc:won?si.tbb:0});
 if(state.pending)state.pending.aw=si.aw;
 state.last=si;return reply({dt:{si},err:null});
 }catch(e){console.error('API',u.pathname,e.message);return reply(error(e.message),400)}
}
