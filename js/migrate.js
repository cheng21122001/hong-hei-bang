/* migrate.js — 一次性的数据迁移。
   两条：把菜名里带 ➕ 的合并菜拆成单品（旧的，已经跑过了）；
   把家常菜整批清掉，只留零食测评。

   为什么要在 app 里跑而不是只改 seed.json：seed.json 只影响没同步过的新设备，
   已经推上云端的那份还是合并菜，两边会对不上。这里拆完标 dirty，
   走正常的同步通道推上去，云端和所有设备就都统一了。

   拆出来的单品 id 从母条目派生（`<母id>-s<序号>`），是确定的，
   所以两台设备各自跑一遍也会算出同一批 id，upsert 之后自然收敛。
*/

import * as store from "./store.js";

const LS_DONE = "hhb_migrated_split_combos";

function done() {
  try { return localStorage.getItem(LS_DONE) === "1"; } catch (e) { return false; }
}
function markDone() {
  try { localStorage.setItem(LS_DONE, "1"); } catch (e) {}
}

/**
 * @returns {{combos:number, added:number, skipped:string[]}|null} 没跑就返回 null
 */
export function splitCombos() {
  if (done()) return null;

  // 按创建时间倒序处理，保证两台设备的处理顺序一致，
  // 「重名就跳过」这条规则才会算出同样的结果。
  const items = store.all().sort((a, b) => b.createdTs - a.createdTs);
  const combos = items.filter(i => i.name.indexOf("➕") !== -1);

  if (combos.length === 0) { markDone(); return null; }

  const taken = new Set(items.filter(i => i.name.indexOf("➕") === -1).map(i => i.name));
  const skipped = [];
  let added = 0;

  for (const combo of combos) {
    const parts = combo.name.split("➕").map(s => s.trim()).filter(Boolean);
    parts.forEach((name, i) => {
      if (taken.has(name)) { skipped.push(name); return; }
      taken.add(name);
      store.upsert({
        id: combo.id + "-s" + i,
        name: name,
        taste: combo.taste,
        health: combo.health,
        banned: combo.banned,
        note: combo.note,
        // 同一组保持原顺序：每片往前挪 1 毫秒
        createdTs: combo.createdTs - i
      });
      added++;
    });
    store.remove(combo.id);
  }

  markDone();
  return { combos: combos.length, added: added, skipped: skipped };
}

/* ================= 只留零食测评 ================= */

const LS_DROPPED = "hhb_migrated_drop_dishes";

/**
 * 2026-09-09：这个 app 收窄成只做零食测评，一百多条家常菜整批清掉。
 *
 * 和清空 seed.json 不是一回事：seed 只管没同步过的新设备，
 * 已经推上云端的那份还在。这里走墓碑删除、标 dirty，
 * 由正常的同步通道推上去，手机和云端才会跟着一起清干净。
 *
 * 判据是「有没有分数」而不是别的：没有 review 的就是老的家常菜。
 * 原始 188 条留在仓库的 seed-家常菜-备份.json 里，要找回从那儿来。
 *
 * @returns {number|null} 清掉的条数；已经跑过就返回 null
 */
export function dropDishes() {
  try { if (localStorage.getItem(LS_DROPPED) === "1") return null; } catch (e) { return null; }

  const olds = store.all().filter(i => !i.review);
  olds.forEach(i => store.remove(i.id));

  try { localStorage.setItem(LS_DROPPED, "1"); } catch (e) {}
  return olds.length || null;
}

/* ================= 补录已经拍过的那几期 ================= */

const LS_SEEDED_REVIEWS = "hhb_migrated_seed_reviews";

/**
 * 2026-09-09：把已经发过片、但榜还没建起来时测的几期补进来。
 *
 * 分数全部从 `~/Downloads/小熊/已完成/` 的成片里逐帧读出来的，一个都没有代打——
 * 只补录了片尾评分卡填齐的那几期，缺分数的那几期等她自己给。
 * 「量价比」这一维 9 月 2 日那期在片子里叫「性价比」，是同一格，后来才改的名。
 *
 * id 写死，两台设备各自跑一遍也是同一批 id，upsert 之后自然收敛。
 *
 * @returns {number|null} 补录的条数；已经跑过就返回 null
 */
export function seedReviews() {
  try { if (localStorage.getItem(LS_SEEDED_REVIEWS) === "1") return null; } catch (e) { return null; }

  const rows = [
    {
      id: "ep-20260902-sardine",
      name: "佳必可沙丁鱼罐头",
      createdTs: Date.parse("2026-09-02T12:00:00+08:00"),
      review: { s: [2.5, 2.5, 3.0], total: 2.5, buy: false,
                verdict: "这价格不值", date: "2026 . 09 . 02" }
    },
    {
      id: "ep-20260908-yuntui",
      name: "潘祥记云腿月饼",
      createdTs: Date.parse("2026-09-08T12:00:00+08:00"),
      review: { s: [2.5, 3.0, 1.0], total: 2.2, buy: false,
                verdict: "馅料问题", date: "2026 . 09 . 08" }
    }
  ];

  let added = 0;
  for (const r of rows) {
    if (store.get(r.id)) continue;          // 已经有了就别覆盖她后来的改动
    store.upsert({
      id: r.id,
      name: r.name,
      createdTs: r.createdTs,
      banned: false,
      note: r.review.verdict,
      review: r.review
    });
    added++;
  }

  try { localStorage.setItem(LS_SEEDED_REVIEWS, "1"); } catch (e) {}
  return added || null;
}
