"use strict";
// ПРОБА АГОНИИ: доводим дайвера до гибели (кислород в ноль) и пишем по тикам
// указатель спрайта и счётчики DiverObj, плюс снимки на 10/100/200-м тике цикла
// смерти LD9F6. Сравнивать сборки: node death_probe.js <rom> <префикс_снимков>
const fs=require("fs"),zlib=require("zlib"),path=require("path");
const {reachGame,KEY}=require("./drive.js");
const rom=process.argv[2],pre=process.argv[3]||"death";
const sym=rom.replace(/scuba\.rom$/,"scubacod1.sym");
const g=reachGame(rom,sym,{cpu:process.env.CPU||"i8080",level:parseInt(process.env.LEVEL||"1"),seed:1});
const {m,S}=g;
let explo=0,agony=0,tick=0,log=[];
m.onPc(S.DiverExplosion,()=>{explo++;});
m.onPc(S.LD9F6,()=>{agony++;});
m.onPc(S.LD9C0,()=>{tick++;});
const D=S.DiverObj;
const snap=()=>({t:tick,ag:agony,fr:m.rd(S.FRAMES),spr:(m.rd(D+0x0A)<<8|m.rd(D+0x09)).toString(16),
  c0F:m.rd(D+0x0F),c0E:m.rd(D+0x0E),f10:m.rd(D+0x10).toString(2).padStart(8,"0"),f26:m.rd(D+0x26).toString(16),
  ang:m.rd(D+0x06),y:m.rd(D+0x02),x:m.rd(D+0x01),dl:S.tb_delta?m.rd(S.tb_delta):"-"});
// UP — тяга, LEFT/RIGHT — поворот; DOWN — тормоз (не направление!). Уйти под воду:
// тяга 30, поворот 60, тяга 130 — к этому моменту бит 7 (в воде) стоит и кислород тратится.
const hold=(k,n)=>{m.key(k,true);for(let i=0;i<n;i++)m.step();m.key(k,false);};
hold(KEY.UP,30); hold(KEY.RIGHT,60); hold(KEY.UP,130);
for(let i=0;i<20;i++) m.step();
console.log("до гибели:",JSON.stringify(snap()));
if(process.env.DEATH==="hit"){ // гибель от рельефа: нос вниз (угол 8) и тяга до удара
  m.wr(D+6,8); m.key(KEY.UP,true); for(let i=0;i<3000&&explo===0;i++) m.step(); m.key(KEY.UP,false);
}else{
for(let i=0;i<600&&explo===0;i++){ m.wr(S.OXYGEN,0); m.wr(S.OXYGEN+1,1); m.step(); }
}
if(!explo){console.log("взрыва не случилось");process.exit(2);}
console.log("ВЗРЫВ на тике",tick);
// PNG-писатель (как в hudshot.js)
const crcT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
const crc=b=>{let c=0xffffffff;for(let i=0;i<b.length;i++)c=crcT[(c^b[i])&0xff]^(c>>>8);return c^0xffffffff;};
const ch=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tt=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(tt)>>>0);return Buffer.concat([l,tt,c]);};
const vc=p=>[(p&7)*36,((p>>3)&7)*36,((p>>6)&3)*85];
const S0=require("./harness.js").readSym(rom.replace(/scuba\.rom$/,"scubacod0.sym"));
const PAL=[0,1,2,3].map(i=>vc(m.rd(S0.PaletteGame+i)));
function shot(out){const W=256,H=192,rgb=Buffer.alloc(W*H*3);
 for(let y=0;y<H;y++){const lo=191-y;for(let col=0;col<32;col++){const a=m.rd(0xC000+col*256+lo),b=m.rd(0xE000+col*256+lo);
  for(let bit=7;bit>=0;bit--){const c=PAL[(((a>>bit)&1)<<1)|((b>>bit)&1)];const x=col*8+(7-bit),o=(y*W+x)*3;rgb[o]=c[0];rgb[o+1]=c[1];rgb[o+2]=c[2];}}}
 const raw=Buffer.alloc(H*(W*3+1));for(let y=0;y<H;y++){raw[y*(W*3+1)]=0;rgb.copy(raw,y*(W*3+1)+1,y*W*3,(y+1)*W*3);}
 const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=2;
 fs.writeFileSync(out,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch("IHDR",ih),ch("IDAT",zlib.deflateSync(raw)),ch("IEND",Buffer.alloc(0))]));}
const marks=new Set([10,100,200]);let done=new Set();
let prev="",seqLast=-1,seq=[],dumpLast=-1;
for(let i=0;i<1200&&agony<256;i++){ m.step();
  const s=snap(); const key=s.spr+"|"+s.f10+"|"+s.c0E;
  if(key!==prev||agony%32===0&&!log.includes(agony)){log.push(agony);console.log(JSON.stringify(s));prev=key;}
  for(const k of marks) if(agony>=k&&!done.has(k)){done.add(k);shot(`${pre}_${k}.png`);}
  if(process.env.SEQ&&agony>=1&&agony<=parseInt(process.env.SEQ)&&agony!==seqLast){seqLast=agony;
    const cx=m.rd(D+0x18),cy=m.rd(D+0x19);let h=0;
    for(let col=Math.max(0,cx-1);col<Math.min(32,cx+3);col++)for(let r=Math.max(0,cy*8-8);r<Math.min(192,cy*8+24);r++){const lo=191-r;h=(h*31+m.rd(0xC000+col*256+lo)*3+m.rd(0xE000+col*256+lo))>>>0;}
    seq.push(agony+":"+h.toString(16).slice(0,6));}
  if(process.env.DUMPT&&agony!==dumpLast&&process.env.DUMPT.split(",").map(Number).includes(agony)){dumpLast=agony;
    const cx=m.rd(D+0x18),cy=m.rd(D+0x19);console.log("--- клетка дайвера, тик агонии "+agony+" (col "+cx+", row "+cy+")");
    for(let r=Math.max(0,cy*8-8);r<Math.min(192,cy*8+24);r++){let s="";for(let col=Math.max(0,cx-1);col<Math.min(32,cx+3);col++){const lo=191-r,a=m.rd(0xC000+col*256+lo),b=m.rd(0xE000+col*256+lo);
      for(let bit=7;bit>=0;bit--){const v=(((a>>bit)&1)<<1)|((b>>bit)&1);s+=v?String(v):".";}} console.log(s);}}
}
console.log("агония тиков:",agony,"всего тиков:",tick);
if(seq.length){const u=new Set(seq.map(s=>s.split(":")[1]));console.log("хэш области взрыва по тикам агонии ("+u.size+" разных):",seq.join(" "));}
