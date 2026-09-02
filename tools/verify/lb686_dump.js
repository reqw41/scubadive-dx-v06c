"use strict";
// РЕКОРДЕР ДЛЯ lb686_spec.py: на каждом живом вызове LB686 снимает вход (запись
// IX, описатель IY, SCRATTR) и выход — после возврата (SP выше входного).
//   node tools/verify/lb686_dump.js <rom> <sym> <out.json> [уровень=4] [тиков=600]
const fs=require("fs");
const {reachGame,KEY}=require("./drive.js");
const [rom,sym,out]=process.argv.slice(2,5); const LVL=+(process.argv[5]||4), NT=+(process.argv[6]||600);
const g=reachGame(rom,sym,{cpu:"i8080",level:LVL,seed:0x167}); const m=g.m,S=g.S;
for(const n of ["LB686","SCRATTR","z80_ix","z80_iy","LD9C0"]) if(S[n]==null){console.log("нет метки "+n);process.exit(2);}
const rd=(a,n)=>{const b=Buffer.alloc(n);for(let i=0;i<n;i++)b[i]=m.rd((a+i)&0xffff);return b;};
const calls=[]; let pend=null, ticks=0;
const cb=m.v06c.check_breakpoint;
m.v06c.check_breakpoint=()=>{ const r=cb();
  if(pend && (m.cpu.sp&0xffff)>pend.sp){
    calls.push({flags:pend.flags, ix_in:pend.ix, iy_in:pend.iy, attr_in:pend.attr,
      ix_out:rd(pend.ixa,0x1A).toString("hex"), iy_out:rd(pend.iya,0x14).toString("hex"), attr_out:rd(S.SCRATTR,0x300).toString("hex")});
    pend=null; }
  return r; };
m.onPc(S.LB686,()=>{ if(pend) return; const ixa=m.rdw(S.z80_ix), iya=m.rdw(S.z80_iy);
  pend={sp:m.cpu.sp&0xffff, ixa, iya, flags:m.rd(ixa+0x0D), ix:rd(ixa,0x1A).toString("hex"), iy:rd(iya,0x14).toString("hex"), attr:rd(S.SCRATTR,0x300).toString("hex")}; });
m.onPc(S.LD9C0,()=>{ticks++;});
const D=[[KEY.UP],[KEY.RIGHT],[KEY.DOWN],[KEY.LEFT]]; let held=[],di=-1,guard=0;
while(ticks<NT&&guard<2000000){ const ph=Math.floor(ticks/60)%4;
  if(ph!==di){for(const k of held)m.key(k,false);di=ph;held=D[di];for(const k of held)m.key(k,true);}
  if((guard&255)===0){m.wr(S.LIVES,3);m.wr(S.OXYGEN,0xff);m.wr(S.OXYGEN+1,0xff);}
  m.step();guard++; }
fs.writeFileSync(out,JSON.stringify(calls));
console.log(`записано вызовов LB686: ${calls.length} за ${ticks} тиков -> ${out}`);
