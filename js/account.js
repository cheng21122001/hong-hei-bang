/* account.js — 顶栏那颗同步药丸，和点开后的登录弹层。
   同步的规则全在 sync.js，这里只负责显示状态和转发按钮。
*/

import * as sync from "./sync.js";

const el = {};

export function mount() {
  el.chip = document.getElementById("sync-chip");
  el.dialog = document.getElementById("acct");
  el.status = document.getElementById("acct-status");
  el.form = document.getElementById("acct-form");
  el.email = document.getElementById("acct-email");
  el.pass = document.getElementById("acct-pass");
  el.signIn = document.getElementById("acct-signin");
  el.signUp = document.getElementById("acct-signup");
  el.signedIn = document.getElementById("acct-in");
  el.syncNow = document.getElementById("acct-syncnow");
  el.signOut = document.getElementById("acct-signout");
  el.msg = document.getElementById("acct-msg");
  el.close = document.getElementById("acct-close");

  el.chip.addEventListener("click", () => {
    say("");
    paint();
    el.dialog.showModal();
  });
  el.close.addEventListener("click", () => el.dialog.close());
  el.dialog.addEventListener("click", e => { if (e.target === el.dialog) el.dialog.close(); });

  el.form.addEventListener("submit", async e => {
    e.preventDefault();
    await run(el.signIn, "登录中…", async () => {
      await sync.signIn(el.email.value.trim(), el.pass.value);
      say("登录成功");
      el.pass.value = "";
    });
  });

  el.signUp.addEventListener("click", async () => {
    if (!el.email.value.trim() || el.pass.value.length < 6) {
      say("先填邮箱和至少 6 位的密码");
      return;
    }
    await run(el.signUp, "注册中…", async () => {
      const r = await sync.signUp(el.email.value.trim(), el.pass.value);
      say(r.needsEmail ? "注册成功，去邮箱点一下确认链接再回来登录" : "注册成功，已登录");
      el.pass.value = "";
    });
  });

  el.syncNow.addEventListener("click", async () => {
    await run(el.syncNow, "同步中…", async () => { await sync.syncNow(); });
  });

  el.signOut.addEventListener("click", async () => {
    await sync.signOut();
    say("已退出，这台设备上的记录还在");
  });

  sync.onState(paint);
  paint();
}

async function run(btn, busyText, fn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyText;
  try { await fn(); }
  catch (e) { say(String(e && e.message ? e.message : e)); }
  finally { btn.disabled = false; btn.textContent = old; }
}

function say(m) {
  el.msg.textContent = m || "";
  el.msg.hidden = !m;
}

function paint() {
  const s = sync.getState();
  el.chip.textContent = sync.statusText();
  el.chip.classList.toggle("warn", s.status === "error" || s.status === "offline");
  el.chip.classList.toggle("off", s.status === "signed-out");

  if (!el.dialog) return;
  el.status.textContent = sync.statusDetail();
  el.form.hidden = !!s.user;
  el.signedIn.hidden = !s.user;
}
