import React from 'react';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';
import { SHOP_MARK_BOX, SHOP_MARK_STROKE, SHOP_MARKS, type ShopMarkKey } from '../domain/shopMarks';

/**
 * 一件商品的图形（D53）。
 *
 * 坐标搬 Lucide（ISC 许可），见 `domain/shopMarks.ts`。
 *
 * ---- 为什么商品需要图形 ----
 *
 * 商店从「三件全是材料」扩成四类之后，只靠名字分不出性质：
 * 「一个材料」和「一张连胜护盾」在文字上都是「一个…」，要读完才知道区别。
 * 一个 26px 的图形让扫视时先认出「这是哪种东西」，再读名字。
 *
 * ---- 颜色 ----
 *
 * 默认用主题的 `secondary`（次要色）：商品图形是**分类标记**，不是可点元素，
 * 用主色会把「可以点」的语义分给它；而主色在这一页已经用在价格可负担时的
 * 动作文字上了。需要强调时（比如已拥有的东西）传 `color`。
 *
 * ---- 无障碍 ----
 *
 * 图形是装饰：旁边永远有名字。所以默认 `accessibilityElementsHidden`。
 */
export interface ShopMarkProps {
  mark: ShopMarkKey;
  /** 边长（正方形）。默认 26 */
  size?: number;
  /** 颜色。不传时取主题次要色 */
  color?: string;
  /** 透明度。用于「买不起 / 已到上限」这类次要状态 */
  opacity?: number;
  /** 需要读屏念出来时给一个名字 */
  label?: string;
}

export function ShopMark({ mark, size = 26, color, opacity, label }: ShopMarkProps) {
  const { palette } = useTheme();
  const decorative = label === undefined;
  const stroke = color ?? palette.secondary;
  const spec = SHOP_MARKS[mark];

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${SHOP_MARK_BOX} ${SHOP_MARK_BOX}`}
      fill="none"
      opacity={opacity}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={label}
    >
      <Path
        d={spec.outline}
        stroke={stroke}
        strokeWidth={SHOP_MARK_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
