// РАСКЛАДКА ВЫСЕЛЕНИЯ В ЛОМТИ: что именно переселять и во сколько ломтей.
//
// Главное ограничение найдено замером, а не рассуждением: игра ХОДИТ ЧЕРЕЗ
// границы блоков — читает последний байт одного и сразу первый байт соседнего.
// Такие пары нельзя разносить по разным ломтям, и здесь они склеиваются в
// неразрывные единицы. Замер на двух уровнях по 800 тиков: 38 склеенных границ.
//
//   node tools/verify/zone_pack.js
//
// Упаковка с учётом СКЛЕЕК: блоки, через границу которых игра ходит, объединяются
// в неразрывные единицы. Единица больше 64 Б в ломоть не влезает и выбывает.
"use strict";
const { reachGame } = require("/Users/boris/projects/scubadive-i8080/tools/verify/drive.js");
const { readSym } = require("/Users/boris/projects/scubadive-i8080/tools/verify/harness.js");
const R="/Users/boris/projects/scubadive-i8080/build/gz/";
const S = readSym(R+"scubacod1.sym");
const SPR_END=0x8E90, NEED=4437;
const labs=Object.entries(S).filter(([k,v])=>v>=0x1000&&v<SPR_END).sort((a,b)=>a[1]-b[1]);
const addrs=labs.map(x=>x[1]);
const welded=new Set();
function scan(lvl,ticks){
  let prev=-1,started=false;
  const isStart=new Set(addrs);
  const g=reachGame(R+"scuba.rom",R+"scubacod1.sym",{cpu:"i8080",level:lvl,seed:0x0167,
    preHook:m=>{const o=m.memory.read.bind(m.memory);
      m.memory.read=(a,st)=>{a&=0xffff;
        if(started&&a>=0x1000&&a<SPR_END){ if(prev===a-1&&isStart.has(a)) welded.add(a); prev=a; }
        else if(started) prev=-1; return o(a,st);};}});
  let t=0; g.m.onPc(S.LD9C0,()=>{t++;started=true;});
  let guard=0; while(t<ticks&&guard<300000){g.m.step();guard++;}
}
scan(4,800); scan(1,800);
console.log(`склеенных границ найдено: ${welded.size}`);
// собрать единицы: подряд идущие блоки, склеенные между собой
const units=[]; let i=0;
while(i<labs.length-1){
  let j=i; while(j+1<labs.length-1 && welded.has(addrs[j+1])) j++;
  const start=addrs[i], end=addrs[j+1];
  units.push({sz:end-start, n:j-i+1, name:labs[i][0], addr:start});
  i=j+1;
}
const fit=units.filter(u=>u.sz>0&&u.sz<=64);
console.log(`единиц всего ${units.length}, из них <=64 Б: ${fit.length} на ${fit.reduce((s,u)=>s+u.sz,0)} Б`);
console.log(`  выбыло крупных единиц (>64 Б): ${units.filter(u=>u.sz>64).length}`);
const avail=[...fit].sort((a,b)=>b.sz-a.sz);
const used=new Set(); const bins=[]; let acc=0;
while(acc<NEED){
  let rest=64, items=[];
  for(const u of avail){ if(used.has(u.name)) continue;
    if(u.sz<=rest){used.add(u.name);items.push(u);rest-=u.sz;acc+=u.sz;if(rest===0)break;} }
  if(!items.length) break;
  bins.push(64-rest);
}
const exact=bins.filter(b=>b===64).length;
console.log(`УПАКОВКА: ${bins.length} ломтей, ${used.size} единиц, ${acc} Б`);
console.log(`  заполнено ровно 64 Б: ${exact} из ${bins.length}, потери ${bins.length*64-acc} Б`);
console.log(`  ${bins.length<=80?"ВЛЕЗАЕТ":"НЕ ВЛЕЗАЕТ"} в 80 ломтей, запас ${80-bins.length}`);
