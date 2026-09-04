"use strict";
// ГИБЕЛЬ С ПОСЛЕДНЕЙ ЖИЗНЬЮ → GAME OVER → МЕНЮ → ДЕМО: остаётся ли на экране демо
// взрыв дайвера из прошлой игры. CPU=z80 для оригинала. Снимок демо в <prefix>_demo.png
const fs=require("fs"),zlib=require("zlib");
const {reachGame,KEY}=require("./drive.js");
const rom=process.argv[2],pre=process.argv[3]||"god";
const sym=rom.replace(/scuba\.rom$/,"scubacod1.sym");
const g=reachGame(rom,sym,{cpu:process.env.CPU||"i8080",level:1,seed:1});
const {m,S}=g,D=S.DiverObj;
let explo=0,menu=0,demo=0;
m.onPc(S.DiverExplosion,()=>{explo++;}); m.onPc(S.LEE2C,()=>{menu++;}); m.onPc(S.LEF12,()=>{demo++;});
const hold=(k,n)=>{m.key(k,true);for(let i=0;i<n;i++)m.step();m.key(k,false);};
hold(KEY.UP,30); hold(KEY.RIGHT,60); hold(KEY.UP,130);
m.wr(S.LIVES,1);
for(let i=0;i<600&&explo===0;i++){ m.wr(S.OXYGEN,0); m.wr(S.OXYGEN+1,1); m.step(); }
if(!explo){console.log("взрыва не случилось");process.exit(2);}
const st=()=>`spr=${(m.rd(D+0x0A)<<8|m.rd(D+0x09)).toString(16)} f10=${m.rd(D+0x10).toString(2).padStart(8,"0")} f26=${m.rd(D+0x26).toString(16)} col=${m.rd(D+0x18)} row=${m.rd(D+0x19)} lives=${m.rd(S.LIVES)}`;
console.log("взрыв:",st());
for(let i=0;i<3000&&menu===0;i++) m.step();
console.log(menu?"меню достигнуто":"МЕНЮ НЕ ДОСТИГНУТО", st());
for(let i=0;i<6000&&demo<150;i++) m.step();
console.log(demo>=150?"демо идёт":"ДЕМО НЕ НАСТУПИЛО", st());
const S0=require("./harness.js").readSym(rom.replace(/scuba\.rom$/,"scubacod0.sym"));
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
shot(`${pre}_demo.png`);
// есть ли пиксели в клетке дайвера (3x3 знакоместа вокруг col,row) — на демо там ничего быть не должно
const cx=m.rd(D+0x18),cy=m.rd(D+0x19);let n=0;
for(let col=cx-1;col<=cx+2;col++)for(let r=cy*8-8;r<cy*8+24;r++){if(col<0||col>31||r<0||r>=192)continue;const lo=191-r;if(m.rd(0xC000+col*256+lo)|m.rd(0xE000+col*256+lo))n++;}
console.log(`байтов с пикселями в клетке дайвера на экране демо: ${n}`);
