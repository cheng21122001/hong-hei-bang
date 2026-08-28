# 红黑榜

我的私房菜品评分册。两条轴——口味、健康——把每道菜放进四个象限：
右上是红榜，左下是黑榜。

线上：<https://cheng21122001.github.io/hong-hei-bang/>

原来是个 Claude Artifact，2026-08-28 搬成独立站点，为的是能有自己的图标
和真正的云同步。设计过程见 `docs/superpowers/specs/2026-08-28-hong-hei-bang-design.md`。

## 怎么跑

```
python3 -m http.server 8813
```

然后开 <http://localhost:8813>。`crypto`/Service Worker 都要求安全上下文，
localhost 算安全上下文，直接开 `file://` 不行。

## 结构

```
index.html            外壳
app.css               全部样式
seed.json             初始榜单（从 Artifact 版搬过来的 157 条）
js/store.js           本地存储，唯一的显示来源
js/cloud.js           Supabase 账号与读写
js/sync.js            什么时候同步、怎么合并
js/board.js           四象限渲染
js/sheet.js           添加/编辑弹层
js/account.js         同步状态药丸与登录弹层
supabase/schema.sql   云端建表，在 Supabase 后台跑一次
tools/make-icons.py   生成图标 PNG
sw.js                 离线缓存
```

## 三条规矩

1. **改了任何静态文件，把 `sw.js` 顶部的 VERSION 加一。** 不然 Service Worker
   一直喂旧缓存，你会以为"改了没生效"。
2. 改图标先改 `tools/make-icons.py`，再跑 `python3 tools/make-icons.py`，
   别手改 `icons/` 里的文件。
3. 装桌面用 Chrome「安装为应用」。**Chrome 应用的名字和图标事后都改不了**，
   要换只能在 `chrome://apps` 里移除再重装。

## 云同步

用的是「河」那个 Supabase 项目，账号是通的，同一个邮箱密码两边都能登。
`js/config.js` 里那串 anon key 是公开值不是密钥——能做什么完全由 RLS 决定，
`dishes` 表的策略是「只能读写 auth.uid() 等于自己的行」。

同步规则：**先拉后推**。拉下来的不覆盖本地未推送的改动，随后本地改动推上去
覆盖云端。同一道菜在两台设备都改过，后同步的那台赢。删除用墓碑
（`deleted = true`），不真删行，否则删除传不到另一台设备。

不登录也能用，改动全存本地；哪天登录了会一次性并进账号。
