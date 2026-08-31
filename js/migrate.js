/* migrate.js — 一次性的数据迁移。
   目前只有一条：把菜名里带 ➕ 的合并菜拆成单品。

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
