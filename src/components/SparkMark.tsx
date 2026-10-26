import React from 'react';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';
import { SPARK_BOX, SPARK_PATH } from '../domain/spark';

/**
 * 火花记号（品牌图形）。
 *
 * 它与 `TabBarIcon` 的「今天」不是同一个东西，这一点要分清楚：
 *   - `TabBarIcon` 的「今天」是**图标**：只描边、24 网格、23–28px，
 *     它的职责是「这一页叫什么」，所以它必须和另外三个图标同一套画法；
 *   - 这里是**记号**：实心填充，没有线宽，可以缩到 16px 也可以放到 1024px。
 *     它出现在启动页、关于页、落地页与 App 图标里，职责是「这是谁」。
 *
 * 为什么记号是实心的：
 *   图标可以描边，因为底栏给了它一层背景；而记号经常压在**任意**底色上
 *   （启动页的纸、图标的白、通知栏的黑），描边在小尺寸下会糊成灰。
 *   实心图形缩到 16px 仍然是一块清楚的墨。
 *
 * 为什么颜色默认取 `palette.primary`：
 *   记号在界面里出现的地方（启动页、关于页）都是「没有别的可点东西」的场合，
 *   用主色不会抢走按钮的主色语义；而在图标里它取纯白，那是另一条路（见脚本）。
 *
 * 无障碍：默认 `accessibilityElementsHidden`。记号是装饰——旁边永远有
 * 「Ember」这几个字（启动页、关于页、顶栏），读屏再念一遍「火花」是噪音。
 * 需要它被念出来的场合（比如关于页里单独出现、旁边没有名字）传 `label`。
 */
export interface SparkMarkProps {
  /** 边长（正方形）。默认 24，与画框一致 */
  size?: number;
  /** 颜色。不传时取主题主色 */
  color?: string;
  /** 需要读屏念出来时给一个名字，例如「Ember」 */
  label?: string;
  /** 透明度。用于「余烬未亮」这类次要状态的记号 */
  opacity?: number;
}

export function SparkMark({ size = 24, color, label, opacity }: SparkMarkProps) {
  const { palette } = useTheme();
  const fill = color ?? palette.primary;
  const decorative = label === undefined;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${SPARK_BOX} ${SPARK_BOX}`}
      fill="none"
      opacity={opacity}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={label}
    >
      <Path d={SPARK_PATH} fill={fill} />
    </Svg>
  );
}
