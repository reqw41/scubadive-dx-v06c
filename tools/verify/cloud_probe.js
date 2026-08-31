// ПРОБНИК ОБЛАКОВ (-DCLOUDS): параллакс от столбца карты и клип у края экрана.
//   node tools/verify/cloud_probe.js <scuba.rom> [строка мини-карты для подсадки столбца]
// Доводит игру до первой отрисовки неба, читает столбец карты L5B03 и таблицу
// CloudShapes из памяти, СЧИТАЕТ ожидаемые экранные столбцы сам (V = (base −
// 2*col + i) & 63, видимы только V < 32) и сверяет с фактом: биты 0xC000 в
// строках 0..25 стоят ровно в предсказанных столбцах, под ними 0xE000 погашен,
// облака НЕ рвутся (нет пары занятых столбцов 31 и 0 от одного облака, если
// его байты в полосе не соседние). Вторым аргументом можно подсадить столбец
// карты (poke L5B03) перед отрисовкой — проверка клипа на любом смещении.
"use strict";
const {make,readSym}=require("./harness.js");
const rom=process.argv[2], poke=process.argv[3]!=null?parseInt(process.argv[3],10):null;
const S=readSym(rom.replace(/scuba\.rom$/,"scubacod1.sym"));
for(const n of ["LEE2C","START_GAME","DrawClouds","CloudShapes","L5B03"]) if(S[n]==null){console.log("нет метки "+n);process.exit(2);}
const m=make(rom,{cpu:"i8080"});
let menu=false,started=false,draws=0;
m.onPc(S.LEE2C,()=>{menu=true;});
m.onPc(S.START_GAME,()=>{started=true;});
m.onPc(S.DrawClouds,()=>{ if(draws===0&&poke!=null) m.wr(S.L5B03,poke&31); draws++; });
let f=0; for(;f<3000&&!menu;f++) m.step();
if(!menu){console.log("НЕ ДОШЛИ ДО МЕНЮ");process.exit(2);}
for(let i=0;i<20;i++) m.step();
m.key(38,true); for(f=0;f<3000&&!started;f++) m.step(); m.key(38,false);
for(let i=0;i<1500&&draws===0;i++) m.step();
if(draws===0){console.log("DrawClouds НЕ ВЫЗЫВАЛСЯ за 1500 кадров");process.exit(2);}
for(let i=0;i<10;i++) m.step();
const col=m.rd(S.L5B03)&31, off=(64-2*col)&63;
// таблица форм из памяти
const want=new Set(); let p=S.CloudShapes; const clouds=[];
for(;;){ const base=m.rd(p); if(base===0xFF) break;
  const y=m.rd(p+1), w=m.rd(p+2), h=m.rd(p+3); const vis=[];
  for(let i=0;i<w;i++){ const v=(base+off+i)&63; if(v<32){want.add(v); vis.push(v);} }
  clouds.push({base,vis}); p+=4+w*h; }
const got=new Set(),bad=[];
for(let c=0;c<32;c++){ let y=0,e=0;
  for(let r=0;r<=25;r++){ const a=m.rd(0xC000+c*256+255-r), b=m.rd(0xE000+c*256+255-r); if(a){y=1; if(a&b) e=1;} }
  if(y) got.add(c); if(e) bad.push(c); }
const eq=want.size===got.size&&[...want].every(v=>got.has(v));
console.log(`столбец карты ${col}, смещение полосы ${off}; облака (полоса→экран): `+clouds.map(c=>`${c.base}→[${c.vis.join(",")}]`).join("  "));
console.log(`ожидаемые столбцы: ${[...want].sort((a,b)=>a-b).join(",")||"нет"}`);
console.log(`фактические:      ${[...got].sort((a,b)=>a-b).join(",")||"нет"}`);
console.log(`0xE000 не погашен: ${bad.length?bad.join(","):"нет"}`);
console.log(eq&&!bad.length?"ОК":"РАСХОЖДЕНИЕ");
process.exit(eq&&!bad.length?0:1);
