/* card.js — 小熊红黑榜的评分卡：画成 1080×1920 的竖屏 PNG，直接塞进短视频。

   整块画法从 ~/Downloads/小熊/评分卡app/site/index.html 搬过来，一笔没改配色和排版——
   那套纸黄底 + 星级金的样子是定过稿的，成片里已经用了。
   预览和导出共用同一个 canvas，所以存出来就是精确的 1080×1920，没有浏览器边距。

   注意这里的配色写死不跟榜单的深色模式走：卡片是要发出去的成品，
   它长什么样跟她这会儿用不用夜间模式没关系。
*/

const W = 1080, H = 1920;

const PAPER = '#FFFBEB', INK = '#1C1917', MUTED = '#78716C', GOLD = '#F59E0B',
      TRACK = '#FDF3DC', CELLB = '#D9C48E', LINE = '#E2D3A8', DIV = '#EDE1C2',
      GREEN = '#16A34A', RED = '#DC2626', SLOT = '#C4B48B';
const FONT = '"PingFang SC","Helvetica Neue",sans-serif';

const L = 112, R = 968, CW = R - L;

/* 纸面颗粒。只生成一次，之后当 pattern 反复铺。 */
let grain = null;
function grainPattern() {
  if (grain) return grain;
  grain = document.createElement("canvas");
  grain.width = grain.height = 220;
  const g = grain.getContext("2d");
  const img = g.createImageData(220, 220), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = 200 + Math.floor(Math.random() * 55);
    d[i] = d[i + 1] = d[i + 2] = n;
    d[i + 3] = 26;
  }
  g.putImageData(img, 0, 0);
  return grain;
}

function f(w, s) { return w + " " + s + "px " + FONT; }

/** 逐字加字距地画，返回总宽 */
function tracked(ctx, text, x, y, sp, align) {
  const chars = String(text).split("");
  let total = 0;
  for (let i = 0; i < chars.length; i++) total += ctx.measureText(chars[i]).width + sp;
  total -= sp;
  let cx = align === "right" ? x - total : x;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cx, y);
    cx += ctx.measureText(chars[i]).width + sp;
  }
  return total;
}

function trackedWidth(ctx, text, sp) {
  let t = 0;
  for (let i = 0; i < text.length; i++) t += ctx.measureText(text[i]).width + sp;
  return t - sp;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 最多两行，超出就截断——一句话结论本来就不该长 */
function wrap(ctx, text, maxW) {
  const lines = [];
  let cur = "";
  for (let i = 0; i < text.length; i++) {
    if (ctx.measureText(cur + text[i]).width > maxW && cur) { lines.push(cur); cur = text[i]; }
    else cur += text[i];
    if (lines.length === 2) break;
  }
  if (cur && lines.length < 2) lines.push(cur);
  return lines;
}

/**
 * 把一条记录画到 canvas 上。
 * @param {HTMLCanvasElement} cv 尺寸必须是 1080×1920
 * @param {{title:string, scores:number[], total:string, buy:boolean|null,
 *          verdict:string, date:string}} d
 */
export function draw(cv, d) {
  const ctx = cv.getContext("2d");

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.fillStyle = ctx.createPattern(grainPattern(), "repeat");
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  roundRect(ctx, 57.5, 57.5, W - 115, H - 115, 26); ctx.stroke();
  ctx.strokeStyle = LINE; ctx.lineWidth = 1;
  roundRect(ctx, 68.5, 68.5, W - 137, H - 137, 17); ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.fillStyle = MUTED; ctx.font = f(400, 32);
  tracked(ctx, "小熊红黑榜", L, 130, 32 * 0.42);

  ctx.fillStyle = d.title ? INK : SLOT; ctx.font = f(600, 64);
  ctx.fillText(d.title || "商品名称", L, 196);

  ctx.fillStyle = INK; ctx.fillRect(L, 300, CW, 3);

  const labels = ["味　道", "量价比", "配料表"];
  const cellW = (456 - 4 * 21) / 5;
  for (let r = 0; r < 3; r++) {
    const top = 330 + r * 216, mid = top + 108;
    ctx.fillStyle = INK; ctx.font = f(600, 50);
    ctx.textBaseline = "middle";
    tracked(ctx, labels[r], L, mid, 50 * 0.06);

    const s = d.scores[r];
    for (let c = 0; c < 5; c++) {
      const x = L + 250 + c * (cellW + 21), y = mid - 37;
      ctx.fillStyle = TRACK; roundRect(ctx, x, y, cellW, 74, 9); ctx.fill();
      const fillPart = Math.max(0, Math.min(1, s - c));
      if (fillPart > 0) {
        ctx.save(); roundRect(ctx, x, y, cellW, 74, 9); ctx.clip();
        ctx.fillStyle = GOLD; ctx.fillRect(x, y, cellW * fillPart, 74);
        ctx.restore();
      }
      ctx.strokeStyle = CELLB; ctx.lineWidth = 3;
      roundRect(ctx, x + 1.5, y + 1.5, cellW - 3, 71, 8); ctx.stroke();
    }

    ctx.fillStyle = INK; ctx.font = f(600, 62); ctx.textAlign = "right";
    ctx.fillText(s.toFixed(1), R, mid);
    ctx.textAlign = "left";

    ctx.fillStyle = DIV; ctx.fillRect(L, top + 215, CW, 1);
  }
  ctx.textBaseline = "top";

  /* 综合大字 */
  const base = 1252;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK; ctx.font = f(600, 46);
  const labW = trackedWidth(ctx, "综　合", 46 * 0.1);
  tracked(ctx, "综　合", L, base, 46 * 0.1);
  ctx.font = f(600, 196);
  const bx = L + labW + 34, bw = ctx.measureText(d.total).width;
  ctx.fillText(d.total, bx, base);
  ctx.fillStyle = MUTED; ctx.font = f(400, 52);
  ctx.fillText("/ 5", bx + bw + 16, base);

  /* 回购印章。没选就是一圈虚线，绝不预设一个立场 */
  ctx.save();
  ctx.translate(R - 129, 1183); ctx.rotate(-13 * Math.PI / 180);
  ctx.textBaseline = "middle";
  if (d.buy === null || d.buy === undefined) {
    ctx.strokeStyle = SLOT; ctx.lineWidth = 5; ctx.setLineDash([16, 14]);
    ctx.beginPath(); ctx.arc(0, 0, 126.5, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = SLOT; ctx.font = f(400, 38);
    tracked(ctx, "回购", -trackedWidth(ctx, "回购", 38 * 0.2) / 2, -24, 38 * 0.2);
    tracked(ctx, "与否", -trackedWidth(ctx, "与否", 38 * 0.2) / 2, 26, 38 * 0.2);
  } else {
    const col = d.buy ? GREEN : RED, txt = d.buy ? "回购" : "不回购";
    ctx.strokeStyle = col; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(0, 0, 124.5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = col; ctx.font = f(600, 66);
    tracked(ctx, txt, -trackedWidth(ctx, txt, 66 * 0.06) / 2, 2, 66 * 0.06);
  }
  ctx.restore();
  ctx.textAlign = "left"; ctx.textBaseline = "top";

  ctx.fillStyle = LINE; ctx.fillRect(L, 1396, CW, 1);
  ctx.fillStyle = MUTED; ctx.font = f(400, 32);
  tracked(ctx, "一句话", L, 1448, 32 * 0.2);

  ctx.font = f(600, 54);
  ctx.fillStyle = d.verdict ? INK : SLOT;
  const lines = wrap(ctx, d.verdict || "在这里写一句结论", CW);
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], L, 1502 + i * 81);

  ctx.fillStyle = MUTED; ctx.font = f(400, 32);
  tracked(ctx, "满分五分", L, 1762, 32 * 0.14);
  ctx.textAlign = "right";
  tracked(ctx, d.date || "", R, 1762, 32 * 0.14, "right");
  ctx.textAlign = "left";
}

/** 把一条记录变成 draw() 要的形状 */
export function fromItem(item) {
  const rv = item && item.review;
  return {
    title: (item && item.name) || "",
    scores: rv ? rv.s.slice(0, 3) : [0, 0, 0],
    total: (rv ? Number(rv.total) : 0).toFixed(1),
    buy: rv ? rv.buy : null,
    verdict: rv ? rv.verdict : "",
    date: rv ? rv.date : ""
  };
}

/** 今天，写成卡片上那种 2026 . 09 . 09 */
export function today() {
  const n = new Date(), p = x => (x < 10 ? "0" : "") + x;
  return n.getFullYear() + " . " + p(n.getMonth() + 1) + " . " + p(n.getDate());
}

/**
 * 存成 PNG。走 <a download>，浏览器直接落到「下载」文件夹——
 * 这正是搬进网页版换来的好处，桌面 .app 那条 TCC 的坑绕开了。
 * @returns {Promise<string>} 文件名
 */
export function exportPng(d) {
  return new Promise((resolve, reject) => {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    draw(cv, d);
    cv.toBlob(blob => {
      if (!blob) { reject(new Error("导不出图")); return; }
      const name = "评分卡-" + (d.title || "未命名") + "-" +
                   String(d.date || "").replace(/[^0-9]/g, "") + ".png";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      resolve(name);
    }, "image/png");
  });
}
