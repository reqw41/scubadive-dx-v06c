"use strict";
const R="/Users/boris/projects/scubadive-i8080/tools/verify";
const {reachGame}=require(R+"/drive.js");
const {readSym}=require(R+"/harness.js");
const rom=process.argv[2],sym=process.argv[3],LVL=+(process.argv[4]||4);
const S=readSym(sym);
const g=reachGame(rom,sym,{cpu:"i8080",level:LVL,seed:0x0167});
const m=g.m;
let t=0; m.onPc(S.LD9C0,()=>{t++});
while(t<60) m.step();
const base=S.MiniMap;
if(base==null){console.log("нет метки MiniMap");process.exit(2);}
const hits=[];
for(let i=0;i<0x400;i++) if(m.rd(base+i)===0x1C) hits.push(i);
console.log(`уровень ${LVL}: блоков $1C (место осьминога) на мини-карте: ${hits.length}`);
for(const i of hits.slice(0,8)) console.log(`  индекс ${i} -> строка ${i>>5}, столбец ${i&31}`);
const cnt={};
for(let i=0;i<0x400;i++){const v=m.rd(base+i);cnt[v]=(cnt[v]||0)+1;}
console.log("частоты блоков:", Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>`0x${(+k).toString(16)}:${v}`).join(" "));
