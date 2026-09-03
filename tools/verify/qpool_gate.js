"use strict";
// Без QPOOL в образе гейт неприменим: выходит зелёным с пометкой.
// ГЕЙТ QPOOL: инварианты выдачи: класс = f(след типа), выравнивание (IX+07) по классу, живые отрезки не пересекаются,
// бронь (страницы 0 и 13) не выдаётся; освобождение снимает ровно отрезок.
const {reachGame,KEY}=require("./drive.js");
const [rom,sym]=process.argv.slice(2,4); const LVL=+(process.argv[4]||4), NT=+(process.argv[5]||4000);
const g=reachGame(rom,sym,{cpu:"i8080",level:LVL,seed:0x167}); const m=g.m,S=g.S;
if(S.PQ_free==null){ console.log("ГЕЙТ ЗЕЛЁНЫЙ: QPOOL в образе нет — сверять нечего"); process.exit(0); }
const lastOwner=new Map(); let allocs=0,bad=0,frees=0; const live=new Map(); const pre=new Set(); for(let q=0;q<64;q++) if(m.rd(S.LB676+q)&0x80) pre.add(q);
const cls=n=>n<=64?1:n<=128?2:4;
m.onPc(S.LB655_marked,()=>{ allocs++; const ix=m.rdw(S.z80_ix), iy=m.rdw(S.z80_iy); const n=m.rd(iy+9)*m.rd(iy+0x0A)||256; const c=cls(n);
  const lo=m.rd(ix+7), hi=m.rd(ix+8); const q0=((hi&0x0F)<<2)|(lo>>6);
  const errs=[]; if(lo&0x3F) errs.push(`lo=${lo.toString(16)}`); if(q0%c) errs.push(`невыровнено q0=${q0} c=${c}`); if((hi&0xF0)!==0xB0) errs.push(`hi=${hi.toString(16)}`);
  if(q0<4||(q0>=52&&q0<56)) errs.push(`бронь q0=${q0}`);
  for(const [r,[a,k]] of live) if(r!==ix && q0<a+k && a<q0+c) errs.push(`пересечение с ${r.toString(16)} [${a},${a+k})`);
  // таблица: голова 80, продолжения C0
  for(let i=0;i<c;i++){const v=m.rd(S.LB676+q0+i); if(v!==(i?0xC0:0x80)) errs.push(`таблица[${q0+i}]=${v.toString(16)}`);}
  live.set(ix,[q0,c]); for(let i=0;i<c;i++) lastOwner.set(q0+i,{ix,iy,t:ticks,c}); if(errs.length){bad++; if(bad<=5) console.log(`выдача #${allocs} ${errs.join("; ")}`);} });
m.onPc(S.PQ_free,()=>{ frees++; const ix=m.rdw(S.z80_ix); if(process.env.LOGFREE) console.log(`free t=${ticks} ix=${ix.toString(16)} +07/08=${m.rd(ix+7).toString(16)}/${m.rd(ix+8).toString(16)} live=${live.has(ix)}`); const lo=m.rd(ix+7),hi=m.rd(ix+8); const q0=((hi&0x0F)<<2)|(lo>>6); const e=live.get(ix); if(!e){ pre.delete(q0); for(let i=1;i<4;i++){ if(m.rd(S.LB676+q0+i)&0x40) pre.delete(q0+i); else break; } return; } live.delete(ix); });
let resets=0; m.onPc(S.LBEC7,()=>{ resets++; live.clear(); pre.clear(); });
let ticks=0; m.onPc(S.LD9C0,()=>{ticks++; m.wr(S.LIVES,3);m.wr(S.OXYGEN,0xff);m.wr(S.OXYGEN+1,0xff);
  // после освобождения: таблица должна быть 0 на всех неживых четвертях вне брони
  if(ticks%50===0){ const busy=new Set(); for(const [r,[a,k]] of live) for(let i=0;i<k;i++) busy.add(a+i); for(let q=4;q<52;q++){ const v=m.rd(S.LB676+q); if((v&0x80) && !busy.has(q) && !pre.has(q)){bad++; if(bad<=3){ const o=lastOwner.get(q); const info=o?`последний владелец ix=${o.ix.toString(16)} (${(o.iy-0).toString(16)}) выдан t=${o.t} класс ${o.c}; сейчас у записи +07/08=${m.rd(o.ix+7).toString(16)}/${m.rd(o.ix+8).toString(16)} +0D=${m.rd(o.ix+0x0D).toString(16)} в live=${live.has(o.ix)}`:'владельца не было'; console.log(`t=${ticks}: четверть ${q} занята (${v.toString(16)}) без живого владельца; ${info}`);} break;} } }
});
let guard=0; const D=[[KEY.UP],[KEY.UP,KEY.RIGHT],[KEY.UP,KEY.LEFT],[KEY.DOWN]]; let held=[],di=-1;
while(ticks<NT&&guard<9000000){ const ph=Math.floor(ticks/90)%4; if(ph!==di){for(const k of held)m.key(k,false);di=ph;held=D[di];for(const k of held)m.key(k,true);} m.step();guard++; }
const okN = allocs>=10 && ticks>=NT-5;
console.log(`${bad||!okN?"ГЕЙТ КРАСНЫЙ":"ГЕЙТ ЗЕЛЁНЫЙ"}: QPOOL ур.${LVL}: ${ticks} тиков, выдач ${allocs}, освобождений ${frees}, сбросов таблицы ${resets}, нарушений ${bad}${okN?"":" (выборка мала)"}`);
process.exit(bad||!okN?1:0);
