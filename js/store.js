/* store.js — 菜品的存放处。
   本地永远是唯一的显示来源，云只是让两台设备看到同一张榜。

   用 localStorage 而不是 IndexedDB：全部数据一百多条、几十 KB，
   不像「河」的心情记录那样逐日无限增长，IndexedDB 在这里是多余的复杂度。

   一条记录：
   { id, name, taste:"red"|"mid"|"ink", health:同上, banned, note,
     createdTs, editedTs?, deleted?, dirty?, seeded? }

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

function normalize(r) {
  return {
    id: String(r.id),
    name: String(r.name || ""),
    taste: r.taste === "ink" || r.taste === "mid" ? r.taste : "red",
    health: r.health === "ink" || r.health === "mid" ? r.health : "red",
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
  row.taste = input.taste;
  row.health = input.health;
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
