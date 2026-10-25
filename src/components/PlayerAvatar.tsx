import React, { useMemo } from 'react';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

import {
  AVATAR_BOX,
  avatarEmberRadius,
  buildAvatar,
  outlinePoints,
  ribsPath,
} from '../domain/avatar';
import { useTheme } from '../theme/ThemeProvider';

/**
 * 玩家头像：一块落在灰里的炭。
 *
 * 为什么是 SVG 而不是图片：图案由 (playerId, avatarSeed) 算出来，不存文件、
 * 不占安装包、不需要任何权限；颜色读主题 token，四套主题下都是对的。
 *
 * 这套视觉为什么长这样（见 docs/02 §4.3）：
 * - 轮廓与棱用 text 色，填充是 text 色 15% 的淡影：一块有体积的煤，不是一个图标。
 * - 火心用 accent 色、实心圆。强调色在四套主题里都只用于非文字元素，正好是它。
 * - 不用圆形容器、不加边框：这不是社交软件的头像，是这一页的一枚印记。
 *
 * 无障碍：图案是装饰，读屏跳过，由外层把名字读出来。
 */

export interface PlayerAvatarProps {
  /** 玩家 id。导入数据后不变，头像就不变 */
  playerId: string;
  /** 重掷计数。每次「换一个」+1 */
  avatarSeed?: number;
  /** 边长（像素）。默认 48 */
  size?: number;
}

export function PlayerAvatar({ playerId, avatarSeed = 0, size = 48 }: PlayerAvatarProps) {
  const { palette } = useTheme();

  // 几何只跟 (playerId, avatarSeed) 有关，与主题无关：换主题不该换掉你的头像
  const shape = useMemo(() => buildAvatar(playerId, avatarSeed), [playerId, avatarSeed]);
  const points = useMemo(() => outlinePoints(shape), [shape]);
  const ribs = useMemo(() => ribsPath(shape), [shape]);

  // 描边按画布比例给：44px 与 72px 的头像，线条看起来应该一样粗
  const strokeWidth = AVATAR_BOX * (1.8 / size);
  const emberRadius = avatarEmberRadius(shape);

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${AVATAR_BOX} ${AVATAR_BOX}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* 煤块本体：淡填 + 描边。填色是它和「线框图标」的区别 */}
      <Polygon
        points={points}
        fill={palette.text}
        fillOpacity={0.15}
        stroke={palette.text}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* 棱：只有线，不填 */}
      <Path
        d={ribs}
        stroke={palette.text}
        strokeOpacity={0.75}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      {/* 火心：它还热着 */}
      <Circle cx={shape.ember.x} cy={shape.ember.y} r={emberRadius} fill={palette.accent} />
    </Svg>
  );
}
