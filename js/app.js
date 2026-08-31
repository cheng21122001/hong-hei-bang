/* app.js — 把各块装起来。
   数据流：store 改了 → 重画 → 通知 sync 攒一会儿推上去。
*/

import * as store from "./store.js";
import * as migrate from "./migrate.js";
import * as sync from "./sync.js";
import * as board from "./board.js";
import * as sheet from "./sheet.js";
import * as account from "./account.js";

const filters = { q: "", banOnly: false };

const boardEl = document.getElementById("board");
const fab = document.getElementById("fab");
const searchInput = document.getElementById("search");
const banFilterBtn = document.getElementById("ban-filter");
const toast = document.getElementById("toast");

let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function paint() {
  board.render(boardEl, store.all(), filters);
}

/* ---------- 交互 ---------- */

banFilterBtn.addEventListener("click", () => {
  filters.banOnly = !filters.banOnly;
  banFilterBtn.classList.toggle("active", filters.banOnly);
  paint();
});

searchInput.addEventListener("input", () => {
  filters.q = searchInput.value;
  paint();
});

boardEl.addEventListener("click", e => {
  const btn = e.target.closest("button.tag");
  if (!btn) return;
  sheet.open(store.get(btn.getAttribute("data-id")));
});

fab.addEventListener("click", () => sheet.open(null));

sheet.mount({
  onSave(input) {
    const existed = !!input.id;
    store.upsert(input);
    paint();
    sync.scheduleSync();
    showToast(existed ? "已保存修改" : "已加入榜单");
  },
  onDelete(id) {
    store.remove(id);
    paint();
    sync.scheduleSync();
    showToast("已删除");
  }
});

/* ---------- 启动 ---------- */

(async function start() {
  await store.init();

  // 拆合并菜的一次性迁移。拆出来的都标了 dirty，
  // 随后 sync.init() 的第一次同步会把它们推上云端。
  const m = migrate.splitCombos();
  paint();
  if (m) showToast("已把 " + m.combos + " 道合并菜拆成 " + m.added + " 个单品");

  account.mount();
  sync.init(paint);

  if ("serviceWorker" in navigator) {
    // 新版本接管时刷新一次，否则当前这页还是旧文件——
    // 「改了怎么看不到」十有八九是这里。首次安装不刷。
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) location.reload();
      hadController = true;
    });
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
