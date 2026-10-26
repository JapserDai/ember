import React from 'react';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';
import {
  NATURE_MARK_BOX,
  NATURE_MARK_STROKE,
  NATURE_MARKS,
  RAINBOW_STROKES,
  type NatureMarkKey,
} from '../domain/natureMarks';

/**
 * 自然图案（D59）。
 *
 * ---- 它是装饰，但不是纯装饰 ----
 *
 * 每个页面一个图形，且**那个图形说的是这一页的事**：
 *
 *   status   sprout  芽     「你走到哪了」= 一株长到哪儿的东西
 *   journal  sun     太阳   「写下来的那一天」= 有光的那一天
 *   me       rainbow 彩虹   「你是谁」= 一条光谱，不是一种颜色
 *   shop     flower  花     「买东西」= 浇水
 *   titles   globe   地球   「走了多远」= 绕了多远
 *   stats    rain    云雨   「记录」= 天气，有晴有雨
 *   review   leaf    叶     「回头看」= 看叶脉
 *   narrative 随季节变      四季本身就是自然
 *
 * ---- 为什么每页只有一处，且都在标题旁 ----
 *
 * 撒在每张卡上是模板感（`frontend-design` 里说的「每个 section 都 fade-and-slide」
 * 的等价物）。一处、且紧挨着标题，读者会把它读成「这一页的标记」，
 * 而不是「这张卡的花边」。
 *
 * ---- 颜色只读 token ----
 *
 * 墨色取 `palette.nature`，**不取 primary**：主色的语义永远只有
 * 「可以点 / 已选中 / 正在发生」，让草也穿主色会把那条语义废掉。
 *
 * 彩虹是例外：它自己按五段上色（`palette.nature.rainbow`），
 * 因为一条彩虹只有一个颜色就不是彩虹了。
 *
 * ---- 无障碍 ----
 *
 * 图形是装饰：它旁边永远有标题。所以默认 `accessibilityElementsHidden`。
 * 需要它被念的场合（目前没有）传 `label`。
 */
export interface NatureMarkProps {
  mark: NatureMarkKey | 'rainbow';
  /** 边长（正方形）。默认 26 */
  size?: number;
  /** 透明度。用于「这一页还没有数据」这类次要状态 */
  opacity?: number;
  /** 需要读屏念出来时给一个名字 */
  label?: string;
}

export function NatureMark({ mark, size = 26, opacity, label }: NatureMarkProps) {
  const { palette } = useTheme();
  const decorative = label === undefined;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${NATURE_MARK_BOX} ${NATURE_MARK_BOX}`}
      fill="none"
      opacity={opacity}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={label}
    >
      {mark === 'rainbow' ? (
        // 五条弧各穿一个自然色。从外到内：红 → 橙 → 绿 → 蓝 → 紫
        RAINBOW_STROKES.map((d, i) => (
          <Path
            key={i}
            d={d}
            stroke={palette.nature.rainbow[i]}
            strokeWidth={NATURE_MARK_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))
      ) : (
        <Path
          d={NATURE_MARKS[mark].outline}
          stroke={palette.nature[NATURE_MARKS[mark].ink]}
          strokeWidth={NATURE_MARK_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}
