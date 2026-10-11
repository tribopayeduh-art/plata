import games from './data/games.json' with {type:'json'};
import tables from './data/game-tables.json' with {type:'json'};
export {games,tables};
export const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/2**32;
export const round=x=>Math.round(x*100)/100;
export function packets(x){return x.rl||x.orl||x.mrl?[x]:Object.values(x)}
const sum=value=>value&&typeof value==='object'?Object.values(value).reduce((a,b)=>a+sum(b),0):Number(value)||0;
export function coefficients(x){
 if(x.mrl)return Object.values(x.mrl).reduce((sum,v)=>{if(!v.wp)return sum;const a=v.orl;const symbol=a.find(y=>a.filter(z=>z===y).length>=2);return sum+({1:100,2:50,3:25}[symbol]||5)},0);
 return sum(x.rwsp||{});
}
export function pick(game,rng=random){const t=tables[game.slug],mean=t.wins.reduce((a,w)=>a+packets(w).reduce((b,p)=>b+coefficients(p),0)/game.lines,0)/t.wins.length;const won=rng()<Math.min(1,.20/mean);const pool=won?t.wins:t.losses;const index=Math.floor(rng()*pool.length);return {won,index,packets:packets(pool[index]),mean}}
