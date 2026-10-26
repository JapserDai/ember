import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';
import {
  ATTRIBUTE_MARKS,
  JOURNEY_MARK,
  TITLE_MARK_BOX,
  TITLE_MARK_STROKE,
  glyphStrength,
  journeyLit,
  vesselFill,
  type AttributeMarkKey,
} from '../domain/titleMarks';

/**
 * 一个称号的图形（D52）。
 *
 * 两种形状，对应称号的两层（见 `domain/titles.ts` 文件头）：
 *   - 属性称号：五维各一个符号（`domain/titleMarks.ts`，坐标搬自 Lucide）。
 *     其中**体魄（量杯）与秩序（档案盒）是真容器**，第几档靠**水位**表达；
 *     心智（书）/ 心力（月亮）/ 联结（两个人）没有能装水的内腔，
 *     第几档靠**不透明度**表达。
 *   - 旅程称号：一条斜向上的路 + 五个落点。亮到第几个 = 走到第几档。
 *
 * ---- 为什么有两种档位表达 ----
 *
 * 这是 D52 明确记下的取舍：**统一用「水位」更整齐，但 Lucide 里
 * 底部为平、又能装水的容器形状不够五只**。硬凑五只就会回到手绘那条路——
 * 而手绘那版正是被真图推翻的（锅的圆底让水位悬空）。
 *
 * 所以：能装水的两只画水，装不了的三只画「浓度」。
 * 两者在 28px 下都读得出「这是第几档」，而且它们本来就该看起来不同——
 * 「你把时间花在哪儿」这件事，本来就不是五个一模一样的杯子。
 *
 * ---- 未解锁的怎么画 ----
 *
 * 已解锁：轮廓用正文色，水位是主色实心。
 * 未解锁：轮廓用次要色、整体 0.35 不透明度，水位**不画**。
 *
 * 为什么不把未解锁的整只藏起来：藏起来的话，这一维还有几档就看不出。
 * 一只淡轮廓说的是「这里还有位置」，而不是「你没有这个东西」——
 * 这是这个 App 所有空状态的同一条语气（docs/02 §2.4）。
 *
 * ---- 无障碍 ----
 *
 * 图形是**装饰**：它旁边永远有称号名与「再走 X 点」那句话，读屏再念一遍
 * 形状是噪音。所以默认 `accessibilityElementsHidden`。
 */
export interface TitleMarkProps {
  /** 属性称号传哪一维；旅程称号传 'journey' */
  mark: AttributeMarkKey | 'journey';
  /** 第几档。属性称号 1–3，旅程称号 1–5 */
  tier: number;
  /** 已解锁。未解锁只画淡轮廓（不画水位 / 不加浓度） */
  unlocked: boolean;
  /** 边长（正方形）。默认 28 */
  size?: number;
  /** 描边颜色。不传时按 unlocked 取正文色 / 次要色（主题 token） */
  strokeColor?: string;
  /** 水位颜色。不传时取主题主色 */
  fillColor?: string;
  /** 需要读屏念出来时给一个名字 */
  label?: string;
}

export function TitleMark({
  mark,
  tier,
  unlocked,
  size = 28,
  strokeColor,
  fillColor,
  label,
}: TitleMarkProps) {
  const { palette } = useTheme();
  const decorative = label === undefined;
  // 颜色一律读 token：这个文件里出现十六进制字面值就是 bug（HANDOFF §3）
  const stroke = strokeColor ?? (unlocked ? palette.text : palette.secondary);
  const fill = fillColor ?? palette.primary;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${TITLE_MARK_BOX} ${TITLE_MARK_BOX}`}
      fill="none"
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={label}
    >
      {mark === 'journey' ? (
        <JourneyShape tier={tier} unlocked={unlocked} stroke={stroke} fill={fill} />
      ) : (
        <AttributeShape
          mark={mark}
          tier={tier}
          unlocked={unlocked}
          stroke={stroke}
          fill={fill}
        />
      )}
    </Svg>
  );
}

/** 属性称号：容器画水位，符号按浓度；轮廓共用一条 path */
function AttributeShape({
  mark,
  tier,
  unlocked,
  stroke,
  fill,
}: {
  mark: AttributeMarkKey;
  tier: number;
  unlocked: boolean;
  stroke: string;
  fill: string;
}) {
  const spec = ATTRIBUTE_MARKS[mark];

  // 容器：先填水位（填充在轮廓之前画，让线压在填充边缘上）
  const water =
    spec.kind === 'vessel' && unlocked
      ? (() => {
          const w = vesselFill(spec.cavity, tier);
          return <Rect x={w.x} y={w.y} width={w.width} height={w.height} fill={fill} />;
        })()
      : null;

  /*
   * 符号的浓度：已解锁时按档位给 0.55 / 0.8 / 1；
   * 未解锁时统一 0.35（淡轮廓，表示「这里还有位置」）。
   *
   * 容器不参与浓度（它的档位已经由水位说清了，再叠一层会让人以为
   * 「水越满线越黑」，那是两件事）。
   */
  const opacity =
    spec.kind === 'vessel' ? (unlocked ? 1 : 0.35) : unlocked ? glyphStrength(tier) : 0.35;

  return (
    <>
      {water}
      <Path
        d={spec.outline}
        stroke={stroke}
        strokeWidth={TITLE_MARK_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />
    </>
  );
}

/** 旅程称号：一条淡的路 + 五个点（走过的实心，没到的空心） */
function JourneyShape({
  tier,
  unlocked,
  stroke,
  fill,
}: {
  tier: number;
  unlocked: boolean;
  stroke: string;
  fill: string;
}) {
  /*
   * 未解锁时一个点都不亮，连「走过几个」也不显示。
   *
   * 为什么：旅程称号的门槛是「等级」，而等级是这一页唯一一个
   * 从别处（状态页顶部）已经完整读过一遍的数。在这一格上再画一次
   * 「你走到第几个点」就是重复，而且会让 5 个未解锁的称号各自画出一条
   * 看起来像进度条的东西——那正是这一页要避免的。
   */
  const lit = unlocked ? journeyLit(tier) : 0;

  return (
    <>
      <Path
        d={JOURNEY_MARK.outline}
        stroke={stroke}
        strokeWidth={TITLE_MARK_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.35}
      />
      {JOURNEY_MARK.dots.map(([cx, cy], i) =>
        i < lit ? (
          <Circle key={i} cx={cx} cy={cy} r={JOURNEY_MARK.dotRadius} fill={fill} />
        ) : (
          <Circle
            key={i}
            cx={cx}
            cy={cy}
            r={JOURNEY_MARK.dotRadius}
            fill="none"
            stroke={stroke}
            strokeWidth={1.2}
          />
        )
      )}
    </>
  );
}
