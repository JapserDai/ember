import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * 底部导航的四个图标。
 *
 * 为什么手绘 SVG 而不是装一个图标库（react-native-vector-icons / lucide）：
 *   1. 体积：图标库为了四个图标要带上整套字体的映射表；
 *   2. 一致性：通用图标库是「几何工业风」——精确的圆角、统一的 2px 描边、
 *      每个图标占满整个画框。这个 App 的视觉是墨与纸（D11、D20 的人像），
 *      混进一套标准图标，底栏会像从别的 App 里贴过来的；
 *   3. 语义：通用图标里「目标」是靶心、「回忆」是时钟。靶心是「你正在被打分」，
 *      和「不评判」的底线直接冲突（D12 就是因为这个否掉了进度环）。
 *      这里改成旗，「到这面旗子为止」是方向，不是分数。
 *
 * 为什么不再用一个汉字当图标（之前的做法）：
 *   汉字当图标的问题是它和下方的标签是**同一种东西**——「今」压着「今天」，
 *   一列里两行中文，读起来是重复，而不是「图形 + 名字」。
 *   而且 19px 的汉字在 11px 的标签上方，字重接近，视觉上分不出哪层是图标。
 *
 * 画法上的约定（四个图标共用一个网格，换掉任何一个都要守住这几条）：
 *   - viewBox 24×24，所有关键点落在整数或半整数上；
 *   - 只描边、不填充：这个 App 里所有图形都是「一笔一笔画出来的」，
 *     与像素头像（PlayerAvatar 的 16×16 方块）分工明确——一个是线，一个是块；
 *   - 圆头圆角（round cap / join），线看起来像笔尖画的，不是矢量软件画的；
 *   - 线宽 1.45（未选中）/ 1.95（选中）。**选中态不换颜色也能分辨**——
 *     色盲用户不该只能靠主色深浅来判断自己在哪一页（docs/02 §10）；
 *   - **path 只用绝对命令（M / L / C / Q / Z）**，不用相对命令（c / s / h / v）。
 *     理由：路径要能在没有 React 的环境里被打成点阵来验形
 *     （scripts/preview-tab-icons.ts 那套工具），相对命令会让验证多一层心智负担，
 *     而绝对坐标在人读代码时也更容易对上手画时的网格。
 */

/** 图标名。与 TABS 的行一一对应，改名要两边一起改 */
export type TabIconName = 'today' | 'goals' | 'memories' | 'me';

/** 画布边长。所有坐标都是这个网格里的数 */
export const TAB_ICON_BOX = 24;

/** 未选中的线宽 */
const STROKE_IDLE = 1.45;
/** 选中的线宽。与 STROKE_IDLE 差 0.5，在 23px 上是 0.48px，肉眼刚好能分出「重了一档」 */
const STROKE_ACTIVE = 1.95;

export interface TabBarIconProps {
  name: TabIconName;
  /** 线的颜色。由底栏的 active / inactive tint 传进来，图标自己不管明暗 */
  color: string;
  /** 边长（像素）。默认 23 */
  size?: number;
  /** 选中态。只影响线宽，颜色由调用方给 */
  focused?: boolean;
}

export function TabBarIcon({ name, color, size = 23, focused = false }: TabBarIconProps) {
  const strokeWidth = focused ? STROKE_ACTIVE : STROKE_IDLE;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${TAB_ICON_BOX} ${TAB_ICON_BOX}`}
      // 图标是装饰：底栏的每个 tab 都自带标签，读屏读标签就够了，
      // 这里再读一遍「今天」会让每个 tab 被念两遍
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {renderShape(name)}
    </Svg>
  );
}

/** 四种形状。拆出来是为了让上面的 Svg 只写一次属性 */
function renderShape(name: TabIconName) {
  switch (name) {
    /**
     * 今天 —— 一簇火苗。
     *
     * 这一页是「今天要做的那几件小事」，而整个 App 的隐喻就是炉子。
     * 火苗是四个图标里唯一直接指向产品本体的一个，所以给它最中央的位置。
     * 内弯的一笔是火舌：只有轮廓的话，水滴和火苗在 23px 下分不出来。
     */
    case 'today':
      return (
        <>
          <Path
            d={
              'M12 3.5' +
              'C9.1 7.4 7 10 7 13.1' +
              'C7 16.4 9.2 18.5 12 18.5' +
              'C14.8 18.5 17 16.4 17 13.1' +
              'C17 10 14.9 7.4 12 3.5Z'
            }
          />
          <Path
            d={
              'M12 9.6' +
              'C12.8 11 13.7 11.9 13.7 13.6' +
              'C13.7 15 13 15.9 12.1 16'
            }
          />
        </>
      );

    /**
     * 目标 —— 一面插在地上的旗。
     *
     * 不用靶心：靶心是「你正在被打分」的语言，与「不评判」的底线冲突
     * （和 D12 否掉进度环是同一个理由）。
     * 旗子的语义是「到这面旗为止」，有方向、没有分数。
     */
    case 'goals':
      return (
        <>
          <Path d="M7.3 4.2L7.3 19.5" />
          <Path
            d={
              'M7.3 4.6' +
              'C9.3 3.3 11.1 5.6 13.5 4.6' +
              'C14.6 4.15 15.5 4.05 16.3 4.35' +
              'L16.3 11.1' +
              'C15.5 10.8 14.6 10.9 13.5 11.35' +
              'C11.1 12.35 9.3 10.05 7.3 11.35Z'
            }
          />
          <Path d="M4.9 19.5L9.7 19.5" />
        </>
      );

    /**
     * 回忆 —— 两张叠放的卡片。
     *
     * 这一页本身就是「卡片式时间线」（docs/02 §4.3），所以直接画卡片。
     * 不用时钟：时钟是圆的，而这一页里「时间」是排在卡片上的属性，
     * 不是页面的主角；一个圆形的时钟图标会让它看起来像「设置里的计时器」。
     */
    case 'memories':
      return (
        <>
          <Rect x={4.7} y={4.5} width={10.1} height={12.4} rx={2} />
          <Rect x={9.2} y={7.1} width={10.1} height={12.4} rx={2} />
        </>
      );

    /**
     * 我的 —— 一个人。
     *
     * 不用齿轮、不用「设置」类的通用图标：设置是单独一页，不在这里。
     * 这个形状（圆头 + 肩线）是一个人形的剪影，与头像（一只动物）分工清楚：
     * 图标说「这是关于你的页」，头像说「你挑的是哪一只」。
     */
    case 'me':
      return (
        <>
          <Circle cx={12} cy={8.3} r={3.5} />
          <Path
            d={
              'M4.9 20.2' +
              'C4.9 16.3 8.1 14.4 12 14.4' +
              'C15.9 14.4 19.1 16.3 19.1 20.2'
            }
          />
        </>
      );
  }
}
