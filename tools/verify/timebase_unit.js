"use strict";
// ГЕЙТ TIMEBASE: юнит-тест АРИФМЕТИКИ TIMEBASE на живом обходе группы I (LBE9A): счётчики 0..255, Δ = 1,2,3,8.
// Модель: t' = t-Δ; срабатывает <=> t <= Δ; после LB737 (+0F := период) счётчик := период - (Δ-t).
const {reachGame}=require("./drive.js");
const [rom,sym]=process.argv.slice(2,4);
const g=reachGame(rom,sym,{cpu:"i8080",level:4,seed:0x167}); const m=g.m,S=g.S;
const n=m.rd(S.NumRecsI), base=S.LC4F0, st=21;
let fired=[]; m.onPc(S.LB737,()=>{fired.push((m.rdw(S.z80_ix)-base)/st);});
const patterns=[Array.from({length:n},(_,i)=>i*5&0xff), Array.from({length:n},(_,i)=>[0,1,2,3,8,9,127,128,200,255][i%10]), Array.from({length:n},(_,i)=>(i*37+3)&0xff)];
const tests=[]; for(const D of [1,2,3,8]) for(const pat of patterns) tests.push({D,pat});
let cur=null, bad=0, done=0, idx=0;
m.onPc(S.LD9C0,()=>{
  if(cur){ // проверка результата
    const {D,pat,P}=cur; const wantFire=[],wantT=[];
    for(let i=0;i<n;i++){ const t=pat[i]; if(t<=D){ wantFire.push(i); wantT.push((P[i]-(D-t))&0xff);} else wantT.push((t-D)&0xff); }
    const gotT=[]; for(let i=0;i<n;i++) gotT.push(m.rd(base+i*st+0x0F));
    const okF=JSON.stringify(fired)===JSON.stringify(wantFire), okT=JSON.stringify(gotT)===JSON.stringify(wantT);
    done++; if(!okF||!okT){ bad++; if(bad<=3) console.log(`Δ=${D}: ${okF?"":"СРАБАТЫВАНИЯ "+JSON.stringify(fired)+" vs "+JSON.stringify(wantFire)+" "}${okT?"":"СЧЁТЧИКИ "+gotT.map((v,i)=>v!==wantT[i]?`${i}:${v}/${wantT[i]}(t=${pat[i]})`:"").filter(Boolean).slice(0,6).join(" ")}`); }
    cur=null;
  }
  if(idx<tests.length){ const {D,pat}=tests[idx++]; const P=[]; for(let i=0;i<n;i++){ m.wr(base+i*st+0x0F,pat[i]); P.push(m.rd(base+i*st+0x0E)); }
    m.wr(S.tb_delta,D); fired=[]; cur={D,pat,P}; m.cpu.call(S.LBE9A); }
});
let guard=0; while(done<tests.length&&guard<3000000){ m.step(); guard++; }
console.log(`юнит-тест TIMEBASE (LBE9A, ${n} записей): ${done} прогонов, расхождений ${bad}`);
