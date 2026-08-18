// ОСЬМИНОГ: живёт ли анимация. Логируем флаг присутствия L9C50, фазу L9C55 и
// указатель «предыдущего спрайта» L9C53 по игровым тикам.
// Осьминог — глубинный житель, поэтому строка мини-карты держится принудительно.
"use strict";
const R="/Users/boris/projects/scubadive-i8080/tools/verify";
const {reachGame}=require(R+"/drive.js");
const {readSym}=require(R+"/harness.js");
const rom=process.argv[2],sym=process.argv[3],cpu=process.argv[4]||"i8080";
const ROW=+(process.argv[5]||4), COL=+(process.argv[8]||11), LVL=+(process.argv[6]||4), NT=+(process.argv[7]||1200);
const S=readSym(sym);
for(const n of ["L9C50","L9C51","L9C53","L9C55","LD9C0","L5B03"])
  if(S[n]==null){console.log("нет метки "+n);process.exit(2);}
// Экран игры рисуется в PrepareGame->DrawGameScr ОДИН раз при входе, и именно там
// выставляется флаг присутствия осьминога. Поэтому позицию на мини-карте
// подставляем ДО этого вызова, а не после — иначе перерисовки не будет вовсе.
const g=reachGame(rom,sym,{cpu,level:LVL,seed:0x0167,preHook:(mm,SS)=>{
  mm.onPc(SS.PrepareGame,()=>{ mm.wr(SS.L5B03,+(process.argv[8]||11)); mm.wr(SS.L5B03+1,+(process.argv[5]||4)); });
}});
const m=g.m;
let t=0, present=0, phases=new Map(), ptrs=new Map(), changes=0, prevPtr=-1, prevPh=-1, phChanges=0;
const log=[];
// ОСЬМИНОГ РОЖДАЕТСЯ ТАМ, ГДЕ БЛОК МИНИ-КАРТЫ РАВЕН $1C, и только при перерисовке
// экрана (DrawGameScr). Довести туда автопилот не вышло, а подставить позицию
// нельзя — инициализация уровня её перетирает. Поэтому наоборот: засеваем блоками
// $1C полосу мини-карты вокруг маршрута игрока. Рельеф при этом становится
// искусственным, но нас интересует ровно одно — двигается ли фаза осьминога.
m.onPc(S.LD9C0,()=>{
  t++;
  if(t===40){ for(let r=0;r<8;r++) for(let c=0;c<32;c++) m.wr(S.MiniMap+r*32+c,0x1C); }
  const fl=m.rd(S.L9C50);
  if(!fl) return;
  present++;
  const ph=m.rd(S.L9C55), ptr=m.rdw(S.L9C53);
  phases.set(ph,(phases.get(ph)||0)+1);
  ptrs.set(ptr,(ptrs.get(ptr)||0)+1);
  if(prevPtr>=0&&ptr!==prevPtr) changes++;
  if(prevPh>=0&&ph!==prevPh){phChanges++; if(log.length<24) log.push(`тик ${t}: фаза ${prevPh}->${ph}, спрайт 0x${ptr.toString(16)}`);}
  prevPtr=ptr; prevPh=ph;
});
m.key(38,true);
let gd=0;while(t<NT&&gd<600000){m.step();gd++}
console.log(`${cpu} ${rom}`);
console.log(`  тиков ${t}; осьминог на экране в ${present} тиках (${(100*present/t).toFixed(1)}%)`);
if(!present){console.log("  ОСЬМИНОГА НЕ БЫЛО НИ РАЗУ — выборка пуста, вывод делать нельзя");process.exit(0);}
console.log(`  смен фазы: ${phChanges}; смен указателя спрайта: ${changes}`);
console.log(`  фазы: ${[...phases].sort((a,b)=>a[0]-b[0]).map(([k,v])=>k+":"+v).join(" ")}`);
console.log(`  спрайтов различных: ${ptrs.size}`);
for(const l of log.slice(0,10)) console.log("   "+l);
