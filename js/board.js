/* board.js — 四象限榜单的渲染。
   两条轴：口味（左右）、健康（上下）。
   任一轴取「一般」时，仍然落进偏好的那一格，只是画成浅色虚边的「边缘」标签。
*/

const QUADRANTS = [
  { key: "tl", title: "健康但踩雷", kind: "plain-faint", caption: "健康 · 口味差" },
  { key: "tr", title: "红榜",       kind: "hero-red",    caption: "好吃 · 健康" },
  { key: "bl", title: "黑榜",       kind: "hero-ink",    caption: "踩雷 · 糟糕" },
  { key: "br", title: "好吃但糟糕", kind: "plain",       caption: "好吃 · 不健康/糟糕" }
];

const TITLE_CLASS = {
  "hero-red": "qtitle hero red",
  "hero-ink": "qtitle hero ink",
  "plain": "qtitle plain",
  "plain-faint": "qtitle plain faint"
};

export function quadrantOf(i) {
  const col = i.taste === "ink" ? "ink" : "red";
  const row = i.health === "ink" ? "ink" : "red";
  return col === "red" && row === "red" ? "tr"
    : col === "ink" && row === "ink" ? "bl"
    : col === "red" && row === "ink" ? "br"
    : "tl";
}

function isBorderline(i) { return i.taste === "mid" || i.health === "mid"; }

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

  board.innerHTML =
    '<div class="chart-frame">' +
    '<div class="axis axis-top">健康 ▲</div>' +
    '<div class="axis axis-bottom">▼ 不健康 / 糟糕</div>' +
    '<div class="axis axis-left"><span>口味差</span></div>' +
    '<div class="axis axis-right"><span>口味好</span></div>' +
    '<div class="quadrant-grid">' +
    QUADRANTS.map(qd => {
      const group = pool.filter(i => quadrantOf(i) === qd.key);
      const body = group.length === 0
        ? '<p class="qbox-empty">暂无记录</p>'
        : '<div class="tag-wrap">' + group.map(i => {
            const cls = "tag" + (isBorderline(i) ? " borderline" : "") + (i.banned ? " is-banned" : "");
            const tip = escapeHtml(i.name) + (i.note ? "（" + escapeHtml(i.note) + "）" : "");
            return '<button type="button" class="' + cls + '" data-id="' + escapeHtml(i.id) + '" title="' + tip + '">' +
              '<span class="tag-name">' + displayName(i.name) + '</span></button>';
          }).join("") + '</div>';
      return (
        '<section class="qbox q-' + qd.key + '">' +
        '<h2 class="' + TITLE_CLASS[qd.kind] + '">' + qd.title + '<span class="qcount">' + group.length + '</span></h2>' +
        '<p class="qcaption">' + qd.caption + '</p>' +
        body +
        '</section>'
      );
    }).join("") +
    '</div>' +
    '</div>';
}
