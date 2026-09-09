/* shots.js — 价目截图（订单截图）的存取。

   为什么不像别的字段那样存在本地：一张订单截图 100–200KB，
   localStorage 全部才 5MB，二十来期就爆；塞进同步的数据行里也会让
   每次 upsert 都拖着几百 KB 走。所以图走 Supabase Storage，
   记录里只留一个路径（`review.shot`）。

   代价说清楚：**存截图必须登录**——路径就是 `<user_id>/<记录id>.jpg`，
   没登录就没有「你自己的目录」这回事。桶是私有的，读图靠临时签名 URL，
   知道路径也打不开。桶和策略见 supabase/storage.sql。

   上传前一律压一道：长边压到 1200、JPEG 0.82。订单截图是文字截图，
   这个尺寸看得清价格，体积能从 166KB 掉到三四十 KB。
*/

import * as cloud from "./cloud.js";

const BUCKET = "shots";
const MAX_EDGE = 1200;
const QUALITY = 0.82;

/** 签名 URL 缓存：同一张图在一次会话里不用反复去换 */
const urlCache = new Map();
const URL_TTL = 3600;                    // 秒，签名有效期
const CACHE_KEEP = (URL_TTL - 300) * 1000;   // 提前 5 分钟作废，免得正好过期

/**
 * 把用户选的图压成小 JPEG。
 * @param {File|Blob} file
 * @returns {Promise<Blob>}
 */
export function shrink(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d");
      // 订单截图是白底文字，缩小时先铺白，免得透明 PNG 压成黑底
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      cv.toBlob(b => b ? resolve(b) : reject(new Error("压不动这张图")), "image/jpeg", QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("这个文件不是图片")); };
    img.src = url;
  });
}

/**
 * 上传一张截图，返回存进记录里的路径。
 * 同一条记录反复换图会覆盖同一个路径（upsert），不留垃圾。
 * @param {string} recordId
 * @param {File|Blob} file
 * @returns {Promise<string>} 形如 `<uid>/<recordId>.jpg`
 */
export async function upload(recordId, file) {
  const user = await cloud.currentUser();
  if (!user) throw new Error("存截图要先登录——图存在云上，得知道是谁的");

  const blob = await shrink(file);
  const path = user.id + "/" + recordId + ".jpg";

  const { error } = await cloud.storage(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error("截图没传上去：" + error.message);

  urlCache.delete(path);         // 换了图，旧的签名 URL 指向的是旧内容
  return path;
}

/**
 * 换一个能直接塞进 <img src> 的临时地址。
 * 桶是私有的，所以必须签名；签出来的地址一小时后失效。
 * @param {string} path
 * @returns {Promise<string|null>} 换不到就 null，界面自己降级
 */
export async function url(path) {
  if (!path) return null;

  const hit = urlCache.get(path);
  if (hit && Date.now() - hit.at < CACHE_KEEP) return hit.url;

  try {
    const { data, error } = await cloud.storage(BUCKET).createSignedUrl(path, URL_TTL);
    if (error || !data) return null;
    urlCache.set(path, { url: data.signedUrl, at: Date.now() });
    return data.signedUrl;
  } catch (e) { return null; }
}

/** 删图。删不掉不算错——记录里的路径已经清了，剩一个孤儿文件不影响使用。 */
export async function remove(path) {
  if (!path) return;
  urlCache.delete(path);
  try { await cloud.storage(BUCKET).remove([path]); } catch (e) {}
}
