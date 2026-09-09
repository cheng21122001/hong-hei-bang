/* store.js — 菜品的存放处。
   本地永远是唯一的显示来源，云只是让两台设备看到同一张榜。

   用 localStorage 而不是 IndexedDB：全部数据一百多条、几十 KB，
   不像「河」的心情记录那样逐日无限增长，IndexedDB 在这里是多余的复杂度。

   一条记录：
   { id, name, taste:"red"|"mid"|"ink", health:同上, banned, note,
     createdTs, editedTs?, deleted?, dirty?, seeded?,
     review?: { s:[味道,量价比,配料表], total, buy:true|false|null, price, verdict, date } }

   - taste / health 是它在榜上的坐标，一律存在，粗判细判都有。
   - review 是小熊测评那套细分：只有商品测评有，家常菜是 null。
     有 review 时 taste / health 由分数推出来（见 deriveAxis），不再单独填——
     所以同一张榜上，一百多道自家菜（只有粗判）和商品测评（有分数）能混排。
   - deleted 是墓碑：删除不真删行，否则删除操作传不到另一台设备。
   - dirty 表示本地改过、还没推上云端。
   - seeded 表示这条是初始榜单里的、用户一次都没动过。
     它决定首次登录时要不要把它推上去，见 markAllDirty()。
*/

const LS_KEY = "hong_hei_bang_v1";

let cache = [];

/* ---------- 读写 ---------- */

function read() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(normalize) : null;
  } catch (e) { return null; }
}

function write() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); }
  catch (e) { /* 存不下就只在这次浏览里有效，不该因此崩掉界面 */ }
}

/**
 * 0–5 分落到榜上的哪一档。分界取 3.5 和 2：
 * 满分五分里 3.5 往上才叫「好吃」，2 以下才叫「踩雷」，中间一大段都是「一般」——
 * 宁可让格子中间挤一点，也不要把「还行」算成好评。
 */
export function deriveAxis(score) {
  const n = Number(score) || 0;
  if (n >= 3.5) return "red";
  if (n >= 2) return "mid";
  return "ink";
}

/** 表单交上来的 review，洗成能存的形状；不成形就当没有 */
function normalizeReview(rv) {
  if (!rv) return null;
  const s = Array.isArray(rv.s) ? rv.s : [];
  const num = (v) => {
    const n = Number(v);
    return isFinite(n) ? Math.max(0, Math.min(5, n)) : 0;
  };
  return {
    s: [num(s[0]), num(s[1]), num(s[2])],
    total: num(rv.total),
    buy: rv.buy === true ? true : rv.buy === false ? false : null,
    // 价目是自由文本：「56块6罐，一罐9块3」这种说法固定不成总价/数量/单价三个格子
    price: String(rv.price || "").slice(0, 60),
    verdict: String(rv.verdict || "").slice(0, 28),
    date: String(rv.date || "")
  };
}

function normalize(r) {
  const review = normalizeReview(r.review);
  return {
    id: String(r.id),
    name: String(r.name || ""),
    // 有分数就以分数为准：省得两处各存一份判断、还对不上
    taste: review ? deriveAxis(review.s[0])
                  : (r.taste === "ink" || r.taste === "mid" ? r.taste : "red"),
    health: review ? deriveAxis(review.s[2])
                   : (r.health === "ink" || r.health === "mid" ? r.health : "red"),
    review,
    banned: !!r.banned,
    note: r.note || "",
    // 兼容 Artifact 版的字段名 createdAt
    createdTs: Number(r.createdTs != null ? r.createdTs : r.createdAt) || Date.now(),
    editedTs: r.editedTs ? Number(r.editedTs) : undefined,
    deleted: !!r.deleted,
    dirty: !!r.dirty,
    seeded: !!r.seeded
  };
}

/** 打开时调一次。本机第一次打开就把初始榜单装进来。 */
export async function init() {
  const stored = read();
  if (stored) { cache = stored; return; }
  cache = await loadSeed();
  write();
}

async function loadSeed() {
  try {
    const r = await fetch("seed.json", { cache: "no-store" });
    if (!r.ok) return [];
    const rows = await r.json();
    // 初始榜单一律不标 dirty：否则第二台设备开机就会把这份旧数据
    // 推上去，盖掉你在第一台上改过的东西。什么时候该推见 markAllDirty()。
    return rows.map(x => normalize(Object.assign({}, x, { dirty: false, seeded: true })));
  } catch (e) { return []; }
}

/* ---------- 查 ---------- */

/** 界面能看到的菜，新加的排前面 */
export function all() {
  return cache.filter(e => !e.deleted).sort((a, b) => b.createdTs - a.createdTs);
}

export function get(id) {
  return cache.find(e => e.id === id) || null;
}

export function count() {
  return cache.filter(e => !e.deleted).length;
}

/* ---------- 改 ---------- */

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 传 id 就是改，不传就是新增。返回这条记录。
    新增时可以指定 createdTs，迁移用得上；平时不传就是此刻。 */
export function upsert(input) {
  const now = Date.now();
  let row = input.id ? get(input.id) : null;

  if (!row) {
    row = normalize({ id: input.id || newId(), createdTs: input.createdTs || now });
    cache.push(row);
  }

  row.name = String(input.name || "").trim();
  row.review = normalizeReview(input.review);
  // 有分数时坐标由分数推出来，表单交上来的粗判就不作数了
  row.taste = row.review ? deriveAxis(row.review.s[0]) : input.taste;
  row.health = row.review ? deriveAxis(row.review.s[2]) : input.health;
  row.banned = !!input.banned;
  row.note = input.note || "";
  row.editedTs = now;
  row.deleted = false;
  row.dirty = true;
  row.seeded = false;      // 动过就不再算初始数据

  write();
  return normalize(row);
}

export function remove(id) {
  const row = get(id);
  if (!row) return;
  row.deleted = true;
  row.editedTs = Date.now();
  row.dirty = true;
  row.seeded = false;
  write();
}

/* ---------- 同步用 ---------- */

export function dirtyRows() {
  return cache.filter(e => e.dirty);
}

export function markClean(ids) {
  const set = new Set(ids);
  cache.forEach(e => { if (set.has(e.id)) e.dirty = false; });
  write();
}

/**
 * 首次登录时把本地记录并进这个账号。
 * 默认跳过一次都没动过的初始榜单——那份数据每台设备都有一模一样的，
 * 推上去只会盖掉云端更新的版本。只有确认云端是空的（这是第一台设备）
 * 才连初始榜单一起推，即 includeSeeded。
 */
export function markAllDirty(includeSeeded) {
  cache.forEach(e => { if (includeSeeded || !e.seeded) e.dirty = true; });
  write();
}

/**
 * 把云端拉下来的记录合并进本地。
 * 规则：本地有未推送的改动就保留本地（它随后会被推上去覆盖云端）；
 * 否则一律采用云端的版本。不比较两边时钟——设备之间的钟本来就对不齐。
 * @returns {number} 实际改变了本地状态的条数
 */
export function applyRemote(rows) {
  let changed = 0;
  for (const r of rows) {
    const local = get(r.id);
    if (!local) {
      cache.push(normalize(Object.assign({}, r, { dirty: false, seeded: false })));
      changed++;
      continue;
    }
    if (local.dirty) continue;      // 本地改动优先，等会儿推上去
    Object.assign(local, normalize(r), { dirty: false, seeded: false });
    changed++;
  }
  if (changed) write();
  return changed;
}

export function clearAll() {
  cache = [];
  write();
}
