// ПРОБНИК ОБЛАКОВ (-DCLOUDS): перенос формации через край экрана и направление сдвига.
//   node tools/verify/cloud_probe.js <scuba.rom> [cloud_x на входе в первую отрисовку]
// Доводит игру до START_GAME, на первом заходе в DrawClouds подсаживает cloud_x
// (если задан), ждёт отрисовку и печатает: cloud_x/cloud_col после отрисовки,
// столбцы 0..31, где в строках 0..25 неба есть биты 0xC000 (облака) и — отдельно
// — столбцы, где в этих же строках под облаками остались биты 0xE000 (не погашен
// градиент: облако вышло бы коралловым). Ожидание при cloud_x=27: формация
// 2/13/24 + 28 -> столбцы 30,31,0,1 / 9,10 / 20,21,22 — облако через край.
"use strict";
const {make,readSym}=require("./harness.js");
const rom=process.argv[2], poke=process.argv[3]!=null?parseInt(process.argv[3],10):null;
const S=readSym(rom.replace(/scuba\.rom$/,"scubacod1.sym"));
for(const n of ["LEE2C","START_GAME","DrawClouds","cloud_x","cloud_col"]) if(S[n]==null){console.log("нет метки "+n);process.exit(2);}
const m=make(rom,{cpu:"i8080"});
let menu=false,started=false,draws=0;
m.onPc(S.LEE2C,()=>{menu=true;});
m.onPc(S.START_GAME,()=>{started=true;});
m.onPc(S.DrawClouds,()=>{ if(draws===0&&poke!=null) m.wr(S.cloud_x,poke); draws++; });
let f=0; for(;f<3000&&!menu;f++) m.step();
if(!menu){console.log("НЕ ДОШЛИ ДО МЕНЮ");process.exit(2);}
for(let i=0;i<20;i++) m.step();
m.key(38,true); for(f=0;f<3000&&!started;f++) m.step(); m.key(38,false);
if(!started){console.log("ИГРА НЕ ЗАПУСТИЛАСЬ");process.exit(2);}
// ЖДЁМ СОБЫТИЕ, А НЕ КАДР: DrawGameScr идёт после мелодии старта (> 200 кадров).
for(let i=0;i<1500&&draws===0;i++) m.step();
if(draws===0){console.log("DrawClouds НЕ ВЫЗЫВАЛСЯ за 1500 кадров");process.exit(2);}
for(let i=0;i<10;i++) m.step();
const cols=[],bad=[];
for(let c=0;c<32;c++){ let y=0,e=0;
  for(let row=0;row<=25;row++){ const a=m.rd(0xC000+c*256+255-row), b=m.rd(0xE000+c*256+255-row); if(a){y|=a; if(a&b) e=1;} }
  if(y) cols.push(c); if(e) bad.push(c); }
console.log(`DrawClouds заходов: ${draws}; cloud_x=${m.rd(S.cloud_x)} cloud_col=${m.rd(S.cloud_col)} (L5B03 столбец ${m.rd(S.L5B03)})`);
console.log("столбцы с облаками (строки 0..25, 0xC000): "+cols.join(","));
console.log("столбцы, где под облаком НЕ погашен 0xE000: "+(bad.length?bad.join(","):"нет"));
process.exit(bad.length?1:0);
