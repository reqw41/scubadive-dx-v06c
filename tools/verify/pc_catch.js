// ЛОВЕЦ ПЕРЕХОДА: кольцо последних 24 PC и вершина стека в момент, когда PC
// впервые опускается ниже заданной границы. Если это ret по испорченному стеку,
// предыдущий PC покажет чужое место, а виновника назовёт содержимое стека.
//
// ЧЕМ ЭТОТ ИНСТРУМЕНТ УЖЕ ОКУПИЛСЯ: он опроверг два моих диагноза подряд.
// Первый — «процессор исполняет данные»: пойманный переход оказался обычным
// CALL PrepareMiniMap по 0x44CA, а 0x44CA лежит НИЖЕ метки «Code start» просто
// потому, что код есть и в scubacodb.asm, ниже неё. Метка «Code start» — не
// граница кода, а место, где начинается scubacodc.asm.
// Второй — «зависли в LB1EE»: 30769 попаданий за 200 кадров это не зависание,
// а самый горячий цикл игры, который просто чаще всех попадается в выборку.
//
// ВАЖНО: крючок ОБОРАЧИВАЕТ check_breakpoint, а не подменяет. Подмена убивает
// диспетчер крючков стенда (onPc), и прогон падает на «PC не дошёл» — на этом
// я потерял прогон, хотя предупреждение висит в комментарии prof8080.js.
"use strict";
const { make, readSym } = require("/Users/boris/projects/scubadive-i8080/tools/verify/harness.js");
const R="/Users/boris/projects/scubadive-i8080/build/ev70/";
const S=readSym(R+"scubacod1.sym");
const CODE0=0x7CF5;               // Code start этой сборки
const KEY={ENTER:13,UP:38};
const m=make(R+"scuba.rom",{cpu:"i8080"});
const labs=Object.entries(S).filter(([k,v])=>v<0xC000).sort((a,b)=>a[1]-b[1]);
const proc=a=>{let lo=0,hi=labs.length-1,x=null;while(lo<=hi){const md=(lo+hi)>>1;
  if(labs[md][1]<=a){x=labs[md];lo=md+1;}else hi=md-1;}return x?`${x[0]}+${a-x[1]}`:"?";};
const ring=new Array(24).fill(0); let ri=0, caught=false, armed=false;
const origCb=m.v06c.check_breakpoint;
m.v06c.check_breakpoint=()=>{
  const pc=m.cpu.pc&0xffff;
  if(armed && !caught && pc<CODE0 && pc>=0x1000){
    caught=true;
    console.log(`ПЕРЕХОД В ДАННЫЕ: PC=0x${pc.toString(16)} (${proc(pc)})`);
    console.log("кольцо последних 24 PC (старые -> новые):");
    for(let k=0;k<24;k++){const p=ring[(ri+k)%24]; if(p) console.log(`   0x${p.toString(16)} ${proc(p)}`);}
    const sp=m.cpu.sp&0xffff;
    console.log(`SP=0x${sp.toString(16)}, вершина стека:`);
    for(let k=0;k<6;k++){const a=(sp+k*2)&0xffff; const w=m.rd(a)|(m.rd(a+1)<<8);
      console.log(`   [0x${a.toString(16)}] = 0x${w.toString(16)} ${proc(w)}`);}
  }
  ring[ri]=pc; ri=(ri+1)%24;
  return origCb();
};
let started=false; m.onPc(S.START_GAME,()=>{started=true;});
m.runUntilPc(S.WaitAnyKey_1,3000);
m.key(KEY.ENTER,true); m.run(4); m.key(KEY.ENTER,false);
m.runUntilPc(S.LEE2C,600);
armed=true;
m.key(KEY.UP,true);
for(let i=0;i<400&&!started;i++) m.step();
m.key(KEY.UP,false);
for(let i=0;i<200&&!caught;i++) m.step();
if(!caught) console.log("перехода в данные не случилось");
