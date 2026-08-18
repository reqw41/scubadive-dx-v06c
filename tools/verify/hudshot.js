"use strict";
const fs=require("fs"),zlib=require("zlib");
const {make,readSym}=require("/Users/boris/projects/scubadive-i8080/tools/verify/harness.js");
const rom=process.argv[2],out=process.argv[3];
const S=readSym(rom.replace(/scuba\.rom$/,"scubacod1.sym"));
const m=make(rom,{cpu:"i8080"});
// ЖДЁМ СОБЫТИЕ, А НЕ КАДР. Подбор номеров кадров сломался сразу после склейки
// меню и стоил двух пустых прогонов: сначала ждём появления экрана меню (LEE2C),
// потом ДЕРЖИМ «газ» до срабатывания START_GAME и только тогда отпускаем.
let f=0,started=false,menu=false;
m.onPc(S.LEE2C,()=>{menu=true;});
m.onPc(S.START_GAME,()=>{started=true;});
// СБОРКА С КАРТИНКОЙ СТОИТ НА ТИТУЛЕ, пока не нажмут клавишу. Пробник без
// нажатия ждал меню вечно — это моя ошибка, не регрессия кода.
let title=false;
if(S.WaitAnyKey_1!=null) m.onPc(S.WaitAnyKey_1,()=>{title=true;});
for(;f<2000&&!title&&!menu;f++) m.step();
if(title){ m.key(13,true); for(let i=0;i<8;i++){m.step();f++;} m.key(13,false); }
for(;f<3000&&!menu;f++) m.step();
if(!menu){console.log("НЕ ДОШЛИ ДО МЕНЮ");process.exit(2);}
for(let i=0;i<20;i++){m.step();f++;}          // дать меню дорисоваться
m.key(38,true);
for(;f<3000&&!started;f++) m.step();
m.key(38,false);
if(!started){console.log("ИГРА НЕ ЗАПУСТИЛАСЬ");process.exit(2);}
for(let i=0;i<200;i++) m.step();               // дать HUD и поле отрисоваться
const crcT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
const crc=b=>{let c=0xffffffff;for(let i=0;i<b.length;i++)c=crcT[(c^b[i])&0xff]^(c>>>8);return c^0xffffffff;};
const ch=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tt=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(tt)>>>0);return Buffer.concat([l,tt,c]);};
const vc=p=>[(p&7)*36,((p>>3)&7)*36,((p>>6)&3)*85];
const PAL=[0x00,0xDB,0xBF,0x07].map(vc);
const W=256,H=256,rgb=Buffer.alloc(W*H*3);
for(let y=0;y<H;y++){const lo=255-y;
 for(let col=0;col<32;col++){const a=m.rd(0xC000+col*256+lo),b=m.rd(0xE000+col*256+lo);
  for(let bit=7;bit>=0;bit--){const c=PAL[(((a>>bit)&1)<<1)|((b>>bit)&1)];const x=col*8+(7-bit),o=(y*W+x)*3;rgb[o]=c[0];rgb[o+1]=c[1];rgb[o+2]=c[2];}}}
const raw=Buffer.alloc(H*(W*3+1));
for(let y=0;y<H;y++){raw[y*(W*3+1)]=0;rgb.copy(raw,y*(W*3+1)+1,y*W*3,(y+1)*W*3);}
const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=2;
fs.writeFileSync(out,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch("IHDR",ih),ch("IDAT",zlib.deflateSync(raw)),ch("IEND",Buffer.alloc(0))]));
console.log("снимок "+out+"; игра "+(started?"запущена":"НЕ запущена"));
