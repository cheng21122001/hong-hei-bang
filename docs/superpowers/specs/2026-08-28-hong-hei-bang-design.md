# 红黑榜 —— 从 Artifact 搬成自带图标的云同步 PWA

2026-08-28

## 起因

红黑榜现在是一个 Claude Artifact（`claude.ai/code/artifact/2a6f6fcd-9910-4312-9836-ca6de87d3a98`），
靠 `window.claude.use("artifact")` 把整份数据写回自己的 HTML 来持久化，装在 Mac 上是
`~/Applications/Chrome Apps.localized/紅黑榜.app`。

两个问题：

1. **图标换不了**。Chrome 应用的图标由 Chrome 抓取生成，Artifact 只能给 emoji favicon；
   改 `Info.plist` 会破坏 Chrome 的签名（见 `mac-desktop-launcher-tcc` / river 那次的教训）。
2. **数据绑死在 Artifact 上**。要多设备改、要能自己掌控，得有真正的后端。

## 目标

把它搬成一个独立站点，走 river 那条已经跑通的链路：GitHub Pages 托管 + PWA manifest 自带图标
+ Supabase 云同步。UI 和四象限逻辑原样保留，不重做。

## 架构

```
浏览器
 ├─ UI (board.js / sheet.js / account.js)
 ├─ store.js    本地唯一显示来源（localStorage）
 ├─ sync.js     何时同步、怎么合并
 └─ cloud.js ── Supabase (auth + dishes 表, RLS)
```

**站点**：`~/Downloads/网站/hong-hei-bang` → `cheng21122001/hong-hei-bang` →
`https://cheng21122001.github.io/hong-hei-bang/`。push 到 main 后 Pages 自动重建。

**本地存储**：`localStorage`，不用 IndexedDB。全量数据 156 条约 20KB，
不像 river 的心情记录那样逐日无限增长，IndexedDB 在这里是多余的复杂度。

**云端**：复用 river 的 Supabase 项目 `qsqcmsznxhuwjrjnihob`。同一个项目意味着
auth 用户是通的——river 上已注册的账号直接能登录红黑榜。新建 `dishes` 表，
RLS 策略与 `entries` 同构：只能读写 `auth.uid() = user_id` 的行。
anon key 按设计就是要嵌进客户端的公开值，安全边界完全由 RLS 决定。

## 数据模型

本地一条记录：

```js
{ id, name, taste, health, banned, note, createdAt,
  editedTs?, deleted?, dirty? }
```

`taste` / `health` 取值 `"red" | "mid" | "ink"`，与 Artifact 版完全一致，
所以 156 条历史数据可以原样搬过来。

云端 `dishes` 表字段用 snake_case（`user_id, id, name, taste, health, banned,
note, created_at, edited_ts, deleted, updated_at`），主键 `(user_id, id)`，
`updated_at` 由触发器维护，同步游标就走它。

`deleted` 是墓碑：删除不是真删行，否则删除操作没法传播到另一台设备。
本地渲染时过滤掉 `deleted` 的行。

## 同步

照搬 river 的规则，因为它已经在用且可解释：

- 顺序永远是**先拉后推**。拉下来的不覆盖本地未推送的改动，随后本地改动推上去覆盖云端。
  同一条在两台设备都改过时，后同步的那台赢。不比较两台设备的钟。
- 触发时机：登录后、本地写入 1.5 秒防抖、页面重新可见、`online` 事件、5 分钟兜底轮询。
- 未登录时照常能用，所有改动标为 dirty 存本地；首次登录把本地全部标 dirty 一次性并入账号。
- 换账号时清空本地重新全量拉，绝不把上一个账号的记录混进来。

## 初始数据

`seed.json` 存 Artifact 里那 156 条。本地存储为空且没同步过时导入，全部标 dirty，
首次登录后自动推上云端。已经同步过的设备不会重复导入。

## 图标

方案 B（用户选定）：正方形，右上朱红 `#c43d2b`、左下墨黑 `#211c16` 对角分割，
中间一道纸黄 `#efe7d4` 接缝。对应 app 里红榜（右上象限）和黑榜（左下象限）的位置。
无字，满出血，因此天然满足 maskable 安全区。

`tools/make-icons.py` 用纯 Python 生成 PNG（这台机器没有 PIL，也不为了画两个三角形去装）：
4 倍超采样后降采样做抗锯齿，逐像素判断 `y - x` 的符号与到对角线的距离。
产出 512 / 192 / 180(apple-touch) / 32，外加一份手写的 `favicon.svg`。

## Service Worker

照 river 的写法，两个已经踩过的坑必须保留：

- install 时逐个 `fetch(url, {cache:"reload"})` 再 `cache.put`，不能用 `cache.addAll()`
  ——后者会走 HTTP 缓存，装进去的还是旧文件。
- 新 SW 接管时监听 `controllerchange` 自动刷新一次（首次安装不刷）。
- **改任何静态文件都要把 `sw.js` 顶部的 VERSION 加一。**
- Supabase 的请求一律不进缓存，SW 只管应用外壳。

## 用户需要手动做的两件事

1. 在 Supabase SQL Editor 跑 `supabase/schema.sql`（建表 + RLS + 触发器）。
2. 旧的 `紅黑榜.app` 在 `chrome://apps` 里移除，再从新地址「安装为应用」。
   Chrome 应用改不了名也改不了图标，只能重装。

## 不做的事

- 不重新设计 UI。四象限、搜索、长期禁忌开关、编辑弹层全部保留现状。
- 不做导入导出、不做统计、不做分享。现在没有这个需求。
- 不动 Artifact 那一份，留着当备份。
