# 小熊测评红黑榜

小熊的零食测评榜。每件零食打三条 0–5 分——味道 / 量价比 / 配料表——
再由味道和配料表两个分数把它放进 3×3 的榜里：右上红榜，左下黑榜。
填完能直接导出一张 1080×1920 的评分卡 PNG，进剪映当成片素材。

线上：<https://cheng21122001.github.io/hong-hei-bang/>

来历分两段：
- 2026-08-28 从 Claude Artifact 搬成独立站点，为的是能有自己的图标和真正的云同步。
  设计过程见 `docs/superpowers/specs/2026-08-28-hong-hei-bang-design.md`。
- 2026-09-09 和「小熊评分卡」（原来是个桌面 .app，源码在 `~/Downloads/小熊/评分卡app/`）
  合并，收窄成只做零食测评。原来那 188 条家常菜整批清掉了，留在
  `seed-家常菜-备份.json` 里；`js/migrate.js` 的 `dropDishes()` 负责让云端和手机
  跟着一起清。

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
seed.json             初始榜单（现在是空的，新设备从零开始）
seed-家常菜-备份.json  合并前那 188 条家常菜，只作备份，代码不读它
js/store.js           本地存储，唯一的显示来源
js/cloud.js           Supabase 账号与读写
js/sync.js            什么时候同步、怎么合并
js/board.js           3×3 榜单渲染 + 待评分
js/sheet.js           添加/编辑弹层
js/card.js            评分卡：画 1080×1920 的 canvas 并存成 PNG
js/migrate.js         一次性数据迁移
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

评分存在 `dishes.review` 这个 jsonb 列里：
`{ s:[味道,量价比,配料表], total, buy, verdict, date }`。
用 jsonb 而不是拆成四五个列，是为了以后加评分维度（比如「惊喜感」）不用再改表。

榜上两条轴由「味道」和「配料表」两个分数定位，所以**缺任一个分数的条目不进格子**，
单独排在榜上面的「待评分」里——把没打分的东西摆进某一格，等于替她做了判断。
补录已发过的片子时最容易撞上：有几期只报了综合分。

`review.price` 是价目：`{ total 总价, qty 数量, unit 单位, each 单价, from 渠道 }`。
`each` 留空就用 `total/qty` 现算——**「量价比」那一分看的就是单价**，所以它在表单里
单独占一条、大字显示。最早做成一句自由文本（「56块6罐，一罐9块3」），
她的评价是「不清晰，没有单价」，才改成现在这样。旧的字符串数据整句搬进 `from`。


同步规则：**先拉后推**。拉下来的不覆盖本地未推送的改动，随后本地改动推上去
覆盖云端。同一条在两台设备都改过，后同步的那台赢。删除用墓碑
（`deleted = true`），不真删行，否则删除传不到另一台设备。

不登录也能用，改动全存本地；哪天登录了会一次性并进账号。
