# 交接文档

> 写给下一个接手这个仓库的 agent。
> 写于 2026-10-25。**先读这一份，再读 docs/00。**

---

## 0. 三十秒版本

**Ember** 是一个**完全离线、只有 Android、全中文**的游戏化人生管理 App。
没有账号、没有服务器、没有社交、**不申请网络权限**。数据只在这台手机上。

用户是近乎零基础的自学者，靠 AI 写代码。**所有代码注释、所有文档、所有界面文案必须是中文。**

**当前进度**：阶段 0、1、2 **全部完成**；阶段 3 完成 3/4（图片版周报未做）；阶段 4 完成 6/7（回忆卡图片未做）；阶段 5 完成 5/6（内容模板化未做）；阶段 6 完成 6/9（落地页、商店截图、D1–D7 引导未做，均需真机）。
**代码状态**：`tsc` 0 错误、`expo export` 通过、仓库外 193 项断言全绿（最后一次验证在 2026-10-25）。**2026-10-26 的所有改动（D37–D42，包括 12 次迁移）均未跑过 `tsc`，见 §1.1**。
**最大的缺口**：**从头到尾没在真机上点过一次。** 所有验证都是逻辑层 + 打包层。

---

## 1. 接手第一件事

按顺序跑这三条，确认基线是绿的再动手：

```bash
cd C:/Users/16907/Ember
npx tsc --noEmit                              # 期望：无输出
npx expo export --platform android --max-workers 1   # 期望：成功，约 3.2MB .hbc
sh "C:/Users/16907/AppData/Local/Temp/ember-check/run-all.sh"  # 期望：8 个套件全绿
```

第三条是**仓库外**的临时测试（见 §7）。它在 `%TEMP%` 下，不进 git——如果那台机器上已经没有了，§7 写了怎么重建。

### 1.1 如果 `bash` 工具一跑就报 WSL 错（2026-10-26 遇到过）

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

> 写这一节的时候 `bash` 还没修好，所以 **D37（字号缩放）与 D38（连胜修复）那两批改动只做了静态评审，没跑过 `tsc` 与那 8 个套件**。
> 接手后第一件事就是按上面三条跑一遍，重点看：
> - `src/theme/ThemeProvider.tsx`（新引了 `useWindowDimensions`）
> - `src/theme/tokens.ts`（新增 `scaleLineHeights`）
> - `src/domain/streak.ts`（**重写过**：旧的 `StreakState` / `advanceStreak` / `repairStreak` 已删除）
> - `src/services/streak.ts` / `src/db/repo/streak.ts` / `src/components/StreakRepairCard.tsx`（全新）
> - `src/domain/backup.ts` 的 `sinceSchemaVersion` 分支
>
> 纯函数部分已经用独立脚本手算验过 20 余个用例（`summarizeDates` 带桥接、`checkRepairableGap` 的
> 缺口/期限/余额边界、`graceRemaining` 的跨月重置），全部通过。但那不是 `tsc`，也不是真机。

---

## 2. 硬约束（违反任何一条都会造成真实损害）

### 2.1 不许碰的东西

| 约束 | 为什么 |
| --- | --- |
| **不申请网络权限** | `app.json` 的 `android.blockedPermissions` 里删掉了 INTERNET / ACCESS_NETWORK_STATE / 存储 / 悬浮窗。这是产品的第一条承诺。改完必须用 `npx expo config --type introspect` 复核这些权限仍带 `tools:node="remove"` |
| **不许装** Drizzle、Skia、expo-updates、任何同步框架、任何网络请求库 | 用户明确要求；也与「离线、少依赖」一致 |
| **不许删/覆盖** `@jasperdai__ember.jks` 与 `@jasperdai__ember.bak.jks` | 两个 keystore 在仓库根目录（已被 .gitignore 排除）。删错一个，**已经装在手机上的 apk 就再也无法升级** |
| **不许读/探测** 任何含凭据的文件（如 `~/.expo/state.json`） | 已被安全分类器判定为凭据探测。被拦下的命令**不要绕过**，换一条路或直接问用户 |

### 2.2 数据层的两条铁律

**铁律一：已发布的迁移与建表常量都不许改**（D31）。

`src/db/schema.ts` 里的 `SCHEMA_SQL_V1`、各 `MIGRATE_V*_TO_V*_SQL`、以及 `src/db/migrate.ts` 里已经写进数组的迁移函数，**一个字都不能改**。加列只能**新写一条**迁移常量并在 `MIGRATIONS` 数组末尾追加，同时把 `CURRENT_SCHEMA_VERSION` +1（**现在是 7**）。

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
  _layout.tsx                 根布局：bootstrap（开库→迁移→种子→结算→宽限券→月度奖励→读设置）
  onboarding.tsx              首次启动引导（三屏，默认选中「喝一杯水」）
  (tabs)/index.tsx            今天：火带 + 习惯行 + 待办卡 + 微行动 + 今日发现
  (tabs)/goals.tsx            目标列表（进行中 / 已完成分组）
  (tabs)/memories.tsx         回忆：周复盘 + 月复盘 + 关键节点 + 叙事入口
  (tabs)/me.tsx               我的：头像、等级、经验、余烬、连胜、称号、五维、商店/统计入口
  goals/new.tsx               新建目标
  goals/[id].tsx              目标详情：改标题/为什么/截止日、挂任务、手动完成
  profile/edit.tsx            人物资料：名字 + 一句自我介绍
  review/index.tsx            周复盘（三个固定问题 + 导出周报）
  review/month.tsx            月复盘（看数字 + 一句可写的）
  titles.tsx                  称号图鉴（未解锁显示「？」+ 还差多少）
  shop.tsx                    商店 + 材料合成
  narrative.tsx               叙事：四季故事 + Boss + 月度主题
  rule-engine.tsx             温柔复盘 + 任务拆解（本地模板）
  privacy.tsx                 你的数据在哪儿
  settings/index.tsx          设置（分组：资料 / 外观 / 节奏 / 数据）
  settings/theme.tsx          主题选择（四套预览卡）
  settings/backup.tsx         备份：导出、导入、回到导入前、日志
  settings/reminders.tsx      提醒：每个任务一个时刻
  stats.tsx                   统计：近 30 天
  tasks/new.tsx               新建任务（必填只有名字）

src/db/
  schema.ts                   ★ 建表 SQL + 全部迁移常量（铁律一）。现到 v12
  migrate.ts                  ★ 手写迁移器（PRAGMA user_version），CURRENT_SCHEMA_VERSION = 12
  client.ts                   单例连接、PRAGMA、runInTransaction
  seed.ts                     首次启动：player 1 行 + settings 1 行
  repo/{player,settings,tasks,checkins,goals,streak,reviews}.ts   单表读写

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
  weekReport.ts               周报导出（文字版；图片版待 view-shot）
  shop.ts                     购买 / 合成（事务）
  narrative.ts                叙事取数 + 月度奖励发放 + 关键节点
  errorLog.ts                 ★ 本地错误日志（同步、绝不抛错、不记用户内容）
  logExport.ts                日志导出（异步）
  backup.ts / backup-import.ts  导出 / 导入 + 导入前快照
  reminders.ts                ★ 唯一碰通知 API 的地方（任务提醒 + 周复盘提醒）

src/components/               Card（全 App 唯一的「框」）、TodoCard、TodoCheckbox、
                              TaskRow、HearthBar、AwardFloat、AddButton、QuickStart、
                              StatBarList、SettingsRow、PlayerAvatar、AvatarPickerSheet、
                              DueDateField、TabBarIcon、StageNote、EmberMeter、StreakRepairCard

src/theme/tokens.ts           ★ 全项目唯一允许出现十六进制色值的地方（四套色板）
src/theme/ThemeProvider.tsx   theme + themeId + reduceMotion + 行高按字号重算
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
| 2-4 | 打卡反馈升级（飘字 + 里程碑 3/7/30/100） | D34 |
| 2-5 | 统计页（横条，不报完成率） | D33 |
| 2-6 | 备份导入 + 导入前快照 | D32 |
| 2-7 | 启动时补结算 | — |
| 2-8 | 外观走查（行高跟字号缩放、`reduce_motion` 可点、固定尺寸截断） | **D37** |
| 2-3 | 连胜修复 + 宽限券（`streak_bridges` 表） | **D38** |
| 3-1 | 目标层 | — |
| 3-2 | 周复盘（三个固定问题、跳过不惩罚、周日提醒） | D42 |
| 3-3 | 月复盘（月末最后一个周六、只做「看」） | D42 |
| 3-4 | 周报导出（**文字版**，图片版未做） | **D39** |
| 4-1 | 主题四套（白 / 夜航 / 苔原 / 晨光） | **D40** |
| 4-3/4 | 称号（15 个）+ 称号图鉴 | D41 |
| 4-5/6 | 商店（只卖材料）+ 材料合成（3:1 固定） | D41 |
| 4-7 | 今日发现（40 条，种子化） | D41 |
| 5-1 | 月度活动（12 个月，奖励自动发） | D42 |
| 5-2 | 四季叙事（24 段，累计天数解锁） | D42 |
| 5-3 | 单人 Boss（血量 60，无死亡无惩罚） | D42 |
| 5-4 | 回忆系统（关键节点，**部分**：2 个节点） | D42 |
| 5-6 | 本地规则引擎（温柔复盘 + 任务拆解） | D42 |
| 6-5 | 隐私说明页 | D42 |
| 6-6 | 首次启动引导（三屏） | D42 |
| 6-8 | 本地错误日志（不记用户内容） | D42 |
| 6-9 | 数据迁移机制（`user_version`，现到 **v12**） | D31 |

### 没做（按建议顺序）

**① 图片导出（周报 + 回忆卡）** —— 两处都被同一个障碍挡住（D39）。

```bash
npx expo install react-native-view-shot
```

装上之后只需改两个地方：
- `src/services/weekReport.ts` 的 `exportWeekReportAsImage()`（形状已定好，注释里写了四步）；
- 回忆卡版式（目前回忆页列的是周复盘与月复盘的文字，没有卡片版式）。

**关键：验收标准里的「中文不截断」** —— 给它一个固定的 1080 宽布局，不要用屏幕宽。

**② 内容模板化（阶段 5 第 5 条）** —— 5 地点 × 4 情绪 × 5 属性 × 4 季节 × 3 结果。

**没做的原因不是时间**：那套槽位系统是给「探索事件」用的，而探索事件
在当前产品里没有落点（没有「今天遇到什么」的界面）。
手写 40 条文案的额度已经用在「今日发现」上了（`domain/discovery.ts`）。
**要接的话先想清楚探索事件在哪个界面出现**，否则就是编一套没有消费者的系统。

**③ D1–D7 引导脚本（阶段 6 第 7 条）** —— 需要一套「第几天显示哪张卡」的状态。

当前没有存「用户第一次打开是哪天」的列。可以推（第一条 checkin 的日期），
但这一版没做。它是一个**真机才能调**的东西（卡片出现的时机、不遮挡内容、不重复）。

**④ 落地页 + 商店截图（阶段 6 第 2、3 条）** —— **没有设备就做不了**。

落地页需要真实截图，商店截图就是截图本身。

**⑤ 真机手测** —— 见 §8。这是唯一的 P0。

**④ 阶段 4（7 条全未开始）**：主题做回来（D27 挪到了这一阶段：`ThemeId` 加取值 → 一条扩 CHECK 的迁移 → `buildPalette` → 恢复 `ThemeProvider` 的 themeId 与选择页）、回忆卡、称号、图鉴、商店、材料合成、今日发现。

**⑤ 阶段 5（6 条全未开始）**：月度小活动、四季叙事、单人 Boss、回忆系统、内容模板化（先 40 条）、本地规则引擎。

**⑥ 阶段 6（部分）**：EAS 已配（`eas.json` preview 档出 apk）、图标/启动图已有；落地页、商店截图、隐私政策页、首次启动引导（90 秒拿到第一个奖励）、D1–D7 引导脚本、本地错误日志导出，仍未做。

**⑦ 真机手测**——这件事一件都没做过，见 §8。

---

## 5. 已知的、刻意留下的坑

这些不是 bug，是**有记录的取舍**。动它们之前先读对应决策。

| 位置 | 现状 | 为什么 |
| --- | --- | --- |
| `src/db/schema.ts` 的 `theme_id` / `theme_mode` | 死列，没人读写 | D27：主题收成一套白底，但列已发布不能删。主题回来时接上 |
| `player.avatar_seed` / `avatar_data` / `avatar_updated_at` | 死列，`avatar_data` 在 v6→v7 被清空 | D35：头像换成 `avatar_id`（七个像素动物）。**清空用户照片是全 App 唯一一次删用户数据**，不可逆，理由写在迁移注释里 |
| `src/domain/streak.ts` 的 `advanceStreak` / `StreakState` | **已删除**（2026-10-26，D38） | 它的场景已被「现算 + 桥接日」取代。原来留着是因为「宽限券如果走加列那条路会用到」——现在确定了不走那条路 |
| `app/_layout.tsx` 的 TODO（时区变更检测） | 未做 | 通知排期那边已经用 `settings.last_time_zone` 处理了（`maintainRemindersOnLaunch`），这个 TODO 是上一版的残留 |
| `src/services/settle.ts` 注释里的「AppState 监听没做」 | 仍然没做 | 只有提醒页自己监听了 AppState。**切回前台不补结算**是一个真实的缺口 |
| `max_per_day > 1` | 未支持，服务层按 0/1 处理 | docs/05 明确不做 |
| reward 任务的撤销 | 返回 `UNSUPPORTED` | 界面不产生这类记录 |
| `advanceStreak` 里的宽限券 | **已删除**，宽限券改在 `services/streak.ts` | 见上面第 3 条与 D38 |
| `streak_bridges` 没有外键到 tasks | 有意 | 桥接的是「这个人这一天」，不是「某个习惯这一天」——与「我的」页的整体连胜同一口径。不加外键也意味着删掉一个习惯不会连带删桥接，于是「累计」永不因删除而变小 |
| 宽限券的 message 没人显示 | `applyGraceIfNeeded()` 返回了话，但根布局没界面 | 待接到首页（与 `settleUpTo()` 的 message 同一个待办） |
| `theme` 不再是模块级常量 | `ThemeProvider` 按 `fontScale` 重新构造一份（D37） | 行高必须跟字号一起缩放，否则 1.5 倍时每一页都裁字。**不要把 `theme` 当作模块级的缓存键**（比如 `Map` 的 key），字号一变它就换新对象 |
| `theme.typography.size` 仍是常数 | 不按字号重算 | `fontSize` 交给 RN 自己缩（这才是「跟随系统字号」）；只有 `lineHeight` 需要我们在代码里补 |
| `＋` `✓` `‹ ›` 三处 `allowFontScaling={false}` | 不跟系统字号缩放 | 它们是**图标**，不是正文；它们坐在固定尺寸的格子里，一缩就溢出。别当成偷懒改回来 |
| `src/domain/backup.ts` 的 `sinceSchemaVersion` | 只有 `streak_bridges` 用了它 | 让 v8 之前的旧备份仍能导入（缺表按空表处理）。**以后再加表也要带上它**，否则用户手里的旧备份会全部失效 |

---

## 6. 决策记录怎么用

**`DECISIONS.md` 是最高优先级的产品/技术约定**，`docs/00-索引与阅读顺序.md` 里有索引表。
现有 D1–D36（D10 已作废）。改动任何被决策钉死的东西之前，先在 `DECISIONS.md` 里追加一条新决策说明为什么改，再改代码。

几条最容易踩的：

- **D21**：连胜从 `checkins` 现算，不加列。撤销会让 `best` / `totalDays` 变小——**这是正确语义，不是 bug**。
- **D29**：视觉语汇 = Microsoft To Do（Fluent）。灰底 `#FAF9F8` + 白卡片 + 圆角 4 + 主色 `#2564CF`。**整行不可点，只有圈可点**；待办完成用删除线，习惯不用（D13 被收窄）。
- **D30**：「每一个任务、每一条数据都要框起来」。全 App 统一用 `components/Card`。说明性文字不框。
- **D31**：见 §2.2 铁律一。
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

现成的 8 个套件（共 193 项断言，`run-all.sh` 一次跑完）：

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

**新加断言时注意两件事：**
1. 不要拿 `SCHEMA_SQL_V1` 去「造一个旧版本的库」——那个常量会随工作变化，测试会绑在一个移动的目标上（`migrate6-test.ts` 里有正确写法）。
2. 加了新列，一定要加一条**导出→导入往返**断言（见 §2.2 铁律二）。

---

## 8. 最大的缺口：真机手测

**至今没有在手机上点过一次。** 阶段 1、阶段 2 的 settle / 导出 / 导入 / 统计 / 提醒、To Do 改版、通知页——全部只有逻辑层验证。

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

---

## 9. 提交状态

**63 个文件未提交**，用户没有要求 commit。分支是 `master`，主分支是 `main`。
`@jasperdai__ember.jks` / `.bak.jks` 被 `.gitignore` 排除（`*.jks`），不会被误提交。
`dist/` 与 `.expo/` 也在 .gitignore 里。

---

## 10. 和用户打交道的注意事项

- 用户**近乎零基础**，靠 AI 写代码。解释要落到「为什么这么做」，不要只报「做了什么」。
- 用户的原话优先级最高。例如「风格要做的和 Microsoft To Do 一模一样」「我最喜欢的就是 MS To Do 的按钮了」「每一个任务都要框起来，每一条数据都要框起来」——这些直接改写了设计方向（D29、D30）。
- 用户会**自己改代码**（`src/domain/avatar.ts` 的七只像素动物就是他写的）。看到不认识的改动，先问，不要当成 bug 去「修」。
- 被权限分类器拦下的命令**不要换一种写法绕过**，直接说明并换一条路。
