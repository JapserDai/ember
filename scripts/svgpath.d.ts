/**
 * `svgpath` 没有自带类型（`@types/svgpath` 在 npm 上不存在）。
 *
 * 这个声明只覆盖 `scripts/fetch-lucide-marks.ts` 用到的那几个方法，
 * 而且是**开发期脚本**用的——`svgpath` 不进 App，所以这个文件不参与打包。
 *
 * 为什么不用 `// @ts-expect-error`：那样每加一个方法都要改一行，
 * 而这里的声明本身就是「我们只用这三个方法」的一句说明。
 */
declare module 'svgpath' {
  interface SvgPath {
    /** 把圆弧（A/a）展开成三次贝塞尔（C/c），形状不变 */
    unarc(): SvgPath;
    /** 把 S / T 展开成完整的 C / Q */
    unshort(): SvgPath;
    /** 把所有相对命令转成绝对坐标 */
    abs(): SvgPath;
    toString(): string;
  }
  function svgpath(path: string): SvgPath;
  export default svgpath;
}
