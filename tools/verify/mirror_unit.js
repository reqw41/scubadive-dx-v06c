"use strict";
// ЮНИТ-ПРОВЕРКА ОТРАЖЁННОЙ СБОРКИ на ЖИВЫХ вызовах: каждая строка, которую
// собрал MirrorRow, обязана равняться отражению исходной строки с тем же сдвигом.
// Отражение = байты справа налево, в каждом биты наоборот (MIR_TAB).
// Сдвиг берём из самих операндов, которые ставит общая настройка блита:
// (MR_rot+1) = SH_rot0-k, (MR_lo+1) = 0FFh>>k.
//   node tools/verify/mirror_unit.js <rom> <sym> [level=1] [frames=4000]
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "1", 10), NF = parseInt(process.argv[5] || "4000", 10);
const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
const m = g.m, S = g.S;
const w = a => m.rd(a) | (m.rd(a + 1) << 8);
const rev = b => { let r = 0; for (let i = 0; i < 8; i++) if (b & (1 << i)) r |= 0x80 >> i; return r; };
let checked = 0, bad = 0, shown = 0, entries = 0;
// Ловим ВХОД в MirrorRow: HL — начало строки источника, DE — приёмник, (mir_w) — ширина.
m.onPc(S.MirrorRow, () => {
  entries++;
  const src = (m.cpu.h() << 8) | m.cpu.l(), dst = (m.cpu.d() << 8) | m.cpu.e();
  const wd = m.rd(S.mir_w);
  const k = (S.SH_rot0 - w(S.MR_rot + 1)) & 0xff, lo = m.rd(S.MR_lo + 1);
  if (!wd || wd > 8) return;
  // источник строки: wd байт начиная с src; ожидаемый выход: wd+1 байт со сдвигом k
  const row = []; for (let i = 0; i < wd; i++) row.push(m.rd(src + i));
  const mir = row.map(rev).reverse();
  // сдвиг вправо на k с переносом между байтами, как в блите
  const out = new Array(wd + 1).fill(0); let carry = 0;
  for (let i = 0; i < wd; i++) { const v = ((mir[i] >> k) | carry) & 0xff; out[i] = v; carry = (mir[i] << (8 - k)) & 0xff; }
  out[wd] = carry;
  // ждём возврата и сверяем
  const sp0 = m.cpu.sp & 0xffff;
  const guard = () => {
    for (let i = 0; i < 20000; i++) { m.step(); if ((m.cpu.sp & 0xffff) > sp0) break; }
    const got = []; for (let i = 0; i <= wd; i++) got.push(m.rd(dst + i));
    checked++;
    const same = got.every((v, i) => v === out[i]);
    if (!same) { bad++;
      if (shown++ < 3) console.log(`  расхождение: ширина ${wd}, сдвиг ${k}, маска ${lo.toString(16)}\n` +
        `    исходник  ${row.map(x => x.toString(16).padStart(2, "0")).join(" ")}\n` +
        `    ожидание  ${out.map(x => x.toString(16).padStart(2, "0")).join(" ")}\n` +
        `    получено  ${got.map(x => x.toString(16).padStart(2, "0")).join(" ")}`); }
  };
  guard();
});
let row0 = m.rd(S.L5B03 + 1), chk = 0, rot = -1, explo = 0;
if (S.DiverExplosion != null) m.onPc(S.DiverExplosion, () => explo++);
for (let f = 0; f < NF && !explo; f++) {
  const row = m.rd(S.L5B03 + 1);
  m.key(KEY.UP, true); m.key(KEY.RIGHT, rot >= 0 && f < rot); m.step();
  if (f - chk >= 60) { if (row <= row0) rot = f + 25; row0 = row; chk = f; }
}
console.log(`входов в MirrorRow ${entries}, строк сверено ${checked}, расхождений ${bad}`);
process.exit(checked === 0 ? 2 : (bad ? 1 : 0));
