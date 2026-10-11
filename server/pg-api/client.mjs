import catalog from './catalog.json' with {type:'json'};
export const pgCatalog=catalog;
export const isPgProvider=value=>/^(pgsoft|pg|pocketgames|pocketgamesoft)$/i.test(String(value||'').replace(/[ _-]/g,''));
export const pgProviders=rows=>[{id:'PGSOFT',code:'PGSOFT',name:'PG SOFT',image:'/providers/pgsoft.png'},...rows.filter(p=>!isPgProvider(p.code||p.id))];
export function pgGames(rows,provider=''){return [...(!provider||isPgProvider(provider)?catalog:[]),...rows.filter(g=>!isPgProvider(g.providerCode))];}
export function createPgApiClient({url,token,fetcher=fetch}){
 const base=new URL(url||'https://pg-api-eduh.eduhhotmart.chatgpt.site');
 if(base.protocol!=='https:')throw new Error('PG_API_URL deve usar HTTPS.');
 return async function call(path,body){
  if(!token)throw Object.assign(new Error('Configure PG_API_TOKEN no servidor da bet.'),{status:503});
  let r;for(let attempt=0;attempt<2;attempt++){try{r=await fetcher(new URL('/api/pg/v1/'+path,base),{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(attempt===0&&[502,503,504].includes(r.status))continue;break;}catch(error){if(attempt===1)throw Object.assign(new Error('Não foi possível conectar à API PG. Verifique a internet e tente novamente.'),{status:502});}}
  const d=await r.json().catch(()=>null);
  if(!r.ok||!d)throw Object.assign(new Error(d?.message||'A API PG não respondeu corretamente.'),{status:r.status>=400?r.status:502});
  if(path==='launch'){const launch=new URL(d.launch_url,base);if(launch.origin!==base.origin||!launch.searchParams.get('pg_ticket'))throw Object.assign(new Error('Sessão PG incompatível. Atualize a API.'),{status:502});d.launch_url=launch.href;}
  return d;
 };
}
export async function launchPgPlayer(call,uid,code){if(!catalog.some(g=>g.code===code))throw Object.assign(new Error('Jogo PG não encontrado.'),{status:404});return call('launch',{player_id:uid,game_code:code});}
