/* sheet.js — 添加 / 编辑一条零食测评。
   三条 0–5 分（味道 / 量价比 / 配料表）+ 综合 + 回购 + 一句话，
   它在榜上落哪一格由分数推出来（deriveAxis），不再单独填一遍粗判。

   只管收集表单里的值，存哪儿、怎么同步都不归它管：
   保存和删除通过 open() 传进来的回调交出去。
*/

import { deriveAxis, unitPrice } from "./store.js";
import * as card from "./card.js";

const el = {};
let deleteArm = false;
let onSave = null;
let onDelete = null;
let buy = null;        // true | false | null——不预选，等她自己表态
let eachOverride = null;   // 她手动改过的单价；null 表示跟着总价÷数量走

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
  el.total_ = document.getElementById("f-total");
  el.qty = document.getElementById("f-qty");
  el.unit = document.getElementById("f-unit");
  el.from = document.getElementById("f-from");
  el.upVal = document.getElementById("up-val");
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

  [el.total_, el.qty, el.unit].forEach(n =>
    n.addEventListener("input", () => { eachOverride = null; paintUnitPrice(); }));

  // 单价算出来不对（买一送一、赠品之类）就点一下自己改
  el.upVal.addEventListener("click", () => {
    const now = currentEach();
    const typed = window.prompt("单价填多少？留空就回到自动算", now == null ? "" : String(round2(now)));
    if (typed === null) return;
    const t = typed.trim();
    if (!t) { eachOverride = null; paintUnitPrice(); return; }
    const n = Number(t);
    eachOverride = isFinite(n) && n >= 0 ? n : null;
    paintUnitPrice();
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

  el.form.addEventListener("submit", e => {
    e.preventDefault();
    const name = el.name.value.trim();
    if (!name) {
      el.nameError.classList.add("show");
      el.name.focus();
      return;
    }

    onSave({
      id: el.editId.value || null,
      name,
      banned: el.banned.getAttribute("data-value") === "1",
      // 一句话结论同时当备注，榜上悬停就能看见，不用另填一遍
      note: el.verdict.value.trim(),
      review: {
        s: readScores(),
        total: parseFloat(el.total.value),
        buy,
        price: readPrice(),
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

function round2(n) { return Math.round(n * 100) / 100; }

function numOrNull(input) {
  const v = input.value.trim();
  if (!v) return null;
  const n = Number(v);
  return isFinite(n) && n >= 0 ? n : null;
}

function readPrice() {
  return {
    total: numOrNull(el.total_),
    qty: numOrNull(el.qty),
    unit: el.unit.value.trim(),
    each: eachOverride,
    from: el.from.value.trim()
  };
}

/** 这会儿该显示的单价：改过就用改过的，否则现算 */
function currentEach() {
  return unitPrice(readPrice());
}

function paintUnitPrice() {
  const each = currentEach();
  const unit = el.unit.value.trim();
  if (each == null) {
    el.upVal.textContent = "—";
    el.upVal.classList.remove("has", "manual");
    return;
  }
  el.upVal.textContent = round2(each) + " 元" + (unit ? " / " + unit : "");
  el.upVal.classList.add("has");
  el.upVal.classList.toggle("manual", eachOverride != null);
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
  const pr = rv ? rv.price : null;
  el.total_.value = pr && pr.total != null ? pr.total : "";
  el.qty.value = pr && pr.qty != null ? pr.qty : "";
  el.unit.value = pr ? (pr.unit || "") : "";
  el.from.value = pr ? (pr.from || "") : "";
  eachOverride = pr && pr.each != null ? pr.each : null;
  paintUnitPrice();

  el.verdict.value = rv ? rv.verdict : "";
  el.date.value = rv ? rv.date : card.today();
  setBuy(rv ? rv.buy : null);
  refreshCard();

  el.dialog.showModal();
  setTimeout(() => el.name.focus(), 50);
}
