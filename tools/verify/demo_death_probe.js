"use strict";
// ПРОБА ГИБЕЛИ В ДЕМО: доходим до аттракта (LEF12), убиваем дайвера кислородом и
// смотрим, меняется ли область взрыва по тикам демо; снимки +10/+100/+300 тиков.
//   CPU=z80 node demo_death_probe.js build/src/scuba.rom out_prefix
const fs=require("fs"),zlib=require("zlib");
const {make,readSym}=require("./harness.js");
const rom=process.argv[2],pre=process.argv[3]||"dd";
const S=readSym(rom.replace(/scuba\.rom$/,"scubacod1.sym")),S0=readSym(rom.replace(/scuba\.rom$/,"scubacod0.sym"));
const m=make(rom,{cpu:process.env.CPU||"i8080"});
let menu=false,title=false,demo=0,explo=0;
m.onPc(S.LEE2C,()=>{menu=true;}); if(S.WaitAnyKey_1!=null) m.onPc(S.WaitAnyKey_1,()=>{title=true;});
m.onPc(S.LEF12,()=>{demo++;}); m.onPc(S.DiverExplosion,()=>{explo++;});
let f=0; for(;f<2000&&!title&&!menu;f++) m.step();
if(title){m.key(13,true);for(let i=0;i<8;i++)m.step();m.key(13,false);}
for(;f<3000&&!menu;f++) m.step(); if(!menu){console.log("НЕ ДОШЛИ ДО МЕНЮ");process.exit(2);}
for(let i=0;i<6000&&demo<60;i++) m.step(); if(demo<60){console.log("ДЕМО НЕ НАСТУПИЛО");process.exit(2);}
const D=S.DiverObj;
const st=()=>`demo=${demo} spr=${(m.rd(D+0x0A)<<8|m.rd(D+0x09)).toString(16)} f10=${m.rd(D+0x10).toString(2).padStart(8,"0")} x=${m.rd(D+1)} y=${m.rd(D+2)}`;
console.log("в демо:",st());
for(let i=0;i<600&&explo===0;i++){ m.wr(S.OXYGEN,0); m.wr(S.OXYGEN+1,1); m.step(); }
if(!explo){console.log("взрыва в демо не случилось:",st());process.exit(2);}
const d0=demo; console.log("ВЗРЫВ:",st());
const vc=p=>[(p&7)*36,((p>>3)&7)*36,((p>>6)&3)*85];const PAL=[0,1,2,3].map(i=>vc(m.rd(S0.PaletteGame+i)));
const crcT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
const crc=b=>{let c=0xffffffff;for(let i=0;i<b.length;i++)c=crcT[(c^b[i])&0xff]^(c>>>8);return c^0xffffffff;};
const ch=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tt=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(tt)>>>0);return Buffer.concat([l,tt,c]);};
function shot(out){const W=256,H=192,rgb=Buffer.alloc(W*H*3);
 for(let y=0;y<H;y++){const lo=191-y;for(let col=0;col<32;col++){const a=m.rd(0xC000+col*256+lo),b=m.rd(0xE000+col*256+lo);
  for(let bit=7;bit>=0;bit--){const c=PAL[(((a>>bit)&1)<<1)|((b>>bit)&1)];const x=col*8+(7-bit),o=(y*W+x)*3;rgb[o]=c[0];rgb[o+1]=c[1];rgb[o+2]=c[2];}}}
 const raw=Buffer.alloc(H*(W*3+1));for(let y=0;y<H;y++){raw[y*(W*3+1)]=0;rgb.copy(raw,y*(W*3+1)+1,y*W*3,(y+1)*W*3);}
 const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=2;
 fs.writeFileSync(out,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch("IHDR",ih),ch("IDAT",zlib.deflateSync(raw)),ch("IEND",Buffer.alloc(0))]));}
// область вокруг дайвера: 6 столбцов и 48 строк вокруг его знакоместа
const cx=m.rd(D+0x18),cy=m.rd(D+0x19); console.log("знакоместо дайвера col",cx,"row",cy);
const hashArea=()=>{let h=0;for(let col=Math.max(0,cx-2);col<Math.min(32,cx+5);col++)for(let r=Math.max(0,cy*8-16);r<Math.min(192,cy*8+40);r++){const lo=191-r;h=(h*31+m.rd(0xC000+col*256+lo)*3+m.rd(0xE000+col*256+lo))>>>0;}return h.toString(16).slice(0,6);};
const seq=[];let last=-1,done=new Set();
for(let i=0;i<2000&&demo-d0<300;i++){m.step(); if(demo!==last){last=demo;seq.push(hashArea());}
  for(const k of [10,100,300]) if(demo-d0>=k&&!done.has(k)){done.add(k);shot(`${pre}_${k}.png`);}}
const u=[...new Set(seq)];
console.log(`тиков демо после взрыва: ${demo-d0}; разных состояний области: ${u.length}; первые смены на тиках:`,
  seq.map((h,i)=>[h,i]).filter(([h,i],k)=>k===0||seq[k-1]!==h).slice(0,12).map(([h,i])=>i+":"+h).join(" "));
console.log("конец:",st());
