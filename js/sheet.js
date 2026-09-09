/* sheet.js — 添加 / 编辑一条零食测评。
   三条 0–5 分（味道 / 量价比 / 配料表）+ 综合 + 回购 + 一句话，
   它在榜上落哪一格由分数推出来（deriveAxis），不再单独填一遍粗判。

   只管收集表单里的值，存哪儿、怎么同步都不归它管：
   保存和删除通过 open() 传进来的回调交出去。
*/

import { deriveAxis } from "./store.js";
import * as card from "./card.js";
import * as shots from "./shots.js";

const el = {};
let deleteArm = false;
let onSave = null;
let onDelete = null;
let buy = null;        // true | false | null——不预选，等她自己表态

/* 价目截图。pendingFile 是这次选了还没保存的那张：
   保存时才真上传，取消就当没发生过，不留云上垃圾。 */
let shotPath = "";
let pendingFile = null;
let openedShot = "";    // 打开这条时它原来的图，用来判断她是不是摘掉了

const AXIS_LABEL = {
  taste: { red: "好吃", mid: "一般", ink: "踩雷" },
  health: { red: "健康", mid: "一般", ink: "不健康" }
};

export function mount(handlers) {
  onSave = handlers.onSave;
  onDelete = handlers.onDelete;

  el.dialog = document.getElementById("sheet");
  el.form = document.getElementById("form");
  el.title = document.getElementById("sheet-title");
  el.editId = document.getElementById("edit-id");
  el.name = document.getElementById("f-name");
  el.nameError = document.getElementById("name-error");
  el.banned = document.getElementById("toggle-banned");
  el.saveBtn = document.getElementById("save-btn");
  el.cancelBtn = document.getElementById("cancel-btn");
  el.deleteRow = document.getElementById("delete-row");
  el.deleteBtn = document.getElementById("delete-btn");

  el.scores = [0, 1, 2].map(i => document.getElementById("s" + i));
  el.vals = [0, 1, 2].map(i => document.getElementById("v" + i));
  el.total = document.getElementById("st");
  el.totalVal = document.getElementById("vt");
  el.avgBtn = document.getElementById("btn-avg");
  el.buy = document.getElementById("toggle-buy");
  el.price = document.getElementById("f-price");
  el.shotInput = document.getElementById("f-shot");
  el.shotImg = document.getElementById("shot-img");
  el.shotEmpty = document.getElementById("shot-empty");
  el.shotActions = document.getElementById("shot-actions");
  el.shotHint = document.getElementById("shot-hint");
  el.shotBtn = document.getElementById("btn-shot");
  el.shotOpen = document.getElementById("btn-shot-open");
  el.shotDel = document.getElementById("btn-shot-del");
  el.verdict = document.getElementById("f-verdict");
  el.date = document.getElementById("f-date");
  el.deriveHint = document.getElementById("derive-hint");
  el.cardCv = document.getElementById("card-cv");
  el.pngBtn = document.getElementById("btn-png");
  el.pngDone = document.getElementById("png-done");

  el.buy.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const v = btn.getAttribute("data-val") === "1";
    setBuy(buy === v ? null : v);   // 再点一下取消，回到「还没表态」
  });

  el.shotBtn.addEventListener("click", () => el.shotInput.click());
  el.shotBox_click = el.shotImg.addEventListener("click", () => el.shotInput.click());

  el.shotInput.addEventListener("change", async () => {
    const file = el.shotInput.files && el.shotInput.files[0];
    el.shotInput.value = "";                 // 清掉，选同一张图也能再触发
    if (!file) return;
    try {
      // 先压再预览：她看到的就是将来存下来的那张，不是原图
      const small = await shots.shrink(file);
      pendingFile = small;
      showShot(URL.createObjectURL(small));
      el.shotHint.textContent = "保存后才真正上传 · " + Math.round(small.size / 1024) + "KB";
      el.shotHint.classList.remove("bad");
    } catch (e) {
      el.shotHint.textContent = String(e && e.message ? e.message : e);
      el.shotHint.classList.add("bad");
    }
  });

  el.shotOpen.addEventListener("click", () => {
    const src = el.shotImg.getAttribute("src");
    if (src) window.open(src, "_blank", "noopener");
  });

  el.shotDel.addEventListener("click", () => {
    // 只从这条记录上摘掉；云上那张等保存时再删，取消就还留着
    pendingFile = null;
    shotPath = "";
    showShot(null);
    el.shotHint.textContent = "保存后生效";
    el.shotHint.classList.remove("bad");
  });

  el.banned.addEventListener("click", () => {
    setBannedSwitch(el.banned.getAttribute("data-value") !== "1");
  });

  el.scores.concat([el.total, el.name, el.verdict, el.date])
    .forEach(node => node.addEventListener("input", refreshCard));

  el.avgBtn.addEventListener("click", () => {
    const s = readScores();
    el.total.value = Math.round(((s[0] + s[1] + s[2]) / 3) * 10) / 10;
    refreshCard();
  });

  el.pngBtn.addEventListener("click", async () => {
    el.pngBtn.disabled = true;
    try {
      const name = await card.exportPng(cardData());
      el.pngDone.textContent = "已存到「下载」· " + name;
      el.pngDone.classList.add("ok");
    } catch (e) {
      el.pngDone.textContent = "没存成：" + (e && e.message ? e.message : e);
    } finally {
      el.pngBtn.disabled = false;
    }
  });

  el.cancelBtn.addEventListener("click", () => el.dialog.close());
  el.dialog.addEventListener("click", e => { if (e.target === el.dialog) el.dialog.close(); });

  el.deleteBtn.addEventListener("click", () => {
    if (!deleteArm) {
      deleteArm = true;
      el.deleteBtn.textContent = "确认删除？";
      el.deleteBtn.classList.add("confirm");
      return;
    }
    const id = el.editId.value;
    if (id) {
      onDelete(id);
      el.dialog.close();
    }
  });

  el.form.addEventListener("submit", async e => {
    e.preventDefault();
    const name = el.name.value.trim();
    if (!name) {
      el.nameError.classList.add("show");
      el.name.focus();
      return;
    }

    // 图要先传上去才知道路径。传不成就停在这儿，别把记录存成指向不存在的图。
    const id = el.editId.value || newLocalId();
    const hadShot = openedShot;
    if (pendingFile) {
      el.saveBtn.disabled = true;
      el.saveBtn.textContent = "传图中…";
      try {
        shotPath = await shots.upload(id, pendingFile);
        pendingFile = null;
      } catch (err) {
        el.shotHint.textContent = String(err && err.message ? err.message : err);
        el.shotHint.classList.add("bad");
        el.saveBtn.disabled = false;
        el.saveBtn.textContent = "保存";
        return;
      }
      el.saveBtn.disabled = false;
      el.saveBtn.textContent = "保存";
    } else if (hadShot && !shotPath) {
      shots.remove(hadShot);                 // 她把图摘了，云上那张也清掉
    }

    onSave({
      id,
      name,
      banned: el.banned.getAttribute("data-value") === "1",
      // 一句话结论同时当备注，榜上悬停就能看见，不用另填一遍
      note: el.verdict.value.trim(),
      review: {
        s: readScores(),
        total: parseFloat(el.total.value),
        buy,
        price: el.price.value.trim(),
        shot: shotPath,
        verdict: el.verdict.value.trim(),
        date: el.date.value.trim()
      }
    });
    el.dialog.close();
  });
}

/* ---------- 小工具 ---------- */

function readScores() {
  return el.scores.map(n => parseFloat(n.value) || 0);
}

/** 新记录的 id 要在保存前就定下来——截图的路径里带着它 */
function newLocalId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 传 src 就显示图，传 null 就回到空状态 */
function showShot(src) {
  const has = !!src;
  if (has) el.shotImg.setAttribute("src", src);
  else el.shotImg.removeAttribute("src");
  el.shotImg.hidden = !has;
  el.shotEmpty.hidden = has;
  el.shotActions.hidden = !has;
  el.shotBtn.textContent = has ? "换一张" : "选图";
}

function setBuy(v) {
  buy = v;
  Array.prototype.forEach.call(el.buy.querySelectorAll("button"), b => {
    const mine = b.getAttribute("data-val") === "1";
    b.classList.toggle("on", buy !== null && buy === mine);
    b.classList.toggle("yes", mine);
    b.classList.toggle("no", !mine);
  });
  refreshCard();
}

function setBannedSwitch(on) {
  el.banned.classList.toggle("on", on);
  el.banned.setAttribute("aria-checked", on ? "true" : "false");
  el.banned.setAttribute("data-value", on ? "1" : "0");
}

function cardData() {
  const s = readScores();
  return {
    title: el.name.value.trim(),
    scores: s,
    total: (parseFloat(el.total.value) || 0).toFixed(1),
    buy,
    verdict: el.verdict.value.trim(),
    date: el.date.value.trim()
  };
}

/** 分数一动就重画预览，并说清这条会落到榜上哪一格 */
function refreshCard() {
  const s = readScores();
  s.forEach((v, i) => { el.vals[i].textContent = v.toFixed(1); });
  el.totalVal.textContent = (parseFloat(el.total.value) || 0).toFixed(1);

  el.deriveHint.textContent =
    "会落在榜上：" + AXIS_LABEL.taste[deriveAxis(s[0])] +
    " × " + AXIS_LABEL.health[deriveAxis(s[2])] + "（配料表算健康这一轴）";

  el.pngDone.textContent = "1080×1920，存出来直接进剪映";
  el.pngDone.classList.remove("ok");

  card.draw(el.cardCv, cardData());
}

/* ---------- 打开 ---------- */

/** 传 item 是编辑，传 null 是新增 */
export function open(item) {
  el.nameError.classList.remove("show");
  deleteArm = false;
  el.deleteBtn.textContent = "删除这一条";
  el.deleteBtn.classList.remove("confirm");

  const rv = item && item.review;

  el.title.textContent = item ? "编辑测评" : "添加测评";
  el.editId.value = item ? item.id : "";
  el.name.value = item ? item.name : "";
  setBannedSwitch(!!(item && item.banned));
  el.deleteRow.hidden = !item;

  // 分数一律空着开始：预填上一次的分数等于替她先打了分
  el.scores.forEach((n, i) => { n.value = rv ? rv.s[i] : 0; });
  el.total.value = rv ? rv.total : 0;
  el.price.value = rv ? (rv.price || "") : "";

  // 截图状态每次打开都清干净：上一条的图绝不能串到这一条
  pendingFile = null;
  shotPath = rv ? (rv.shot || "") : "";
  openedShot = shotPath;
  showShot(null);
  el.shotHint.textContent = "图存在云上，所以要先登录；长边压到 1200 再传";
  el.shotHint.classList.remove("bad");
  if (shotPath) {
    el.shotEmpty.textContent = "在取图…";
    const want = shotPath;
    shots.url(shotPath).then(u => {
      // 取图是异步的，回来时她可能已经翻到别的记录了
      if (shotPath !== want) return;
      el.shotEmpty.textContent = "订单截图放这儿，回头核价用";
      if (u) showShot(u);
      else {
        el.shotHint.textContent = "有存过截图，但取不出来——检查一下登录和网络";
        el.shotHint.classList.add("bad");
      }
    });
  } else {
    el.shotEmpty.textContent = "订单截图放这儿，回头核价用";
  }
  el.verdict.value = rv ? rv.verdict : "";
  el.date.value = rv ? rv.date : card.today();
  setBuy(rv ? rv.buy : null);
  refreshCard();

  el.dialog.showModal();
  setTimeout(() => el.name.focus(), 50);
}
