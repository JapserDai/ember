import React, { useMemo } from 'react';
import Svg, { Rect } from 'react-native-svg';

import {
  AVATAR_GRID,
  getAvatarOption,
  parseAvatarRuns,
  roleColor,
} from '../domain/avatar';
import { useTheme } from '../theme/ThemeProvider';

/**
 * 玩家头像：一个 16×16 的像素动物。
 *
 * ---- 为什么是 SVG 方块，不是 PNG ----
 *
 * 长相是代码里的常量（`domain/avatar.ts` 的七个网格），不存文件、不占安装包、
 * 不需要任何权限，也不需要为每个尺寸准备一套图。颜色全部读主题 token，
 * 换主题时头像跟着走。
 *
 * 用 SVG 而不是 `<View>` 拼方块：一屏里可能有十来个头像（挑选面板 7 个小图 +
 * 1 个大图 + 「我的」页 1 个），每个 60 个 `<View>` 就是六百多个原生视图。
 * SVG 是一个原生视图内部画若干 `<Rect>`，代价低一个数量级。
 *
 * ---- 为什么每个方块之间不留缝 ----
 *
 * 早想的是「像素图要有网格感，格与格之间留一点缝」。试过之后放弃了：
 * 在 32px 下每格只有 2px，留 0.25 的缝就等于让整张图变成半透明的纱窗，
 * 动物会散掉。像素图的网格感来自**同一行相邻同色块被合并**之后留下的
 * 台阶边缘，不来自缝隙——那正是它在小尺寸下还认得出的原因。
 *
 * ---- 为什么底部不铺圆角背景 ----
 *
 * 头像不带底色。它坐在卡片的白底上（`palette.surface`），而 `dot` 角色
 * 恰好也是 surface——眼睛高光会「漏」进背景里。这是有意的：
 * 那一处白点读起来是「眼里的光」，不是「一个白方块」。铺一层底色反而会让它
 * 变成一个贴纸，和这一页其他「纸片」的气质不一致。
 */

export interface PlayerAvatarProps {
  /** 头像 id（`player.avatar_id`）。不认识的值会退回默认的狐狸 */
  avatarId: string;
  /** 边长（像素）。默认 48 */
  size?: number;
  /** 读屏是否朗读「这是哪一只动物」。默认 false（纯装饰） */
  accessible?: boolean;
}

export function PlayerAvatar({ avatarId, size = 48, accessible = false }: PlayerAvatarProps) {
  const { palette } = useTheme();

  // 几何只跟 id 有关，与主题无关：换主题不该换掉你挑的动物
  const option = useMemo(() => getAvatarOption(avatarId), [avatarId]);
  // 合并同色相邻格：每只动物从 ~200 个方块降到 ~60 个
  const runs = useMemo(() => parseAvatarRuns(option.grid), [option]);

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${AVATAR_GRID} ${AVATAR_GRID}`}
      accessible={accessible}
      accessibilityRole={accessible ? 'image' : undefined}
      accessibilityLabel={accessible ? `头像：${option.label}` : undefined}
      accessibilityElementsHidden={!accessible}
      importantForAccessibility={accessible ? 'yes' : 'no-hide-descendants'}
    >
      {runs.map((run, index) => (
        <Rect
          key={index}
          x={run.x}
          y={run.y}
          width={run.width}
          height={1}
          fill={roleColor(run.role, palette)}
        />
      ))}
    </Svg>
  );
}
