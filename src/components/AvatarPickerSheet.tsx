import React, { useCallback, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AVATAR_IDS,
  avatarIndex,
  describeAvatar,
  getAvatarOption,
  normalizeAvatarId,
  stepAvatar,
  type AvatarId,
} from '../domain/avatar';
import { PlayerAvatar } from './PlayerAvatar';
import { useTheme } from '../theme/ThemeProvider';

/**
 * 换头像面板：左右走，挑一只。
 *
 * ---- 为什么是底部面板，不是新页面 ----
 *
 * 换头像是一个「一眼就能决定」的动作。跳一个页面再返回，中间那层导航
 * 对它来说太重了——用户想看下一只，不应该先回到列表再点进去。
 * 面板盖在当前页上，底下那层还在，关掉就回来了。
 *
 * ---- 为什么是「左右走」而不是一个网格 ----
 *
 * 网格（7 个小图排成两三行，点一个）看起来更直接，但它把选择变成了**比较**：
 * 七个小图同时在场，人会横着扫、找「哪个更好看」，而「更好看」没有答案。
 * 一次只看一只、左右走，是**浏览**：看到一只觉得可以就停下。
 * 这与这个 App「不比较、不评分」的底线是同一件事。
 *
 * 缩略图那一行仍然保留，但它不承担选择：它只回答「一共有几只、我现在在哪」。
 * 点缩略图也能跳过去——那是给已经知道自己要哪一只的人用的近路。
 *
 * ---- 为什么「用这一只」要点一下 ----
 *
 * 滑动不落库。滑动只是看，落库要有一次明确的确认。否则每滑过一只都会写一次库，
 * 而用户最后停在哪一只只取决于他松手的位置——那不是一个「选择」。
 *
 * ---- 无障碍 ----
 *
 * 三个按钮都有明确的 accessibilityLabel；中间那只头像传 accessible，
 * 由 describeAvatar 读成「狐狸，尖耳朵，收窄的下巴」。
 * 滑动之后读屏会念新的那一句——视障用户靠这句话知道换到了哪一只。
 */
export interface AvatarPickerSheetProps {
  visible: boolean;
  /** 正在存库。期间按钮不给点，避免连点两次写两遍 */
  busy: boolean;
  /** 当前已经存下来的头像 id。面板打开时从它开始走 */
  currentId: string;
  /** 点「用这一只」时回调，参数是选中的 id */
  onConfirm: (id: AvatarId) => void;
  onClose: () => void;
}

export function AvatarPickerSheet({
  visible,
  busy,
  currentId,
  onConfirm,
  onClose,
}: AvatarPickerSheetProps) {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();

  /**
   * 面板里正在看的那一只。
   *
   * 它是**独立于 currentId 的本地状态**：滑到别处再关掉面板，库里的值不该变。
   * 每次打开面板时从 currentId 重新开始（见下面的 handleShow）。
   */
  const [preview, setPreview] = useState<AvatarId>(() => normalizeAvatarId(currentId));

  const option = getAvatarOption(preview);

  const go = useCallback((step: 1 | -1) => {
    setPreview((previous) => stepAvatar(previous, step));
  }, []);

  /**
   * 打开面板时把预览重置到当前已存的那一只。
   *
   * 用 Modal 的 onShow 而不是 useEffect + visible：onShow 是面板真正可见的
   * 那一刻，而 useEffect 会在渲染后就跑——那时用户还没看到东西，
   * 重置没有意义。两者效果一样，但 onShow 少一次多余的渲染。
   */
  const handleShow = useCallback(() => {
    setPreview(normalizeAvatarId(currentId));
  }, [currentId]);

  const changed = preview !== normalizeAvatarId(currentId);

  /**
   * 点了「用这一只」。
   *
   * 没变时不调 onConfirm：按钮本身已经是禁用的，这里再拦一道是因为
   * 无障碍服务可能直接触发 onPress，而「点了不做事」比「按钮灰着」更难解释。
   */
  const handleConfirm = useCallback(() => {
    if (busy || !changed) return;
    onConfirm(preview);
  }, [busy, changed, onConfirm, preview]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // 面板开着时按返回键先关面板，而不是退出这一页
      onRequestClose={onClose}
      onShow={handleShow}
      statusBarTranslucent
    >
      {/* 遮罩。点它关闭——这是面板唯一「不选任何东西就退出」的方式 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="关闭"
        onPress={onClose}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
        }}
      />

      <View
        style={{
          // 贴着屏幕底部，越过底栏（底栏在 Modal 下面，所以这里要自己补安全区）
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: insets.bottom + theme.spacing.md,
          paddingTop: theme.spacing.md,
          backgroundColor: palette.surface,
          borderTopWidth: 1,
          borderTopColor: palette.border,
        }}
      >
        <Text
          style={{
            paddingHorizontal: theme.spacing.pageX,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          挑一只头像
        </Text>

        {/* ---- 中间那只 + 左右两个箭头 ---- */}
        <View
          style={{
            marginTop: theme.spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: theme.spacing.pageX,
          }}
        >
          <ArrowButton label="上一只" glyph="‹" disabled={busy} onPress={() => go(-1)} />

          <View style={{ alignItems: 'center', flexShrink: 1 }}>
            {/* 大图。96px 让每一格都是 6px，能看清眼睛 */}
            <PlayerAvatar avatarId={preview} size={96} accessible />
            <Text
              style={{
                marginTop: theme.spacing.xs,
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                fontWeight: theme.typography.weight.medium,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.title,
              }}
            >
              {option.label}
            </Text>
            <Text
              style={{
                marginTop: 2,
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {option.description}
            </Text>
          </View>

          <ArrowButton label="下一只" glyph="›" disabled={busy} onPress={() => go(1)} />
        </View>

        {/* ---- 缩略图行：只回答「一共有几只、我在哪一只」 ---- */}
        <View
          style={{
            marginTop: theme.spacing.md,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            columnGap: theme.spacing.xs,
            paddingHorizontal: theme.spacing.pageX,
          }}
        >
          {AVATAR_IDS.map((id) => {
            const selected = id === preview;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={`第 ${avatarIndex(id) + 1} 只，${describeAvatar(id)}`}
                accessibilityState={{ selected }}
                onPress={() => setPreview(id)}
                style={({ pressed }) => ({
                  //
                  // 外观走查改的一处：原来这里写的是 minWidth: 40，
                  // 而面板的可用宽度是「屏宽 - 32」÷ 7。窄屏（320）上算下来
                  // 每格只有 38，再叠 7 个 40 的硬下限就横向溢出；
                  // 现在改成 flex: 1 + 不设下限，七格平分这一行，
                  // 任何屏宽都不会溢出。高度仍给足 44（docs/02 §9 的触控下限）。
                  //
                  flex: 1,
                  minHeight: theme.touchTarget,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.55 : 1,
                })}
              >
                {/* 选中的那一只加一条下划线，而不是换底色：
                    换底色会让它读起来像「一个被选中的按钮」，
                    而这一行只是「位置指示器」 */}
                <PlayerAvatar avatarId={id} size={32} />
                <View
                  style={{
                    marginTop: 2,
                    height: 2,
                    width: 20,
                    borderRadius: 1,
                    backgroundColor: selected ? palette.primary : 'transparent',
                  }}
                />
              </Pressable>
            );
          })}
        </View>

        {/* ---- 确认 ---- */}
        <View style={{ marginTop: theme.spacing.sm, paddingHorizontal: theme.spacing.pageX }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={changed ? `用这一只：${option.label}` : '用这一只'}
            accessibilityState={{ disabled: busy || !changed }}
            disabled={busy || !changed}
            onPress={handleConfirm}
            style={({ pressed }) => ({
              minHeight: theme.touchTarget,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.button,
              backgroundColor: palette.primary,
              // 已经就是这一只时按钮退到灰里：一个永远可点、点了什么也不发生的
              // 按钮比一个明显不可点的按钮更让人困惑
              opacity: busy || !changed ? 0.35 : pressed ? 0.75 : 1,
            })}
          >
            <Text
              style={{
                fontSize: theme.typography.size.label,
                lineHeight: theme.typography.lineHeight.label,
                fontWeight: theme.typography.weight.semibold,
                color: palette.onPrimary,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {busy ? '正在保存…' : changed ? `用这一只：${option.label}` : '就是这一只'}
            </Text>
          </Pressable>
        </View>

        {/* 取消。放在最下面、纯文字：它是出口，不是选项 */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="取消"
          onPress={onClose}
          style={({ pressed }) => ({
            marginTop: theme.spacing.xs,
            minHeight: theme.touchTarget,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <Text
            style={{
              fontSize: theme.typography.size.label,
              lineHeight: theme.typography.lineHeight.label,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            取消
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/**
 * 左右两个箭头。
 *
 * 用「‹ ›」这两个字符而不是画两个 SVG 箭头：
 * 它们是排版字符，跟着字体走，在任何字号下都不会变形；
 * 而这个 App 里除底栏以外没有别的图标，为两个箭头引入一套图标语言不值得。
 * 字号给到 32，让它们看起来是「可以按的大按钮」而不是两个小符号。
 */
function ArrowButton({
  label,
  glyph,
  disabled,
  onPress,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme, palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: theme.touchTarget,
        minHeight: theme.touchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : pressed ? 0.5 : 1,
      })}
    >
      <Text
        //
        // 外观走查（1.5 倍字号）改的一处：这两个「‹ ›」是**图标**，不是文字，
        // 所以不跟系统字号缩放。它们坐在 44×44 的触控区里，字号 32、行高 36；
        // 系统放到 1.5 倍时字符变成 48 宽，会被 44 的容器裁成半个箭头，
        // 剩下的那一半看着就像这个按钮坏了。
        //
        allowFontScaling={false}
        style={{
          fontSize: 32,
          lineHeight: 36,
          color: palette.text,
          fontFamily: theme.typography.fontFamily.title,
        }}
      >
        {glyph}
      </Text>
    </Pressable>
  );
}
