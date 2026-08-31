/* board.js — 九宫格榜单的渲染。
   两条轴各有三档，所以是 3×3 而不是 2×2：
   「一般」是独立的一档，不该被并进好的那一边——否则「好吃+一般」和
   「好吃+健康」会挤在同一格里，看不出差别。每种组合占一格，位置即评分。

   右上角是红榜（好吃+健康），左下角是黑榜（踩雷+糟糕），
   中间七格按离这两个角的远近渐变，墨色从朱红过渡到浓墨。
*/

// 列：左 → 右，口味由差到好
const TASTES = ["ink", "mid", "red"];
// 行：上 → 下，健康由好到差
const HEALTHS = ["red", "mid", "ink"];

const TASTE_LABEL = { ink: "踩雷", mid: "一般", red: "好吃" };
const HEALTH_LABEL = { red: "健康", mid: "一般", ink: "糟糕" };

// 只有两个极点有名字，其余七格靠位置说话
const NAMED = { "red-red": "红榜", "ink-ink": "黑榜" };

function cellKey(i) {
  return i.taste + "-" + i.health;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function displayName(s) {
  return escapeHtml(s).replace(/➕/g, "  +  ");
}

/**
 * @param {HTMLElement} board 容器
 * @param {Array} items 全部（未过滤）菜品
 * @param {{q:string, banOnly:boolean}} filters
 */
export function render(board, items, filters) {
  const q = filters.q.trim().toLowerCase();
  const pool = items.filter(i => {
    if (filters.banOnly && !i.banned) return false;
    if (q && i.name.toLowerCase().indexOf(q) === -1) return false;
    return true;
  });

  if (items.length === 0) {
    board.innerHTML =
      '<div class="empty"><div class="empty-mark">榜</div>' +
      '<h2>还没有记录</h2><p>点右下角的「+」，记下第一道菜吧。</p></div>';
    return;
  }
  if (pool.length === 0) {
    board.innerHTML =
      '<div class="empty"><div class="empty-mark">？</div>' +
      '<h2>没有符合条件的菜</h2><p>试试换个搜索词，或取消「只看长期禁忌」。</p></div>';
    return;
  }

  // 行高列宽按菜数分配：菜多的地方宽出来，空的地方细下去。
  // 但每条轨道有像素下限，否则窄的那一列只剩「銀…」「桃…」，等于没有。
  // 权重里加个常数，是为了让空格子也留得住坐标轴上的位置。
  const tracks = (keys, count, minPx) =>
    keys.map(k => "minmax(" + minPx + "px," + (count(k) + 6) + "fr)").join(" ");

  const colTracks = tracks(TASTES, t => pool.filter(i => i.taste === t).length, 92);
  const rowTracks = tracks(HEALTHS, h => pool.filter(i => i.health === h).length, 100);

  const cells = [];
  HEALTHS.forEach((h, row) => {
    TASTES.forEach((t, col) => {
      const key = t + "-" + h;
      const group = pool.filter(i => cellKey(i) === key);
      const name = NAMED[key];
      // 离左下角越远越红：0（黑榜）到 4（红榜）
      const heat = col + (2 - row);

      const head = name
        ? '<h2 class="cell-name">' + name + '<span class="cell-n">' + group.length + '</span></h2>'
        : (group.length ? '<span class="cell-n solo">' + group.length + '</span>' : '');

      const body = group.length
        ? '<div class="tag-wrap">' + group.map(i => {
            const cls = "tag" + (i.banned ? " is-banned" : "");
            const tip = escapeHtml(i.name) + (i.note ? "（" + escapeHtml(i.note) + "）" : "");
            return '<button type="button" class="' + cls + '" data-id="' + escapeHtml(i.id) +
              '" title="' + tip + '">' + displayName(i.name) + '</button>';
          }).join("") + '</div>'
        : "";

      cells.push('<section class="cell heat-' + heat + '" data-key="' + key + '">' + head + body + '</section>');
    });
  });

  // 坐标轴的分档也用同一套轨道，才对得上格子
  const axis = (labels, t, cls) =>
    '<div class="ax ' + cls + '" style="grid-template-' +
    (cls === "ax-y" ? "rows" : "columns") + ':' + t + '">' +
    labels.map(l => '<span>' + l + '</span>').join("") + '</div>';

  board.innerHTML =
    '<div class="chart">' +
    axis(HEALTHS.map(h => HEALTH_LABEL[h]), rowTracks, "ax-y") +
    '<div class="grid9" style="grid-template-columns:' + colTracks +
      ';grid-template-rows:' + rowTracks + '">' + cells.join("") + '</div>' +
    axis(TASTES.map(t => TASTE_LABEL[t]), colTracks, "ax-x") +
    '</div>';
}
