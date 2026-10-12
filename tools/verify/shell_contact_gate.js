'use strict';
// Пересечения с большой синей ракушкой: управление обычными клавишами, чит G.
// Контакт подтверждает игровой тракт LE5BB. После отхода проверяются обе
// плоскости по исходным кадрам открытой/закрытой ракушки, при неизменном окне.
// Соседние существа исключаются по их прямоугольникам; нужно 100 чистых
// снимков на проход. Неполная выборка — красный, а не успешный прогон.
// Переходная запись анимации допустима; 10 несовпадений подряд — дефект.
// node tools/verify/shell_contact_gate.js 4 359 3
// SHELL_MIN_Y=90 node tools/verify/shell_contact_gate.js 2 30627 2
// SHELL_INJECT=1 ... — подмешать жёлтый пиксель: обязан дать красный.
const fs=require('fs'),path=require('path');
const root=process.env.SCUBA_ROOT||path.resolve(__dirname,'../..');
const gameDir=process.env.SHELL_DIR||path.join(root,'build','prod');
const {reachGame,KEY}=require(root+'/tools/verify/drive.js');
const level=+(process.argv[2]||4),seed=+(process.argv[3]||0x167),cycles=+(process.argv[4]||3);
const g=reachGame(gameDir+'/scuba.rom',gameDir+'/scubacod1.sym',{cpu:'i8080',level,seed}),m=g.m,S=g.S;
m.key(71,true);m.run(12);m.key(71,false);m.run(8);if(!m.rd(S.god_on))throw Error('G failed');
const ring=d=>((d%256)+384)%256-128;
const world=()=>[(m.rd(S.L5B03)*8+m.rd(S.DiverObj))&255,(m.rd(S.L5B03+1)*8+m.rd(S.DiverObj+25))&255];
const win=()=>m.rd(S.L5B03)+','+m.rd(S.L5B03+1);
const shells=[];for(let a=S.TableStatics;a<S.TableStatics+800;a+=4){let fl=m.rd(a);if(fl&128)break;if(!(fl&0x62)&&m.rd(a+2)>=+(process.env.SHELL_MIN_Y||0))shells.push({addr:a,x:m.rd(a+1),y:m.rd(a+2),flags:fl});}
const w=world();shells.sort((a,b)=>Math.abs(ring(a.x-w[0]))+Math.abs(a.y-w[1])-Math.abs(ring(b.x-w[0]))-Math.abs(b.y-w[1]));
const target=shells[+(process.env.SHELL_INDEX||0)];if(!target)throw Error('No large shells');console.log(JSON.stringify({level,seed,target,start:w}));
const pixels=()=>{let row=target.y-1-m.rd(S.L5B03+1)*8,col=(target.x-m.rd(S.L5B03)*8+256)%256;if(row<0||row+1>=24||col+1>=32)return null;return Array.from({length:32},(_,i)=>0xc000+(col+Math.floor(i/16))*256+255-(row*8+i%16));};
let contacts=0,open=0,closed=0,draws=0,ticks=0,baseline=null,phase='stage',dwell=0,settle=0,completed=0,lastContact=0,cycleStartCheck=0,firstWin='',checkSamples=0,mismatchStreak=0,maxMismatchStreak=0,transientMismatches=0,bad=[],details=[];
m.onPc(S.LE5BB,()=>{if(m.cpu.b()*256+m.cpu.c()!==target.addr)return;contacts++;if(m.rd(target.addr)&8)closed++;else open++;});
m.onPc(S.DrawGameScr,()=>draws++);m.onPc(S.LD9C0,()=>ticks++);
function steer(x,y,brake=false){let[x0,y0]=world(),dx=ring(x-x0),dy=y-y0,angle=(Math.round(Math.atan2(dx,-dy)*8/Math.PI)+16)&15,turn=(angle-m.rd(S.DiverObj+6)+16)&15;m.key(KEY.RIGHT,!brake&&turn>0&&turn<=8);m.key(KEY.LEFT,!brake&&turn>8);m.key(KEY.UP,!brake);m.key(KEY.DOWN,brake);}
function nearDiver(){let[x,y]=world();return Math.abs(ring(x-target.x))<=3&&Math.abs(y-target.y)<=4;}
function creatureNear(){const b4=m.rdw(S.RecsAddrIV),n4=m.rd(S.NumRecsIV);for(const[a,z,n]of [[S.LC4F0,21,m.rd(S.NumRecsI)],[m.rdw(S.RecsAddrII),26,m.rd(S.NumRecsII)],[m.rdw(S.RecsAddrIII),26,m.rd(S.NumRecsIII)],[b4,26,n4],[b4+n4*26,28,m.rd(S.NumRecsV)]])for(let i=0;i<n;i++){let r=a+i*z;if((m.rd(r+13)&0x81)!==1)continue;let d=m.rdw(r+19),dx=ring(target.x-m.rd(r)),dy=target.y-1-m.rd(r+1);if(dx+1>=-2&&dx<=m.rd(d+7)+1&&dy+1>=-2&&dy<=m.rd(d+8)+1)return true;}return false;}
for(let f=0;f<16000&&completed<cycles&&!bad.length;f++){
 let pp=pixels();if(!baseline&&pp&&!nearDiver()&&!creatureNear()){baseline=pp.map(a=>m.rd(a));console.log('baseline acquired at '+win());}
 if(phase==='stage'){steer((target.x-8+256)%256,target.y+6);let[x,y]=world();if(Math.abs(ring(x-target.x+8))<=1&&Math.abs(y-target.y-6)<=1){phase='seek';baseline=null;console.log('staging complete at '+win());}}else if(phase==='seek'){
  steer(target.x,target.y-1);
  if(contacts>lastContact){phase='dwell';dwell=0;firstWin=win();console.log(JSON.stringify({event:'contact',frame:f,contacts,open,closed,world:world(),window:firstWin,baseline:!!baseline}));}
 }else if(phase==='dwell'){
  steer(target.x,target.y-1,true);
  if(++dwell>=250){phase='leave';settle=0;}
 }else if(phase==='leave'){
  steer(target.x,target.y-8);
  const[x,y]=world();if(Math.abs(y-(target.y-8))<=1&&Math.abs(ring(x-target.x))<=2){phase='check';settle=0;cycleStartCheck=checkSamples;}
 }else{
  steer(target.x,target.y-8,true);settle++;
  pp=pixels();
  if(process.env.SHELL_INJECT&&settle===65&&pp)m.wr(pp[10],m.rd(pp[10])^0x80);
  if(settle>60&&pp&&baseline&&!nearDiver()&&!creatureNear()&&win()===firstWin){let src=(m.rd(target.addr)&8)?S.LB18C:S.LB16C;
   let diff=[];for(let i=0;i<32;i++){let y=i%16,c=Math.floor(i/16),e=src+(y<8?16:0)+(y&7)*2+c;
    if(m.rd(pp[i])!==0)diff.push({a:pp[i],want:0,got:m.rd(pp[i])});
    if(m.rd(pp[i]+0x2000)!==m.rd(e))diff.push({a:pp[i]+0x2000,want:m.rd(e),got:m.rd(pp[i]+0x2000)});
   }
   if(diff.length){transientMismatches++;mismatchStreak++;maxMismatchStreak=Math.max(maxMismatchStreak,mismatchStreak);if(mismatchStreak>=10)bad.push({kind:'shell-background-not-restored',frame:f,world:world(),window:win(),diff});}
   else{checkSamples++;mismatchStreak=0;}}
  if(settle>=1800&&checkSamples-cycleStartCheck<100){bad.push({kind:'insufficient-restoration-samples',frame:f,samples:checkSamples-cycleStartCheck});}
  if(settle>=300&&checkSamples-cycleStartCheck>=100){details.push({cycle:completed+1,contacts:contacts-lastContact,windowStayed:win()===firstWin,checkSamples});if(win()!==firstWin)bad.push({kind:'coverage-lost-camera-redraw',frame:f,firstWin,now:win()});if(!bad.length){completed++;lastContact=contacts;phase='seek';console.log(JSON.stringify({event:'cycle-complete',completed,contacts,checkSamples,world:world()}));}}
 }
 m.step();if(f%1000===999)console.log(JSON.stringify({frame:f+1,phase,world:world(),contacts,completed,checkSamples}));
}
const ok=!bad.length&&completed===cycles&&contacts>=cycles&&checkSamples>=cycles*100;
const report={ok,level,seed,target,cyclesRequested:cycles,completed,contacts,open,closed,ticks,screenRedraws:draws,checkSamples,transientMismatches,maxMismatchStreak,details,bad};const out=process.env.SHELL_REPORT||path.join(root,'build','shell-contact-L'+level+'-'+seed+'.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report));process.exit(ok?0:1);
