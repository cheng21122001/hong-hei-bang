/* sheet.js — 添加 / 编辑菜品的弹层。
   只管收集表单里的值，存哪儿、怎么同步都不归它管：
   保存和删除通过 open() 传进来的回调交出去。
*/

const el = {};
let deleteArm = false;
let onSave = null;
let onDelete = null;

export function mount(handlers) {
  onSave = handlers.onSave;
  onDelete = handlers.onDelete;

  el.dialog = document.getElementById("sheet");
  el.form = document.getElementById("form");
  el.title = document.getElementById("sheet-title");
  el.editId = document.getElementById("edit-id");
  el.name = document.getElementById("f-name");
  el.nameError = document.getElementById("name-error");
  el.note = document.getElementById("f-note");
  el.taste = document.getElementById("toggle-taste");
  el.health = document.getElementById("toggle-health");
  el.banned = document.getElementById("toggle-banned");
  el.saveBtn = document.getElementById("save-btn");
  el.cancelBtn = document.getElementById("cancel-btn");
  el.deleteRow = document.getElementById("delete-row");
  el.deleteBtn = document.getElementById("delete-btn");

  [el.taste, el.health].forEach(pair => {
    pair.addEventListener("click", e => {
      const btn = e.target.closest("button");
      if (btn) setTogglePair(pair, btn.getAttribute("data-val"));
    });
  });

  el.banned.addEventListener("click", () => {
    setBannedSwitch(el.banned.getAttribute("data-value") !== "1");
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
      taste: el.taste.getAttribute("data-value") || "red",
      health: el.health.getAttribute("data-value") || "red",
      banned: el.banned.getAttribute("data-value") === "1",
      note: el.note.value.trim()
    });
    el.dialog.close();
  });
}

function setTogglePair(pair, val) {
  Array.prototype.forEach.call(pair.querySelectorAll("button"), b => {
    const on = b.getAttribute("data-val") === val;
    b.classList.toggle("on", on);
    b.classList.toggle(b.getAttribute("data-val"), on);
  });
  pair.setAttribute("data-value", val);
}

function setBannedSwitch(on) {
  el.banned.classList.toggle("on", on);
  el.banned.setAttribute("aria-checked", on ? "true" : "false");
  el.banned.setAttribute("data-value", on ? "1" : "0");
}

/** 传 item 是编辑，传 null 是新增 */
export function open(item) {
  el.nameError.classList.remove("show");
  deleteArm = false;
  el.deleteBtn.textContent = "删除这道菜";
  el.deleteBtn.classList.remove("confirm");

  if (item) {
    el.title.textContent = "编辑菜品";
    el.editId.value = item.id;
    el.name.value = item.name;
    el.note.value = item.note || "";
    setTogglePair(el.taste, item.taste);
    setTogglePair(el.health, item.health);
    setBannedSwitch(!!item.banned);
    el.deleteRow.hidden = false;
  } else {
    el.title.textContent = "添加菜品";
    el.editId.value = "";
    el.name.value = "";
    el.note.value = "";
    setTogglePair(el.taste, "red");
    setTogglePair(el.health, "red");
    setBannedSwitch(false);
    el.deleteRow.hidden = true;
  }

  el.dialog.showModal();
  setTimeout(() => el.name.focus(), 50);
}
