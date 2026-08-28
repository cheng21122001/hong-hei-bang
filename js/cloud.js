/* cloud.js — 账号与云端读写。
   只负责「怎么跟 Supabase 说话」，什么时候说、怎么合并在 sync.js。
   断网时这里全部安静失败，本地照记，联网后自动补上。
*/

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const TABLE = "dishes";
const LS_CURSOR = "hhb_sync_cursor";   // 上次拉取到的服务器时间
const LS_USER   = "hhb_sync_user";     // 上次同步的账号，用来识别换号

let client = null;

function sb() {
  if (client) return client;
  const lib = window.supabase;
  if (!lib || !lib.createClient) throw new Error("supabase 客户端没加载起来");
  client = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  return client;
}

export function available() {
  return !!(window.supabase && window.supabase.createClient);
}

/* ================= 账号 ================= */

export async function currentUser() {
  try {
    const { data } = await sb().auth.getUser();
    return data && data.user ? data.user : null;
  } catch (e) { return null; }
}

export async function signUp(email, password) {
  const { data, error } = await sb().auth.signUp({ email, password });
  if (error) throw new Error(readableAuthError(error));
  // 关掉了确认邮件就直接有 session；没关掉则 session 为空，要先去邮箱点链接
  return { user: data.user, needsEmail: !data.session };
}

export async function signIn(email, password) {
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw new Error(readableAuthError(error));
  return data.user;
}

export async function signOut() {
  try { await sb().auth.signOut(); } catch (e) {}
}

export function onAuthChange(fn) {
  try { sb().auth.onAuthStateChange((_evt, session) => fn(session ? session.user : null)); }
  catch (e) {}
}

function readableAuthError(error) {
  const m = (error && error.message ? error.message : "").toLowerCase();
  if (m.includes("invalid login credentials")) return "邮箱或密码不对";
  if (m.includes("user already registered")) return "这个邮箱已经注册过了，直接登录吧";
  if (m.includes("password should be at least")) return "密码太短了，至少 6 位";
  if (m.includes("unable to validate email")) return "邮箱格式不对";
  if (m.includes("email not confirmed")) return "邮箱还没确认，去收件箱点一下确认链接";
  if (m.includes("failed to fetch") || m.includes("network")) return "连不上服务器，检查一下网络";
  return error && error.message ? error.message : "登录失败";
}

/* ================= 同步游标 ================= */

export function getCursor() {
  try { return localStorage.getItem(LS_CURSOR) || null; } catch (e) { return null; }
}
function setCursor(v) {
  try { if (v) localStorage.setItem(LS_CURSOR, v); } catch (e) {}
}
export function resetCursor() {
  try { localStorage.removeItem(LS_CURSOR); } catch (e) {}
}
export function getSyncedUser() {
  try { return localStorage.getItem(LS_USER) || null; } catch (e) { return null; }
}
export function setSyncedUser(id) {
  try { id ? localStorage.setItem(LS_USER, id) : localStorage.removeItem(LS_USER); } catch (e) {}
}

/* ================= 字段映射 ================= */

function toRemote(e, userId) {
  return {
    user_id: userId,
    id: e.id,
    name: e.name,
    taste: e.taste,
    health: e.health,
    banned: !!e.banned,
    note: e.note || "",
    created_ts: e.createdTs,
    edited_ts: e.editedTs || null,
    deleted: !!e.deleted
  };
}

export function fromRemote(r) {
  return {
    id: r.id,
    name: r.name,
    taste: r.taste,
    health: r.health,
    banned: !!r.banned,
    note: r.note || "",
    createdTs: Number(r.created_ts),
    editedTs: r.edited_ts ? Number(r.edited_ts) : undefined,
    deleted: !!r.deleted
  };
}

/* ================= 拉 / 推 ================= */

/** 拉取游标之后有变动的记录。首次（无游标）拉全部。 */
export async function pull() {
  let q = sb().from(TABLE).select("*").order("updated_at", { ascending: true }).limit(5000);
  const cursor = getCursor();
  if (cursor) q = q.gt("updated_at", cursor);

  const { data, error } = await q;
  if (error) throw new Error("拉取失败：" + error.message);

  if (data && data.length) setCursor(data[data.length - 1].updated_at);
  return (data || []).map(fromRemote);
}

/** 推送本地待同步的记录。返回推上去的条数。 */
export async function push(rows, userId) {
  if (!rows.length) return 0;

  const CHUNK = 200;
  let newest = getCursor();

  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map(e => toRemote(e, userId));
    const { data, error } = await sb()
      .from(TABLE)
      .upsert(batch, { onConflict: "user_id,id" })
      .select("updated_at");
    if (error) throw new Error("上传失败：" + error.message);

    // 把游标推到自己刚写入的时间，免得下一轮把自己写的又拉回来
    (data || []).forEach(r => { if (!newest || r.updated_at > newest) newest = r.updated_at; });
  }

  if (newest) setCursor(newest);
  return rows.length;
}
