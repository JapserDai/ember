# 交接文档

> 写给下一个接手这个仓库的 agent。
> 写于 2026-10-25。**先读这一份，再读 docs/00。**

---

## 0. 三十秒版本

**Ember** 是一个**完全离线、只有 Android、全中文**的游戏化人生管理 App。
没有账号、没有服务器、没有社交、**不申请网络权限**。数据只在这台手机上。

用户是近乎零基础的自学者，靠 AI 写代码。**所有代码注释、所有文档、所有界面文案必须是中文。**

**当前进度**：阶段 0–5 **全部完成**；阶段 6 完成 **7/9**（只剩「商店截图」与「真机手测」——两件都只差一台真机）。
**代码状态**（2026-10-27 实测）：`tsc` **0 错误**、`expo export` **通过**（3.5MB .hbc）、`npx expo start` 起得来、仓库外 **1163 项断言全绿**（21 个套件）。

**2026-10-26 上一轮（D48 / D49）**：底栏从「今天/目标/回忆/我的」改成「**今天/状态/日记/我的**」。
「目标」换成照抄人升（LifeUp）的「**状态**」页（人生等级 + 五维属性条 + 称号），目标降为二级页（入口在「我的」）；
「回忆」改成「**日记**」，新增每天写一句（新表 `journal_entries`，迁移 **v13→v14**），复盘仍在里面。
**五维是从「我的」页搬到了「状态」页，不是删掉**——数据、称号、猜属性规则一个字段都没动。
**最大的缺口**：**从头到尾没在真机上点过一次。** 所有验证都是逻辑层 + 打包层。这一轮新增的三个功能里有三个只在真机上才成立的点（`react-native-view-shot` 原生模块是否链上、卡片截图中文是否截断、通知与权限的实际表现），`expo export` 与断言都证明不了它们。

**2026-10-27 这一轮（D59）**：**主题从四套砍到两套（白 / 夜航），并给每个页面加了彩色元素**。
新增 `palette.nature`（六个自然色）+ `palette.natureTint`（洗色）+ `domain/natureMarks.ts`（六个图案，坐标搬 Lucide）
+ 一条自己画的五段彩虹 + `components/NatureMark.tsx` + `components/PageTitle.tsx`。
每页一个图案且与该页语义对上（状态=芽、日记=太阳、我的=彩虹、商店=花、称号=地球、统计=云雨、复盘=叶、叙事=四季）。
五维进度条各给一个自然色。**待办页（今天）零改动**——这是用户明确要求，`nature-test` 有四条断言盯着。
苔原 / 晨光的色板已删，但 `settings.theme_id` 的 CHECK **没动**（D31），旧值由 `PALETTE_ALIASES` 映射到白。

**2026-10-27 上一轮（D53）**：**商店从「只卖材料」扩成四类六件 + 自定义奖励**。
材料 / 精炼 / 保护（护盾 + 宽限券补货）/ 回看，外加「用户自己写、自己标价、点兑换」的自定义奖励
（docs/01 采纳人升的那一条，数据层早就有 `tasks.type='reward'` + `ember_cost`，只差界面）。
迁移 **v14→v15** 加 `grace_tickets` / `streak_shields` / `restore_tokens` 三列，**三列都进了备份白名单**。
合成改成「一次合到底」。商品图形搬 Lucide（`domain/shopMarks.ts` + `components/ShopMark.tsx`）。
**踩到的坑**：`svgpath` 的 `abs()` 不把 `H`/`V` 转成 `L`，转换器漏了它们导致四条路径被切歪——
已修，并写进 `fetch-lucide-marks.ts` 的注释。

**2026-10-27 上一轮（D52）**：**称号分两层 + 每个称号有了图形**。
属性称号（原有 15 个，五维 × 三档）不动；新增**旅程称号 5 个**（人生等级 10/20/30/40/50），回答「你一共走了多远」。
图形**搬 Lucide**（ISC 许可，可商用），不是手绘：`scripts/fetch-lucide-marks.ts` 从 `lucide-static@1.61.0`
拉图标、用 `svgpath` 转成项目规矩（绝对命令 + 圆弧变贝塞尔）后抄进 `src/domain/titleMarks.ts`。
五只：`beaker`（体魄）/ `book-open`（心智）/ `archive`（秩序）/ `moon`（心力）/ `users`（联结）。
**档位有两种表达**：体魄与秩序是真容器，画**水位**；其余三只画**浓度**（0.55 / 0.8 / 1）。
组件 `components/TitleMark.tsx`，验形 `scripts/preview-title-marks.ts`。
图鉴页从 **20 张竖排卡压到 6 张卡**（五维每维一张、三档并排可直接比）。
**零迁移、不存库**，仍全部现算。
**为什么搬而不画**：第一版手绘的五只容器被真图推翻三次——锅的圆弧底让矩形水位悬空、
抽屉的盖让满档水面留白缝、碗与锅在 26px 下分不清。已写成断言（`titles-test`）防止改回去。

**2026-10-27 上一轮（D50）**：**品牌记号换成「一朵小火花」**。旧的 `assets/icon.png` 是一个发光的蓝色「Λ」（语义是「上升」，不是「火」），
底栏「今天」是一簇火苗，落地页顶栏是一支描边的小火苗——**同一件事画了三遍**。现在形状只在 `src/domain/spark.ts` 写一次：
界面走 `components/SparkMark`，六个位图由 `scripts/make-logo.ts` 生成，落地页顶栏与 favicon 内联同一串 path。
`SparkMark` 之前**没有任何地方用**，现在接在隐私页（标题旁一个记号 + 页脚「记号 + Ember 0.0.1」，版本号读 `app.json`）。
同时修了 `scripts/make-logo.ts` 的 5 个 tsc 错误（`expo/tsconfig.base` 没带 `types: ["node"]`，加一行 `/// <reference types="node" />`）。

**2026-10-26/27 上一轮做了什么**（D43–D49，详见 DECISIONS）：
图片导出（周报图 / 月报图 / 复盘卡）、日常维护收成一个函数并接到「回到前台」、
D1–D7 引导（迁移 v12→v13）、GitHub Pages 落地页（可点的火带演示）。
**交接时请先按 §1 跑一遍基线**——上一版文档写的「tsc 绿」当时其实有 9 个错误。

---

## 1. 接手第一件事

按顺序跑这三条，确认基线是绿的再动手：

```bash
cd C:/Users/16907/Ember
npx tsc --noEmit                              # 期望：无输出
npx expo export --platform android --max-workers 1   # 期望：成功，约 3.5MB .hbc
sh "C:/Users/16907/AppData/Local/Temp/ember-check/run-all.sh"  # 期望：21 个套件全绿（1163 项）
```

第三条是**仓库外**的临时测试（见 §7）。它在 `%TEMP%` 下，不进 git——如果那台机器上已经没有了，§7 写了怎么重建。

**2026-10-27 实测结果**（三条都跑过）：

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 0 错误 |
| `npx expo export` | 成功，3.5MB `.hbc` |
| `run-all.sh` | 21 套件 / 1163 项断言全绿（2026-10-27；`home-prefs-test` 80 项、`simplify-test` 75 项、`migrate-old-test` 21 项） |
| `npx expo start` + 请求 dev bundle | HTTP 200，路由里含 `(tabs)/status`、`(tabs)/journal`、`goals/index` |

> **上一版文档说「tsc 0 错误、193 项全绿」是错的。** 接手时实测到 **9 个 tsc 错误**
> （`app/titles.tsx` 五条 import 路径写成 `../../src/`、`_layout.tsx` 把
> `maxFontSizeMultiplier` 写进 `TextStyle`、`services/streak.ts` 用 `'ok'` 索引
> `REPAIR_MESSAGE`）和 1 条过时断言（`e2e` 里写死「导出了 5 张表」，而当时已有 8 张）。
> 九个错误已全部修掉，断言改成与 `BACKUP_TABLES.length` 联动。
> **教训：文档里的「已绿」不能当证据，接手必须自己跑一遍。**

### 1.1 如果 `bash` 工具一跑就报 WSL 错（2026-10-26 遇到过，现已修好）

现象：任何命令都返回
`WSL (10 - Relay) ERROR: CreateProcessCommon:800: execvpe(/bin/bash) failed`，或者干脆挂 15–105 秒后超时。

原因：这台机器上 Git Bash 装在 **`D:\Git\bin\bash.exe`**（不在 `%ProgramFiles%`），
而 Pi 在找不到 Git Bash 时会退回 PATH 上的 `C:\Windows\System32\bash.exe`——那是 WSL 的启动器，
而这台机器没装任何 WSL 发行版，于是每条命令都失败。

修法（任选一条）：
1. 在 `~/.pi/agent/settings.json` 里指定 `"shellPath": "D:\\Git\\bin\\bash.exe"`，然后**重启 Pi**；
2. 或者直接确认 `D:\Git\bin\bash.exe` 存在，把它加到 PATH 前面。

注意：`curl`/`node` 之类都没问题，坏的只是「Pi 用哪个 bash」。
**改完 `settings.json` 必须重启 Pi，`/reload` 不一定重解析 shellPath。**

> 这一节保留着，因为那台机器上的修法不是仓库里的东西——换一台机器接手时很可能再撞上。

### 1.2 开发服务器报 `Cannot read property 'ErrorBoundary' of undefined`（2026-10-27 踩到）

```
ERROR  [TypeError: Cannot read property 'ErrorBoundary' of undefined]
Code: react.development.js
> 1297 |       return resolveDispatcher().useMemo(create, deps);
```

**先查这四个目录在不在**（一条命令）：

```bash
cd C:/Users/16907/Ember
ls -d node_modules/react-dom node_modules/react-native-reanimated       node_modules/react-native-worklets node_modules/react-native-gesture-handler 2>/dev/null
```

**只要有任何一个存在，就是这个问题。** 原因：这五个是 `expo-router` 声明的
**optional peer**，npm 7+ 会把它们也装到顶层；而

1. `react-dom` 在、`react-native-web` 不在时，`expo-router` 会从
   `views/ErrorBoundary` 取到一个 **undefined 的导出**；
2. `reanimated` / `worklets` 需要在 `babel.config.js` 里注册插件，而这个项目
   **刻意没有 `babel.config.js`**（D3：少一层配置卡点），插件没注册会让
   worklet 的 hook 调度错位。

**修法**（`.npmrc` 已经写好了，别再删它）：

```bash
rm -rf node_modules
npm install          # .npmrc 里的 legacy-peer-deps=true 会挡住那五个
```

**为什么会发生**：跑 `npx expo install <任何包>` 时 npm 顺手补 optional peer。
那次装了 `react-native-view-shot`，连带进来 **20 个包**，其中就有这 4 个。

> **这一条的教训比修法重要**：`tsc` 0 错误、`expo export` 通过、305 项断言全绿——
> **三个都发现不了它**，因为生产打包走的模块图与开发服务器不是同一份。
> 所以「导出成功」不能替代「`npx expo start` 能起来」。

---

## 2. 硬约束（违反任何一条都会造成真实损害）

### 2.1 不许碰的东西

| 约束 | 为什么 |
| --- | --- |
| **不申请网络权限** | `app.json` 的 `android.blockedPermissions` 里删掉了 INTERNET / ACCESS_NETWORK_STATE / 存储 / 悬浮窗。这是产品的第一条承诺。改完必须用 `npx expo config --type introspect` 复核这些权限仍带 `tools:node="remove"` |
| **不许装** Drizzle、Skia、expo-updates、任何同步框架、任何网络请求库 | 用户明确要求；也与「离线、少依赖」一致 |
| **不许让 `expo-router` 的 optional peer 混进 `node_modules`** | 见 §1.2。`.npmrc` 的 `legacy-peer-deps=true` 就是为它写的。装进来会让**开发服务器**报 `Cannot read property 'ErrorBoundary' of undefined`，而 `tsc` / `expo export` / 那 305 项断言**全都发现不了** |
| **不许删/覆盖** `@jasperdai__ember.jks` 与 `@jasperdai__ember.bak.jks` | 两个 keystore 在仓库根目录（已被 .gitignore 排除）。删错一个，**已经装在手机上的 apk 就再也无法升级** |
| **不许读/探测** 任何含凭据的文件（如 `~/.expo/state.json`） | 已被安全分类器判定为凭据探测。被拦下的命令**不要绕过**，换一条路或直接问用户 |

### 2.2 数据层的两条铁律

**铁律一：已发布的迁移与建表常量都不许改**（D31）。

`src/db/schema.ts` 里的 `SCHEMA_SQL_V1`、各 `MIGRATE_V*_TO_V*_SQL`、以及 `src/db/migrate.ts` 里已经写进数组的迁移函数，**一个字都不能改**。加列只能**新写一条**迁移常量并在 `MIGRATIONS` 数组末尾追加，同时把 `CURRENT_SCHEMA_VERSION` +1（**现在是 13**）。

这不是洁癖，是踩过的坑：`goal_id` 被加进 `SCHEMA_SQL_V1` 之前就建过库的安装，`CREATE TABLE IF NOT EXISTS` 不会补列，于是那些库永远缺这一列——表现是**首页读不出数据、新建任务点了保存毫无反应**。测试时用全新库永远看不出来。

写新迁移时，如果 `ALTER TABLE ADD COLUMN` 有可能撞上已存在的列，**先查 `PRAGMA table_info`**，不要直接 ALTER（一抛错整条迁移链回滚，用户永远卡在旧版本打不开）。

**铁律二：加了新列，必须同步备份白名单。**

`src/domain/backup.ts` 的 `BACKUP_TABLES` 是导出/导入的列白名单。**漏了不报错，只会静默丢数据**——用户导出再导入，那一列全部变成默认值。已经踩过两次（`avatar_seed`、`reminder_minute`）。

判断方法：每次加列后 `grep -n "新列名" src/domain/backup.ts`，确认它出现在 `BACKUP_TABLES` 里。

### 2.3 分层与事务

```
app/  →  services/  →  db/repo/  →  domain/
(页面)   (编排)        (单表读写)    (纯函数)
```

- **事务只出现在 `services/`**（`runInTransaction`）。
- `db/repo/*` **只做单表读写，互相不 import**。跨表编排放 services。
- `domain/*` **不碰 React、不碰数据库、不读系统时间**。所有输入从参数进来。
- **业务日的唯一入口是 `src/domain/date.ts`**。读和写都必须用 `effectiveToday(nowMs, dayStartHour, lastSettledDate)`（它会挡住「系统时间被调回过去」），不要自己 `new Date()` 拼日期字符串。
- 业务日是 `YYYY-MM-DD` + `day_start_hour`（默认 4，即凌晨 4 点换日）。注意 `diffDays(a, b)` 返回 **`b - a`**——写反过这个方向，代价是撤销功能整个失效。

### 2.4 文案

所有用户可见的中文都要过 `src/domain/text-rules.ts` 的 `FORBIDDEN_WORDS`：
`失败 / 惩罚 / 归零 / 前功尽弃 / 必须 / 应该 / 不准偷懒 / 太可惜 / 差一点 / 你让 / 失望 / 受伤 / 饿死 / 排行榜 / 别人已经`。

三条产品底线（README 与 docs/01）：
1. **不惩罚**——不掉级、不没收、不死亡。断签只是从头数，历史一直在。
2. **不联网**——见 2.1。
3. **不评判**——只记录，不指责。没有「你失败了」，没有排行榜。

具体到界面：**断签后任何位置不出现「0」和「归零」**。连胜断了要显示「有一段空档」+「历史最佳 X 天 / 累计 Y 天」，三个数并排——用户看到的是「我做过很多」。

---

## 3. 仓库地图

```
app/                          页面（expo-router 文件路由）
  _layout.tsx                 根布局：bootstrap（开库→迁移→种子→日常维护→读设置）+ AppState 回前台补维护
  onboarding.tsx              首次启动引导（三屏，默认选中「喝一杯水」）
  (tabs)/index.tsx            今天：标题日期 + 火带（可关）+ 月历（可关）+ 习惯行
                                 + 待办卡（右滑删，D55）+ 右下「+」（D61 删掉了横带/引导卡/三模板）
  (tabs)/status.tsx           ★ 状态（D48）：人生等级 + 五维属性条 + 称号摘要（照抄人升版式）
                                 装配在 domain/status.ts；这一页只渲染（分母 = 本级总需）
  (tabs)/journal.tsx          ★ 日记（D49）：今天写一句 + 按天历史 + 周/月复盘入口 + 关键节点 + 存成图片
                                历史区右上「看更早的」→ journal/history.tsx（D54）
  (tabs)/me.tsx               我的：头像、Lv、余烬、连胜、称号、商店/统计/目标/状态入口 + D5 引导卡
  journal/history.tsx         ★ 全部日记（D54）：日期游标分页，点一天退回日记页改
  goals/index.tsx             目标列表（进行中 / 已完成分组）+ D3 引导卡（D48 起是二级页）
  goals/new.tsx               新建目标
  goals/[id].tsx              目标详情：改标题/为什么/截止日、挂任务、手动完成
  profile/edit.tsx            人物资料：名字 + 一句自我介绍
  review/index.tsx            周复盘（三个固定问题 + 存成图片 / 发成文字）
  review/month.tsx            月复盘（看数字 + 一句可写的 + 存成图片）
  titles.tsx                  称号图鉴（未解锁显示「？」+ 还差多少）
  shop.tsx                    商店 + 材料合成
  narrative.tsx               叙事：四季故事 + Boss + 月度主题
  rule-engine.tsx             温柔复盘 + 任务拆解（本地模板）
  privacy.tsx                 你的数据在哪儿
  settings/index.tsx          设置（分组：资料 / 外观 / 节奏 / 数据）
  settings/theme.tsx          主题选择（两套预览卡，D59）
  settings/home.tsx           ★ 首页设置（D62）：月历 / 火带 / 右滑提示 / 待办条数
  settings/difficulty.tsx     ★ 难度选择（D62）：三档，带禁改窗口（repairable 时不许改）
  settings/day-start.tsx      ★ 日界选择（D62）：0–23 全圈
  settings/backup.tsx         备份：导出、导入、回到导入前、日志
  settings/reminders.tsx      提醒：每个任务一个时刻
  stats.tsx                   统计：近 30 天
  tasks/new.tsx               新建任务（必填只有名字）

src/db/
  schema.ts                   ★ 建表 SQL + 全部迁移常量（铁律一）。现到 v15
  migrate.ts                  ★ 手写迁移器（PRAGMA user_version），CURRENT_SCHEMA_VERSION = 15
  client.ts                   单例连接、PRAGMA、runInTransaction
  seed.ts                     首次启动：player 1 行 + settings 1 行
  repo/{player,settings,tasks,checkins,goals,streak,reviews,journal}.ts   单表读写

src/content/                  叙事内容（纯数据，加内容不改代码）
  stories.ts                  四季故事（24 段，累计天数解锁）
  boss.ts                     四季 Boss（血量 60，无死亡无惩罚）
  monthlyEvents.ts            12 个月的活动（主题 + 3 个方向 + 1 材料）

src/domain/                   纯函数
  date.ts                     ★ 业务日唯一入口
  score.ts                    打卡算分（基础 → 难度 → 补记 → 软上限 → 硬上限）
  balance.ts                  等级曲线、每日额度、三档难度、五维
  streak.ts                   连胜（从日期序列现算）+ 桥接日 + 修复/宽限券判定
  recurrence.ts               排期（daily / weekly_days / monthly_days / every_x_days / weekly_times）
  settle.ts                   惰性日结算的纯规则
  reminder.ts                 提醒的纯规则（时刻换算、文案库、上限截断）
  review.ts                   周复盘（周键、规范化、摘要）
  journal.ts                  ★ 日记的纯规则（规范化、空串判定、摘要，D49）
  status.ts                   ★ 状态页的读数（人生等级的本级总需、属性 LV 与总分，D48）
  calendar.ts                 ★ 月历的纯计算（格子对齐、跨年翻月、周日起头，D57）
  homePrefs.ts                ★ 首页偏好（D62）：解析 / 序列化 / 默认值；只写与默认不同的字段
                                 —— 纯函数放这里才测得到；留在页面里曾漏过一个分母 bug
  guide.ts                    ★ D1–D7 引导（七张卡、第几天、该不该显示）
  titleMarks.ts               ★ 称号的图形（坐标搬自 Lucide，D52；版权声明在文件里）
  shopMarks.ts                ★ 商店商品的图形（6 个 Lucide 图标，D53）
  natureMarks.ts              ★ 自然图案（芽/花/地球/太阳/云雨/叶 + 自绘彩虹，D59）
  spark.ts                    ★ 品牌记号的几何（SPARK_PATH / BOX / BOUNDS / CENTER，D50；六个位图与界面共用）
  exportCard.ts               ★ 导出卡片的**内容**（纯数据，可在无手机环境验）
  monthReview.ts              月复盘（月末最后一个周六、五维变化）
  titles.ts                   称号（五维 × 三档，纯推导不存状态）
  shop.ts                     商店商品 + 合成配方 + 买完剩多少
  discovery.ts                今日发现（40 条，种子化）
  ruleEngine.ts               温柔复盘 + 任务拆解（模板 + 关键词）
  backup.ts                   ★ 备份校验 + BACKUP_TABLES 白名单（铁律二）
  text-rules.ts               禁用词表
  goals.ts / profile.ts / avatar.ts / prng.ts / task-templates.ts

src/services/                 编排（事务在这里）
  checkin.ts                  打卡 / 撤销
  today.ts                    首页数据装配（只查一次打卡表）
  goals.ts / profile.ts / avatar.ts
  stats.ts                    统计页取数
  settle.ts                   结算接线
  streak.ts                   ★ 宽限券（惰性补）+ 修复（事务）
  review.ts / monthReview.ts  周复盘 / 月复盘取数与保存
  journal.ts                  ★ 日记视图（业务日 + 今天 + 历史）、目录分页、单日读取、保存（D49 / D54）
  journalHandoff.ts           ★ 「打开某一天」的一次性队列（取走即清空，不走 tab 路由参数，D54）
  weekReport.ts               周报导出（文字版 + buildWeekCard 给图片版）
  maintenance.ts              ★ 日常维护：结算 → 宽限券 → 月度奖励 + 提示队列
  guide.ts                    ★ D1–D7 的锚点（老库补 guide_start_date）
  exportImage.tsx             ★ 截图 + 分享（离屏挂载 → captureRef → 1080px PNG）
  exportCards.ts              月报卡 / 复盘卡 / 时间线混排
  shop.ts                     购买 / 合成（事务）
  narrative.ts                叙事取数 + 月度奖励发放 + 关键节点
  errorLog.ts                 ★ 本地错误日志（同步、绝不抛错、不记用户内容）
  logExport.ts                日志导出（异步）
  backup.ts / backup-import.ts  导出 / 导入 + 导入前快照
  reminders.ts                ★ 唯一碰通知 API 的地方（任务提醒 + 周复盘提醒）
  calendar.ts                 ★ 月历的读数（有记录的日子 / 某一天的明细，D57）
  homePrefs.ts                ★ 首页偏好的读写（D62）：读失败退回默认值，写失败抛错

src/components/               Card（全 App 唯一的「框」）、TodoCard、TodoCheckbox、
                              TaskRow、HearthBar、AwardFloat、AddButton、QuickStart、
                              StatBarList、SettingsRow、PlayerAvatar、AvatarPickerSheet、
                              DueDateField、TabBarIcon、StageNote、EmberMeter、StreakRepairCard、
                              ExportCardView（导出卡片版式）、GuideCardView（D1–D7 卡片）、
                              useGuideCard（哪一页负责第几天）、SparkMark（品牌记号，D50）、
                              TitleMark（称号图形：容器 + 水位 / 斜路 + 落点，D52）、
                              ShopMark（商品图形，D53）、
                              NatureMark（自然图案，D59）、PageTitle（标题 + 图案 + 副标题，D59）、
                              CalendarCard（首页月历，D57）、
                              SwipeToDelete（右滑露出「删」的卡片框，D55）

src/theme/tokens.ts           ★ 全项目唯一允许出现十六进制色值的地方（两套色板）
src/theme/ThemeProvider.tsx   theme + themeId + reduceMotion + 行高按字号重算

scripts/make-logo.ts          ★ 由 SPARK_PATH 生成 6 个位图（无头 Chrome 光栅化，D50）
scripts/preview-title-marks.ts  ★ 把称号图形打成点阵 + 三档并排（D52）
scripts/fetch-lucide-marks.ts   ★ 从 Lucide 拉图标并转成项目规矩的坐标（开发期，D52）
assets/                       icon / android 三件套 / splash / favicon + logo-spark.svg
                              （**全部是生成物**，改形状只改 spark.ts 再重跑脚本）

site/                        落地页（GitHub Pages 的站点本体，无构建步骤）
  index.html                 页面 + 顶部一段 window.EMBER_SITE 配置（**只改这里**）
  style.css                  配色取自 src/theme/tokens.ts；不加载任何外部资源
  app.js                     可点的火带演示（点圈 / 长按撤销，逻辑照抄 App）
  README.md                  上线步骤、出包后要改什么、三条约束、自查命令
.github/workflows/pages.yml  把 site/ 原样发布到 Pages（不用 /docs 方案）
```

**界面代码里出现 `#2564CF` 这样的字面值就是 bug**——一律读 token。

---

## 4. 进度：做完的 / 没做的

### 已完成

| 阶段 | 交付物 | 决策 |
| --- | --- | --- |
| 0 | 项目初始化、EAS 配置、包名 `com.emberhabit.app` | — |
| 1 | 全部 13 条（打卡闭环、撤销、新建任务、目标页、导出、连胜展示、To Do 改版…） | D21 D22 D27 D29 D30 |
| 2-1/2 | 本地通知 + 20 条文案库 | **D36** |
| 2-3 | 连胜修复 + 宽限券（`streak_bridges` 表） | **D38** |
| 2-4 | 打卡反馈升级（飘字 + 里程碑 3/7/30/100） | D34 |
| 2-5 | 统计页（横条，不报完成率） | D33 |
| 2-6 | 备份导入 + 导入前快照 | D32 |
| 2-7 | 启动时补结算（**2026-10-27 起改成「冷启动 + 回到前台」两条路**） | **D44** |
| 2-8 | 外观走查（行高跟字号缩放、`reduce_motion` 可点、固定尺寸截断） | **D37** |
| 3-1 | 目标层 | — |
| 3-2 | 周复盘（三个固定问题、跳过不惩罚、周日提醒） | D42 |
| 3-3 | 月复盘（月末最后一个周六、只做「看」） | D42 |
| 3-4 | 周报导出（**文字版 + 图片版**） | **D39 → D43** |
| 4-1 | 主题四套（白 / 夜航 / 苔原 / 晨光） | **D40** |
| 4-2 | 复盘卡（版式 + 图片导出） | **D43** |
| 4-3/4 | 称号（15 个）+ 称号图鉴 | D41 |
| 4-5/6 | 商店（只卖材料）+ 材料合成（3:1 固定） | D41 |
| 4-7 | 今日发现（40 条，种子化） | D41（**D58 起首页不再画这张卡**，代码与文案都在） |
| 5-1 | 月度活动（12 个月，奖励自动发） | D42 |
| 5-2 | 四季叙事（24 段，累计天数解锁） | D42 |
| 5-3 | 单人 Boss（血量 60，无死亡无惩罚） | D42 |
| 5-4 | 关键节点（**部分**：2 个节点，显示在日记页） | D42 / D49 |
| 5-6 | 本地规则引擎（温柔复盘 + 任务拆解） | D42 |
| 6-2 | 落地页（GitHub Pages，可点的火带演示） | **D46** |
| 6-5 | 隐私说明页 | D42 |
| 6-6 | 首次启动引导（三屏） | D42 |
| 6-7 | D1–D7 引导（七张卡 + 锚点，迁移 v12→v13） | **D45** |
| 6-8 | 本地错误日志（不记用户内容） | D42 |
| 6-9 | 数据迁移机制（`user_version`，现到 **v15**） | D31 |

### 没做（按建议顺序）

**① 真机手测 —— 唯一的 P0。** 见 §8。

这一轮新增的三件事**都只在真机上才能验**：
- `react-native-view-shot` 的原生模块是否真的链上了（`expo export` 通过不代表它链上了）；
- 导出卡片的中文有没有截断（验收标准就是这一条）；
- 回到前台补维护 + 提示队列的实际观感（三句话排队说完会不会太长）。

**② 商店截图（阶段 6 第 3 条）** —— 就是截图本身，没有设备就做不了。
落地页现在用一个**可点的演示**代替截图（D46），这比假图诚实，但真实截图仍然缺。

**③ 内容模板化（阶段 5 第 5 条）** —— 5 地点 × 4 情绪 × 5 属性 × 4 季节 × 3 结果。

**没做的原因不是时间**：那套槽位系统是给「探索事件」用的，而探索事件
在当前产品里没有落点（没有「今天遇到什么」的界面）。
手写 40 条文案的额度已经用在「今日发现」上了（`domain/discovery.ts`）。
**要接的话先想清楚探索事件在哪个界面出现**，否则就是编一套没有消费者的系统。

**④ D4 的「最小版本」功能** —— D1–D7 里其余六张都做完了，只有第 4 天那张
原本要求「给我的习惯设一个最小版本」。它需要 `tasks.min_title` 一列 + 一条迁移 +
新建/编辑界面 + 备份白名单，而它服务的需求（状态不好时做少一点）现在可以用
难度与「只记一件」覆盖。所以 D4 只写一句关于难度的事实、**没有按钮**（D45）。
不做一个点了会跳到不存在功能的入口。

**⑤ 图鉴的另两类** —— 称号图鉴已完成；材料与复盘两类没做，
因为材料只有两种（普通/精炼），单独开一页没有信息量（D41）。

**⑥ EAS 实际出包** —— `eas.json` 已配好 preview 档（`buildType: apk`），
但还没真的跑过一次 `eas build`。原因不再是环境坏（`bash` 已修），
而是「等代码稳定到值得打一个版本再打」。出包之后落地页的下载按钮才会亮（D46）。

---

## 5. 已知的、刻意留下的坑

这些不是 bug，是**有记录的取舍**。动它们之前先读对应决策。

| 位置 | 现状 | 为什么 |
| --- | --- | --- |
| `src/db/schema.ts` 的 `theme_id` / `theme_mode` | 死列，没人读写 | D27：主题收成一套白底，但列已发布不能删。主题回来时接上 |
| `player.avatar_seed` / `avatar_data` / `avatar_updated_at` | 死列，`avatar_data` 在 v6→v7 被清空 | D35：头像换成 `avatar_id`（七个像素动物）。**清空用户照片是全 App 唯一一次删用户数据**，不可逆，理由写在迁移注释里 |
| `src/domain/streak.ts` 的 `advanceStreak` / `StreakState` | **已删除**（2026-10-26，D38） | 它的场景已被「现算 + 桥接日」取代。原来留着是因为「宽限券如果走加列那条路会用到」——现在确定了不走那条路 |
| ~~`app/_layout.tsx` 的 TODO（时区变更检测）~~ | **已删**（2026-10-27） | 核实过：业务日完全由 `day_start_hour` + 本地时间算出，时区一变本地时间自然就变；真正要用时区的通知排期那边已经用 `settings.last_time_zone` 自己处理。留着这条 TODO 只会让下一个接手的人去查一个不存在的问题 |
| ~~`src/services/settle.ts` 注释里的「AppState 监听没做」~~ | **已做**（2026-10-27，D44） | 切回前台不补结算是一个**真实的缺口**（隔夜切回来时撤销保护会放行昨天的记录）。现在 `app/_layout.tsx` 有一个 `AppState` 监听，回到 `active` 就跑 `runDailyMaintenance()` |
| `max_per_day > 1` | 未支持，服务层按 0/1 处理 | docs/05 明确不做 |
| reward 任务的撤销 | 返回 `UNSUPPORTED` | 界面不产生这类记录 |
| `advanceStreak` 里的宽限券 | **已删除**，宽限券改在 `services/streak.ts` | 见上面第 3 条与 D38 |
| `streak_bridges` 没有外键到 tasks | 有意 | 桥接的是「这个人这一天」，不是「某个习惯这一天」——与「我的」页的整体连胜同一口径。不加外键也意味着删掉一个习惯不会连带删桥接，于是「累计」永不因删除而变小 |
| ~~宽限券的 message 没人显示~~ | **已接**（2026-10-27，D44） | `services/maintenance.ts` 把结算 / 宽限券 / 月度奖励三句话排成队列，首页订阅后逐条显示（每句 2.5 秒，不互相盖掉）。**队列是进程级的**：App 被杀掉后攒着的句子会丢——那些话本来也是「这一次打开时发生了什么」，丢了不亏 |
| `theme` 不再是模块级常量 | `ThemeProvider` 按 `fontScale` 重新构造一份（D37） | 行高必须跟字号一起缩放，否则 1.5 倍时每一页都裁字。**不要把 `theme` 当作模块级的缓存键**（比如 `Map` 的 key），字号一变它就换新对象 |
| `theme.typography.size` 仍是常数 | 不按字号重算 | `fontSize` 交给 RN 自己缩（这才是「跟随系统字号」）；只有 `lineHeight` 需要我们在代码里补 |
| `＋` `✓` `‹ ›` 三处 `allowFontScaling={false}` | 不跟系统字号缩放 | 它们是**图标**，不是正文；它们坐在固定尺寸的格子里，一缩就溢出。别当成偷懒改回来 |
| `.npmrc` 的 `legacy-peer-deps=true` | **不能删** | D47：npm 会把 `expo-router` 的 optional peer 装到顶层，其中 `react-dom` 会让开发服务器报 `ErrorBoundary of undefined`。这个文件看着像「不想管 peer 冲突的偷懒」，实际是**唯一**挡住那五个包的东西 |
| 没有 `babel.config.js` | 有意（D3：少一层配置卡点） | 但这是一个**真实约束**：任何要求注册 babel 插件的库都不能装。`reanimated` / `worklets` 就是两个例子——它们的插件没注册时不会报「缺插件」，只会让 hook 调度错位（D47）。装新库之前先问一句「它要不要 babel 插件」 |
| `src/domain/backup.ts` 的 `sinceSchemaVersion` | `streak_bridges`(8) / `reviews`(9) / `month_reviews`(10) 用了它 | 让旧备份仍能导入（缺表按空表处理）。**以后再加表也要带上它**，否则用户手里的旧备份会全部失效。加**列**不需要它（列缺失时导入端写 NULL / 默认值），但**必须**同步进 `BACKUP_TABLES`（铁律二）——`guide_start_date` 就是照这条加的 |
| `player.guide_start_date` 可能为 NULL | 老库从 v12 升上来时是 NULL | D45：迁移只改结构、不填日期（填日期是业务判断）。`services/guide.ts` 第一次读时补成「今天」，**不要在界面里自己判断 NULL** |
| 「今天已经展示过第几张引导卡」不存库 | 模块级变量（`components/useGuideCard.ts`） | D45：多一列就多一条迁移 + 一处备份白名单，换来的只是同一天重开 App 不再看到那张卡。**App 被杀掉后重看一次同一张卡是可接受的** |
| 导出卡片的字号不跟系统字号缩放 | `ExportCardView` 全部 `allowFontScaling={false}`，按 540dp 定死 | D43：卡片是**印刷品**，收到图片的人不缩放。与 D37（界面跟随系统字号）不冲突，两者服务的是不同的人。**别当成漏改** |
| `titleMarks.ts` 里的坐标是**搬来的**，不是手绘 | 由 `scripts/fetch-lucide-marks.ts` 从 lucide-static@1.61.0 转换而来，每只带 `source` 字段 | D52：第一版手绘的五只容器被真图推翻三次（锅的圆弧底让矩形水位悬空、抽屉的盖让满档水面留白缝、碗与锅在 26px 下分不清）。**改形状只改 `fetch-lucide-marks.ts` 的图标名，重跑，再粘一次**——手改坐标会让「重新拉取」失效，而且改错一位不会报错 | 换图标要手工粘一次（不引构建期生成，D3 的少配置立场）；`svgpath` 是开发期依赖，不进 App |
| 称号图形有**两种档位表达** | 体魄/秩序画水位，心智/心力/联结画浓度（不透明度 0.55/0.8/1） | D52：水位必须是矩形，而 Lucide 里「底部为平 + 矩形内腔」的容器凑不满五只。硬凑五只会回到手绘那条路 | 同一页里五只图形不是同一种东西（杯子 / 书 / 月亮 / 两个人），靠并排与标签说明它们是同一件事。**别为了整齐把它们改成五个一样的杯子**——那需要重新手绘 |
| 坐标与版权声明**必须在同一个文件里** | `LUCIDE_LICENSE` 在 `titleMarks.ts` 顶部 | D52：Lucide 是 ISC 许可，要求「在副本中保留版权声明与许可声明」。坐标抄进了源码，声明也必须跟着 | 删掉那个常量不是清理，是违反许可 |
| `app/journal/history.tsx` 的 import 层级 | 它在 `app/journal/` 下，比 `app/(tabs)/` 深一层，所以是 `../../src/` | （顺手修的）这一批改动里它一度写成 `../src/`，`tsc` 立刻红了 5 条 | 以后加 `app/<子目录>/x.tsx` 时注意层级 |
| 「打开某一天」**不走路由参数** | 目录页用 `services/journalHandoff.ts` 的队列交班 | D54：tab 页的 params 是持久的，`setParams` 是浅合并、传 `undefined` 删不掉键。点过一次 2024-03-05，以后每次切回日记 tab 都会重开那一天。用 ref 记「已消费」也救不了——同一天点第二次时参数值没变，会被当成旧请求吞掉 | 多一格模块级状态；`router.push('/journal?day=...')` 那种写法**看起来更简单，但会在真机上留下这个坑**，而且 `tsc` 与断言都发现不了 |
| 目录页的游标取**原始页的最后一行** | `getJournalPage` 里用 `pageRows` 而不是 `items` | D54：`items` 过滤掉了空正文的行。一页全是空行（只可能来自手改库）时 `items` 为空、游标变 null，而 `hasMore` 仍是 true——「看更早的」会永远点不动，更早的日记再也翻不出来 | 游标与显示的最后一条**平时是同一天**，不同时只在那一种脏数据下。`journal-status-test` 有一条专门造这个场景 |
| `ThemeId` 仍是**四个值**，但只有**两套色板** | `tundra` / `daybreak` 在 `PALETTE_ALIASES` 里映射到 `furnace` | D59：数据库 CHECK 是 v1 建表 + v2 迁移写死的（D31 不许改），所以类型上四个值仍在。**新写「按 id 取色板」的代码时必须走 `paletteOf` / `PALETTE_ALIASES`**——直接 `PALETTES[id]` 会拿到 undefined 然后白屏 | 每个消费点都要自己有回退 |
| 自然色**不用于文字** | 只给图形（`stroke` / `fill` / `backgroundColor`） | D59：主色的语义只有「可以点」，自然色出现在正文里读者会以为可点。`nature-test` 用 grep 查所有页面 | `color: palette.nature.*` 会被断言拦下 |
| `natureTint` 是**派生值** | `buildPalette` 里 = 自然色向 `surface` 混 92% | D59：只改 `nature` 就够，**不要手改洗色的值**。白底与夜航用同一个浓度（0.92）——试过深底用 0.86，与卡片的对比度到 1.28:1，卡片读成「一块颜色」而不是「一张纸」 | 深底上的差异靠「自然色本身被提亮」拉开，不靠浓度 |
| 待办页（今天）**零彩色** | `app/(tabs)/index.tsx` 里没有 PageTitle / NatureMark / natureTint | D59：用户明确说「待办页面不动」。**改别的页时很容易顺手给首页也加一个图案**，那会破掉这句话 | `nature-test` 有四条断言盯着首页与 TodoCard |
| `assets/*.png` 是**生成物**，不是手绘 | 由 `scripts/make-logo.ts` 从 `src/domain/spark.ts` 的 `SPARK_PATH` 光栅化而来 | D50：同一件事原来画了三遍（图标 Λ / 底栏火苗 / 落地页火苗），改一次要改三处且必然漏一处。**改形状只改 `spark.ts`，然后 `npx tsx scripts/make-logo.ts` 重跑**——手工改 PNG 会在下一次重跑时被覆盖 | 那个脚本依赖本机装了 Chrome 或 Edge（用 `--headless --screenshot` 光栅化，不引 sharp/resvg）；换机器时若两个都没有，改形状就得多装一个浏览器 |
| 底栏「今天」的火苗**没有**跟着换成火花 | 它是**图标**（描边、24 网格、23–28px，与另外三个同一套画法），而记号是**实心图形** | D50：两者职责不同（图标说「这一页叫什么」，记号说「这是谁」）。混用会让底栏四个图标里有一个不是描边的，那是明显的破绽。**别当成漏改** |
| `assets/splash-icon.png` 已生成但**没接进 `app.json`** | 项目里没有 `expo-splash-screen`，`app.json` 也没有它的插件配置 | D50：接启动图 = 多一个原生模块，而它只在冷启动那一两秒可见。等真机手测之后再说（DECISIONS 的「待定」表里有这一条） |
| `site/` 里的演示是另一份实现 | HTML/CSS/JS 重写了一遍火带与打卡逻辑 | D46：真机截图拿不到时，一个能点的演示比一张假图诚实。代价是它可能与 App 漂移，所以 `site-test` 有断言盯着关键行为（不划删除线、只有两个动画、尊重 reduce-motion、第一个模板是「喝一杯水」、配色等于 token） |
| 状态页的属性 LV 是 `points + 1` | 不是人升那种独立属性经验曲线 | D48：人升每条属性有自己的升级门槛（2500 经验一级），Ember 是固定 200 一点。同一点数在两边显示的 LV 不一样高，**这是口径差异不是 bug**。要改成「每维独立曲线」就得加列 + 迁移 + 备份白名单，而 D7 说属性纯展示——不值得 |
| 五维从「我的」页搬到了「状态」页 | `app/(tabs)/me.tsx` 不再画五维与经验条 | D48：用户原话是「把五维删除」，落地成**搬家**。数据、`checkins.attr_key`、15 个称号、猜属性规则一个都没动。**别把「我的」页的五维入口删掉**——那是从「我是谁」走到「我长成什么样」的下一步 |
| `app/(tabs)/goals.tsx` → `app/goals/index.tsx` | 目标是二级页，入口在「我的」页 | D48：路由字符串 `/goals`、`/goals/new`、`/goals/xxx` **全部没变**，所以 `router.replace('/goals')` 之类的调用不需要改。变的是它不再有底栏、需要自己的返回按钮（兜底 `/me`） |
| `journal_entries` 的 `sinceSchemaVersion: 14` | 旧备份里没有这张表 | D49：漏了它，用户手里的 v13 及更早备份会整份被判成 `BAD_TABLE`。`journal-status-test` 里有一条专门验这个 |
| 文件名前缀 `memory` 没改 | `exportImage.tsx` / `exportCard.ts` 里仍是 `'memory'` | D49：它是导出图片的文件名前缀，改成 `'journal'` 会让用户手里的旧图与新图前缀不一致，收益为零。**别当成漏改** |
| 日记一天只能一条 | `local_date` 是主键 | D49：Ember 的「今天」是唯一的（业务日）。一天写好几条会立刻引出「这几条什么关系 / 列表怎么排 / 导出取哪一条」三个问题，而答案都不会比「一天一条、想改就改」更好 |

---

## 6. 决策记录怎么用

**`DECISIONS.md` 是最高优先级的产品/技术约定**，`docs/00-索引与阅读顺序.md` 里有索引表。
现有 D1–D47（D10 已作废）。改动任何被决策钉死的东西之前，先在 `DECISIONS.md` 里追加一条新决策说明为什么改，再改代码。

几条最容易踩的：

- **D21**：连胜从 `checkins` 现算，不加列。撤销会让 `best` / `totalDays` 变小——**这是正确语义，不是 bug**。
- **D29**：视觉语汇 = Microsoft To Do（Fluent）。灰底 `#FAF9F8` + 白卡片 + 圆角 4 + 主色 `#2564CF`。**整行不可点，只有圈可点**；待办完成用删除线，习惯不用（D13 被收窄）。
- **D30**：「每一个任务、每一条数据都要框起来」。全 App 统一用 `components/Card`。说明性文字不框。
- **D31**：见 §2.2 铁律一。
- **D43**：图片导出用 `react-native-view-shot`，卡片渲染到**屏幕外**再拍；版式按 540dp 固定、导出 1080px；卡片字号**不跟系统字号缩放**（那是印刷品）。
- **D44**：日常维护（结算 → 宽限券 → 月度奖励）收在 `services/maintenance.ts`，**冷启动与回到前台都跑**；三句话由它排队给首页。
- **D45**：D1–D7 引导靠 `player.guide_start_date` 定「第几天」，**不用首条打卡推**；「看过第几张」不存库。
- **D46**：落地页在 `site/`，用 Actions 发到 Pages；**不加载任何外部资源**；没有真机截图时用可点的演示代替，不用假图。
- **D47**：`.npmrc` 里的 `legacy-peer-deps=true` **不许删**。它挡的是 `expo-router` 的五个 optional peer（`react-dom` / `reanimated` / `worklets` / `gesture-handler` / `react-native-web`），装进来会让开发服务器报 `ErrorBoundary of undefined`，而所有自动化检查都发现不了。
- **D36**：提醒用**一次性 DATE 触发器预排 7 天**，不用系统的每日重复触发器（后者不知道自己该停）；权限在用户第一次打开某条提醒时才问；通知无声、不弹横幅、不带角标。

---

## 7. 测试怎么做

**这个项目没有测试框架**（刻意不加 jest：`jest-expo` 会给零基础用户新增两套配置卡点）。

测试放在**仓库外**：`C:\Users\16907\AppData\Local\Temp\ember-check\`。
做法是用 esbuild 把 `.ts` 打成 cjs，把原生模块 alias 成 Node 替身：

```bash
ESB="C:/Users/16907/AppData/Local/npm-cache/_npx/beb367dfa21eb3f5/node_modules/.bin/esbuild.cmd"
"$ESB" xxx-test.ts --bundle --platform=node --format=cjs --outfile=xxx-test.js \
  --alias:expo-sqlite=./shim-sqlite.js \
  --alias:expo-file-system=./shim-fs.js \
  --alias:expo-sharing=./shim-sharing.js \
  --alias:expo-notifications=./shim-notifications.js \
  --alias:react-native=./shim-rn.js
EMBER_TMP=$(mktemp -d) node xxx-test.js
```

现成的 **21 个套件**（共 **1163 项**断言，`run-all.sh` 一次跑完）：

| 套件 | 项数 | 覆盖 |
| --- | --- | --- |
| `check` | 18 | 日期、业务日边界、连胜算法 |
| `e2e` | 10 | 打卡 → 撤销全链路 |
| `import-test` | 10 | 导入校验的拒绝路径 |
| `full-import` | 24 | 导出 → 导入 → 回退 → 篡改被拒 |
| `checksum-test` | 7 | sha256 校验和 |
| `stats-test` | 32 | 统计页取数与计算 |
| `reminders-test` | 81 | 时刻换算、排期过滤、上限截断、文案库 |
| `migrate6-test` | 11 | v5→v6 迁移（加列不替用户开提醒） |
| `maintenance-test` | 15 | 日常维护的顺序、提示队列（冷启动攒话 / 在线直达 / 去重）、文案过禁用词表 |
| `exportcard-test` | 30 | 导出卡片的**内容**：事实行、空记录不写 0、quote 去空白、文件名合法化、页脚 |
| `site-test` | 38 | 落地页：不加载外部资源、禁用词、配色等于 token、未出包时不出死链、演示行为、**顶栏与 favicon 的记号必须等于 `SPARK_PATH`**（D50） |
| `guide-test` | 42 | D1–D7：第几天（含跨月/跨年/闰年）、该不该显示、锚点补齐与幂等、迁移 v13、备份往返 |
| `deps-test` | 7 | 挡 `expo-router` 的 optional peer 与 babel 插件依赖（D47） |
| `journal-status-test` | 178 | 日记（D49）：迁移 v14、备份白名单、旧备份放行、纯函数边界（含**按码点截断 emoji**）、读写与清空、**导出→导入往返**；**目录页分页（D54）：三页翻完不重不漏、游标取原始行而不是过滤后的条目、60 天以外的单日读取、交班队列取走即清空**；状态页的读数（`points+1`、`points×200+xp`、**分母 = 本级总需而不是剩余**）；新文案过禁用词表 |
| `nature-test` | 161 | 主题两套（D59）：被删的两套必须落到白、选择页只列两套、自然色的图形对比度 ≥3:1、洗色够淡且不等于 surface、六个图案两两不同、彩虹五条半径递减、八个页面的图案接线、**自然色不许当文字色**、**待办页零改动（4 条）** |
| `shop-test` | 129 | 商店（D53）：迁移 v15 三列 + 幂等、**三个新列在备份白名单里**、商品价格/分组/图形、宽限券上限 5 而其余不限购、合成一次合到底且不会负数、自定义奖励校验与兑换、文案过禁用词表且无电商话术 |
| `titles-test` | 144 | 称号两层（D52）：两层互不干扰、旅程门槛与真实 XP 曲线对得上（**每 5 级会有 7 档要一年以上**，这是改成每 10 级的论据）、**两只容器画水位 / 三只符号画浓度**、水位不越出内腔且贴底、满档留描边余量、五只 outline 两两不同、path 只用绝对命令且不含圆弧、**源码里有 Lucide 版权声明**、20 个名字过禁用词表、界面里不许再写死 `/ 15` |
| `calendar-test` | 50 | 月历（D57）：格子按周对齐、周一起头 / 周日起头、跨年翻月、闰年与十二个月天数、日记也算「动过」、某一天的明细与空日子、摘要截断、**D61 之后 `Palette.banner` 必须不存在** |
| `home-prefs-test` | 80 | 首页偏好（D62）**与日记偏好（D65）**：迁移到 v17、两列都在备份白名单里、`parse*Prefs` 的字段级兜底（坏 JSON / 错类型 / 越界 / 部分坏字段）、`serialize*Prefs` 只写差异、**`todoLimit` 真的改变首页列出几条待办**、**`bodyLimit` 真的截断写进库的内容且不传时行为不变**、历史条数真的改变列出几条 |
| `simplify-test` | 75 | **静态**断言（D63–D65）：左滑的符号与红底方位、判据阈值、我的页去彩（彩虹与洗色必须**不存在**）、资料页只剩一个输入框、保存名字时把原 `bio` 传回去、日记页四个入口已删、三个新设置页与入口、页头提示改成「左滑可以删」 |
| `migrate-old-test` | 21 | **旧库继续升级**（D65 事故的回归测试）：真造一个「`user_version` 已到 16、但缺 `journal_prefs`」的库，再跑 `migrate`，断言列被补上、默认 `'{}'`、`getSettings()` 读得出来；并断言 v15→v16 的 SQL 正文里**不含** `journal_prefs`（防止有人再把它塞回已发布的迁移） |


**新加断言时注意三件事：**
1. 不要拿 `SCHEMA_SQL_V1` 去「造一个旧版本的库」——那个常量会随工作变化，测试会绑在一个移动的目标上（`migrate6-test.ts` 里有正确写法）。
2. 加了新列，一定要加一条**导出→导入往返**断言（见 §2.2 铁律二）。`guide-test` 里有一个可直接抄的例子。
3. 断言里**不要写死会随工作增长的数字**。`e2e` 曾经写死「导出了 5 张表」，
   后来表变成 8 张，它就成了一条假失败——正确写法是与 `BACKUP_TABLES.length` 联动。

---

## 8. 最大的缺口：真机手测

**至今没有在手机上点过一次。** 阶段 1–6 的 settle / 导出 / 导入 / 统计 / 提醒 / 图片导出 /
引导卡 / 回前台补维护——全部只有逻辑层验证。

**这一轮新增的三个点尤其只能在真机上验：**
- `react-native-view-shot` 的原生模块是否真的链上了（`expo export` 通过**不代表**它链上了）；
- 导出卡片的中文有没有截断（这正是阶段 3 的验收标准）；
- 三句话排队显示的实际观感（每句 2.5 秒，会不会太长）。

接手后如果只能做一件事，做这个：

```bash
npx expo start          # 用 Expo Go 扫码
```

要走的路径（docs/05 阶段 1 的验收清单，仍未验证）：
- 清数据打开 → 空状态 + 3 个模板，没有示例任务
- 点「喝一杯水」→ 圆点亮、火带推进、飘出「+26」、我的页数值对得上
- 长按 → 撤销 → **全部回到打卡前**（XP、余烬、五维、连胜）；再点一次，数值与第一次完全一致（验升级余烬对称）
- 建一个「只做一次」的待办 → 勾选 → 长按撤销 → 回到未勾选且 XP 退回
- 杀进程重开数据仍在
- 改设备日期测三条连胜边界（今天有 / 昨天有 / 前天有）；测完改回自动
- 设置 → 提醒：第一次打开某条提醒时**才**弹权限框；通知到达时**无声、不弹横幅**
- 设置 → 备份：导出 → 改点数据 → 导入 → 「回到导入前」
- 系统字体放大到 1.5 倍，把每一页扫一遍看截断

**2026-10-26 新增的（D48 / D49），按重要性排：**

0. **底栏与两个新页**
   - 冷启动 → 底栏是 **今天 / 状态 / 日记 / 我的**，四个字不挤；1.5 倍字号下再看一次
   - 「状态」页：五行的 `LV` 与 `余量 / 200` **与打卡后「我的」页原来的点数对得上**
     （`LV = points + 1`，`余量` 是不满 200 的余数）；顶部人生等级与「我的」页 `Lv.N` 一致
   - 「我的」→「目标」→ 新建 / 挂任务 / 进度 → 返回**回到「我的」**（不是回到状态页）
   - 「日记」页 → 今天写一句 → **杀进程重开，文字还在** → 切 tab 再回来不重复
   - 「日记」页 → 点历史里的一天 → 编辑框换成那一天 → 「回到今天」能回来
   - 复盘页 / 叙事页 / 规则引擎页按返回 → **回到日记 tab**（不是空白/报错）
   - 日记 → 全删再存 → 那一天从历史里消失（等于没写）
   - **「看更早的」（D54）**：
     - 写满 60 天以上后，「写过的日子」右上出现「看更早的」→ 点进去是目录页 → 一直点「看更早的」能翻到最早的一天 → 末尾写「到最早的一天了。」
     - 目录页点任意一天 → **退回日记页**，编辑框换成那一天（不是新开一页日记）
     - 从目录页退回来后，**切到别的 tab 再切回日记**：不应该又跳回那一天（交班队列取走即清空）
     - 同一天**连点两次**（先点 A 回来，再进目录点 A）：两次都应该打开 A
     - 日记页写了半句**不保存** → 进目录点一天 → 期望：**不切走**，只说「先存下正在写的这一句」
     - 一条日记都没有时：历史区整块不出现，**也就没有「看更早的」**

**这一轮新增的，必须补上（按重要性排）：**

1. **图片导出**（`react-native-view-shot` 是原生模块，Expo Go 里不一定有）
   - 周复盘页 →「存成图片」→ 分享面板出来 → 存下来看一眼**中文有没有被切掉**
   - 月复盘页 →「存成图片」同上
   - 日记页 → 任意一张卡 →「存成图片」
   - 如果点了没反应或报「没能生成图片」，先确认用的是 **development build / apk** 而不是 Expo Go
     （Expo Go 只带它自己内置的原生模块）
2. **回前台补维护**（D44）
   - 打开 App → 按 Home 键 → 把系统日期往后拨一天 → 切回 App
   - 期望：首页刷新成新的一天，并且**说出**「昨天空了一天」或「中间空了一阵子」那一句
   - 期望：如果昨天有打卡，撤销保护**不再**放行昨天那条记录
3. **D1–D7 引导卡**（D45）
   - 清数据重装 → 走完三屏 → 今天页底部应出现「第 1 天」那张卡
   - 点「知道了」→ 它消失，且切到别的 tab 再回来**不再出现**
   - 把系统日期往后拨 2 天 → 今天页应出现「第 3 天」那张？不——**第 3 天在目标页**
     （分工：今天页 1/2/4/6/7，目标页 3，我的页 5）。这条最值得真机确认，因为它是静态分工
   - **第 3 天那张要进「我的 → 目标」才看得到**（D48 把目标降为二级页）
   - **第 5 天那张的按钮要跳到「状态」页**（D48），不是「我的」页
   - 拨到第 8 天 → 所有引导卡都不再出现
4. **落地页**（`site/`）
   - `cd site && python -m http.server 8080` → 浏览器打开 → 点圆圈、长按行
   - 手机上打开同一个地址，确认窄屏不错位（已在 420×940 下验过一次）
   - **顶栏那个记号要是火花**（四条不对称的臂），不是旧的火苗或「Λ」；标签页图标是暗蓝方块 + 纸白火花
5. **称号图形**（D52，2026-10-27 新增）
   - 状态页 →「看全部称号」：五维各一张卡，卡里三只容器并排，**水位要能一眼比出高低**（1/3、2/3、满）
   - **未解锁的三只必须是空容器**（不画水），名字是「？」，下面写「再走 X 点」
   - 最下面「旅程」那张卡：五个落点斜向上排，走到第几档亮几个
   - 系统字号调到 1.5 倍：三只容器并排**不能挤成两行**，名字最多两行（「耐久的行者」这种五字名）
   - 「我的」页的称号卡：五只容器并排（26px），下面才是名字那一行
6. **品牌记号**（D50，2026-10-27 新增）
   - 桌面图标 / 最近任务 / 通知栏那枚小图标**都是火花**，且**三处长得一样**
   - 通知栏那枚在**黑底上**还认得出（它是单色图标，系统会染色）
   - 进「设置 → 你的数据在哪儿」：标题右侧一个火花、页脚「火花 + Ember 0.0.1」，
     版本号与桌面图标长按「应用信息」里看到的一致
   - 系统字号调到 1.5 倍再看这一页：标题与火花**不能重叠**，页脚那行不能裁字

---

## 9. 提交状态

分支是 `master`，主分支是 `main`。

**已提交**：`5ec0093 实现阶段 6 剩余条目并换品牌记号：图片导出、引导卡、落地页、状态/日记两页（D43–D50）`。
D43–D50 全部在这一次提交里，包括 D48/D49 的 tab 改造（`status.tsx` / `journal.tsx` / `goals/index.tsx`、
迁移 v13→v14、三处备份白名单）与 D50 的品牌记号（`src/domain/spark.ts`、`SparkMark`、六个 PNG、`scripts/make-logo.ts`）。

**当前未提交的（按发生顺序）：**

1. **文案与注释里残留的「回忆」**（D48/D49 的收尾）。D48/D49 改了底栏与页面名，
   但代码注释、`docs/` 五册、`README.md` 里还散着一批「回忆页 / 回忆卡」的旧说法，
   这一轮统一改成「日记页 / 复盘卡」，并把已过时的断言总数一并校正。纯注释与文档，**零逻辑改动**。
2. **D51 状态页装配搬家 + 四处修正**（`src/domain/status.ts`、`journal-status-test`）。
3. **D52 称号两层 + Lucide 图形**（`titles.ts` / `titleMarks.ts` / `TitleMark` / 图鉴改版）。
4. **D53 商店 v15**（`player` 三列、`shop.ts`、`ShopMark`、`shop-test`）。
5. **D54 「看更早的」目录页**（`app/journal/history.tsx`、`src/services/journalHandoff.ts`、
   `getJournalPage` / `getJournalDay` / `listJournalEntriesBefore`；状态页删掉「看全部称号」入口）。
   这一项改完 `tsc` 0 错误、`expo export` 通过、21 套件 1163 项断言全绿。

> **断言总数现在从代码算，不从文档抄。** `run-all.sh` 的输出把每套件的「N 通过」加起来就是总数
> （2026-10-27 实测 1163）。文档里这一串数字已经错过两次，改套件后**顺手重算一次**。

`@jasperdai__ember.jks` / `.bak.jks` 被 `.gitignore` 排除（`*.jks`），不会被误提交。
`dist/` 与 `.expo/` 也在 .gitignore 里。**`site/` 不在 .gitignore 里**——它是要发布的东西。

`@jasperdai__ember.jks` / `.bak.jks` 被 `.gitignore` 排除（`*.jks`），不会被误提交。
`dist/` 与 `.expo/` 也在 .gitignore 里。**`site/` 不在 .gitignore 里**——它是要发布的东西。

---

## 10. 和用户打交道的注意事项

- 用户**近乎零基础**，靠 AI 写代码。解释要落到「为什么这么做」，不要只报「做了什么」。
- 用户的原话优先级最高。例如「风格要做的和 Microsoft To Do 一模一样」「我最喜欢的就是 MS To Do 的按钮了」「每一个任务都要框起来，每一条数据都要框起来」——这些直接改写了设计方向（D29、D30）。
- 用户会**自己改代码**（`src/domain/avatar.ts` 的七只像素动物就是他写的）。看到不认识的改动，先问，不要当成 bug 去「修」。
- 被权限分类器拦下的命令**不要换一种写法绕过**，直接说明并换一条路。
