# 落地页（GitHub Pages）

这个目录就是**线上站点本身**，不是它的源文件。改完推 `main`，Pages 会重建。

## 一、第一次上线

仓库里已经有一个工作流：`.github/workflows/pages.yml`。
只需要在 **Settings → Pages → Source** 里选 **`GitHub Actions`**，
然后推一次 `main`（或在 Actions 页面手动跑一次）即可。

> **为什么不用「Deploy from a branch」**
>
> 那种方式只能从仓库根目录或 `/docs` 发布，**选不了 `/site`**。
> 而 `docs/` 在这个仓库里已经有主了——那是六册产品文档
> （`docs/00-索引与阅读顺序.md` 等），也是仓库的阅读起点。
> 把落地页塞进去会让「文档」和「线上站点」变成同一个目录。
> 所以用一个 20 行的工作流把 `site/` 原样上传。

## 二、改站点配置

**只改 `index.html` 顶部那一个 `<script>` 块**：

```js
window.EMBER_SITE = {
  repo: 'https://github.com/你的用户名/ember',
  apkVersion: null,      // 出包之后填 '0.1.0'
  apkSize: null,         // 可选，例如 '18 MB'
  minAndroid: '8.0',
};
```

- `repo` 还是 `CHANGE-ME` 时，「看源码」「历史版本」会变成不可点的灰色文字，
  而不是指向一个 404。
- `apkVersion` 为 `null` 时，下载按钮显示「还没有可下载的版本」并且点不动。
  **不要**为了好看把它填成一个还不存在的版本——那就是一个死链。

## 三、出包之后要做的三件事

1. `apkVersion` 填上真实版本号。
2. 在 GitHub **Releases** 里打 tag `v0.1.0`，把 apk 命名为 `ember-0.1.0.apk` 上传。
   页面里的下载地址是按这个规则拼的（`...}` 是占位符，会被替换成实际值）：

   ```
   {repo}/releases/download/vapkVersion}/ember-apkVersion}.apk
   ```

3. 真机截图放进 `site/img/`，然后在 `index.html` 的「它不做什么」后面加一节。
   截图必须是真机的，不要用模拟器或渲染图——这个产品的第一条承诺是
   「离线、只在这台手机上」，用假图会毁掉这句话。

## 四、这个页面的三条约束

1. **不加载任何外部资源。** 没有字体 CDN、没有统计脚本、没有追踪像素、没有图标库。
   与 App 的「不联网」是同一条立场。加一个 `<script src="https://...">` 就是在拆自己的台。
2. **配色只从 App 里取**（`src/theme/tokens.ts` 里「白」那一套）：
   `#FAF9F8` 底 / `#FFFFFF` 面板 / `#323130` 正文 / `#2564CF` 主色 / `#1B4A94` 火带。
   改这里之前先改 App，否则访客看到的蓝和装完看到的蓝不是同一个。
3. **文案要过禁用词表**，与 App 同一份（`src/domain/text-rules.ts`）。

## 五、本地预览

```bash
cd site
python -m http.server 8080
# 打开 http://localhost:8080
```

没有构建步骤，改完刷新就生效。

## 六、上线前自查

```bash
# 1. 文案过禁用词表（期望：无输出）
grep -nE "失败|惩罚|归零|前功尽弃|必须|应该|不准偷懒|太可惜|差一点|你让|失望|受伤|饿死|排行榜|别人已经" site/index.html site/app.js site/style.css

# 2. 找出页面上所有的外部地址，逐条确认它不是「页面自己去加载的东西」
grep -n "http" site/index.html site/app.js site/style.css
```

第 2 条现在的输出应该是两处，两处都成立：

- `window.EMBER_SITE.repo` 的 `https://github.com/CHANGE-ME/ember` ——
  一个**仓库链接**（用户点了才出去），不是页面加载的资源；
- favicon 那一行的 `http://www.w3.org/2000/svg` —— 那是 SVG 的 **XML 命名空间字符串**，
  不是网络请求，浏览器不会去访问它。
