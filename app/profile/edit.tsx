import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getPlayerSnapshot, type PlayerSnapshot } from '../../src/db/repo/player';
import { NAME_MAX, charCount } from '../../src/domain/profile';
import { saveProfile } from '../../src/services/profile';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 资料编辑页。
 *
 * 从「我的」页点名字进入（`app/profile/edit.tsx`）。不在 tab 里，
 * 打开后底栏消失，页面上唯一的出口是左上角的「返回」——和设置页同一个模式。
 *
 * 只编辑一样：名字（D63 删掉了「一句自我介绍」的输入框，
 * 字段与库里已有的内容都保留，只是这一版没有编辑入口）。
 * **头像不在这里**：换头像是点头像就开面板的一步动作（docs/02 §4.3），
 * 把它搬进这张表单会变成「改完名字再滚下去换头像再回来保存」，
 * 而换头像本来就是即时生效的，不该被「保存」按钮拖住。
 *
 * 为什么表单只有两行也要单独一页，而不是在「我的」页就地编辑：
 *   这一页最重要的是名字——它是整个 App 里最常被别处引用的字段
 *   （页头、以后的叙事、导出文件）。就地编辑会让「我的」页在
 *   编辑状态下多出一个键盘、一个保存按钮，把等级和五维挤下去。
 *
 * 保存策略：**只有点「保存」才写库**，不做「失焦即保存」。
 *   输入框在中文输入法下，候选词还没选完就失焦是很常见的事，
 *   失焦即保存会把半个拼音写进库。代价是用户可能改了却忘了点保存——
 *   所以返回时如果还有未保存的改动，会问一句。
 */

/**
 * 读当前资料。读失败时退回默认值，而不是让页面白屏——
 * 这一页不该因为一行数据把整个 App 卡住（与「我的」页同一个策略）。
 */
function loadProfile(): PlayerSnapshot | null {
  try {
    return getPlayerSnapshot();
  } catch (err) {
    console.warn('[Ember] 读取玩家资料失败', err);
    return null;
  }
}

export default function ProfileEditScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // 只在挂载时读一次库。之后的所有显示都来自 state，
  // 否则每次按键都查一次库，输入会卡
  const [initial] = useState(loadProfile);

  const [name, setName] = useState(initial?.displayName ?? '');
  /** 正在保存。保存期间按钮不给点，避免连点写两遍 */
  const [saving, setSaving] = useState(false);
  /** 已经成功保存过一次。用来决定返回时要不要提醒「还没保存」 */
  const [savedOnce, setSavedOnce] = useState(false);

  /**
   * 有没有未保存的改动。
   *
   * 比较的是**去掉首尾空白之后**的值：用户在名字后面多打一个空格，
   * 不该被判成「有未保存的改动」——那种提醒会让返回键变得烦人，
   * 而烦人的确认框最后一定会被用户条件反射地按掉。
   */
  const dirty = useMemo(() => {
    return name.trim() !== (initial?.displayName ?? '').trim();
  }, [name, initial]);

  /**
   * 保存成功后返回。
   *
   * 不弹「保存成功」：这一页的返回本身就是确认——用户回到「我的」页
   * 会直接看到名字变了。再加一个提示框，等于为了说「我做了你说的事」
   * 拦住用户一次。
   */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/me');
  }, [router]);

  const handleBack = useCallback(() => {
    if (!dirty) {
      leave();
      return;
    }

    // 有未保存的改动才拦一下。文案只说事实和下一步，不说「确定要放弃吗」
    Alert.alert('还没保存', '名字和这段话的改动还没存下来。', [
      { text: '继续编辑', style: 'cancel' },
      { text: '不保存，退出', style: 'destructive', onPress: leave },
    ]);
  }, [dirty, leave]);

  const handleSave = useCallback(() => {
    if (saving) return;
    setSaving(true);
    try {
      /*
       * `bio` 传的是**库里原来那个值**，不是空串。
       *
       * D63 把这一页的自我介绍输入框删了，但 `player.bio` 这一列与
       * 用户已经写过的话都保留着。如果这里传 ''，`saveProfile` 会把它规范化成
       * 空串并写成 NULL——等于「改一次名字，顺手把自我介绍抹掉」，
       * 而用户完全不知道自己做了什么。
       */
      const result = saveProfile({ name, bio: initial?.bio ?? '' });
      if (!result.ok) {
        Alert.alert('没存下来', result.message);
        return;
      }
      setSavedOnce(true);
      leave();
    } finally {
      setSaving(false);
    }
  }, [saving, name, initial, leave]);

  const nameCount = charCount(name.trim());

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.background }}
      // Android 上 adjustResize 已经在 manifest 里生效，这里只管 iOS 的 padding
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.xxl,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: theme.spacing.pageX }}>
          {/* 返回。与设置页同一套：纯文字、不用箭头 */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回我的"
            onPress={handleBack}
            style={({ pressed }) => ({
              minHeight: theme.touchTarget,
              minWidth: theme.touchTarget,
              justifyContent: 'center',
              alignSelf: 'flex-start',
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
              返回
            </Text>
          </Pressable>

          <Text
            style={{
              marginTop: theme.spacing.md,
              fontSize: theme.typography.size.title,
              lineHeight: theme.typography.lineHeight.title,
              fontWeight: theme.typography.weight.semibold,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.title,
            }}
          >
            资料
          </Text>
        </View>

        {/* ---- 名字 ---- */}
        <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
          <FieldLabel text="名字" />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="旅人"
            placeholderTextColor={palette.textMuted}
            maxLength={NAME_MAX * 2}
            // 名字是一行。回车键收键盘，而不是插入换行
            returnKeyType="done"
            onSubmitEditing={handleSave}
            autoCorrect={false}
            // 不自动大写：中文没有大小写，英文名字用户自己会决定
            autoCapitalize="none"
            accessibilityLabel="名字"
            style={{
              marginTop: theme.spacing.xs,
              paddingVertical: theme.spacing.sm,
              // 不画输入框的边框：这一页的语言是「账本」，
              // 一条下划线比一个圆角矩形更贴（和设置页的分隔线同一套）
              borderBottomWidth: 1,
              borderBottomColor: palette.border,
              fontSize: theme.typography.size.heading,
              lineHeight: theme.typography.lineHeight.heading,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.title,
            }}
          />
          <Counter current={nameCount} max={NAME_MAX} />
        </View>

        {/*
         * 一句自我介绍（`player.bio`）的输入框 D63 删掉了。
         *
         * 字段与库里已经写过的内容都保留，只是这一版没有编辑入口。
         * 这一页现在只改名字——一个只有一个输入框的表单，
         * 比一个「名字 + 一句可有可无的话」的表单更容易填完。
         */}

        {/* ---- 保存 ---- */}
        <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="保存资料"
            accessibilityState={{ disabled: saving || !dirty }}
            onPress={handleSave}
            disabled={saving || !dirty}
            style={({ pressed }) => ({
              minHeight: theme.touchTarget,
              justifyContent: 'center',
              alignItems: 'center',
              paddingVertical: theme.spacing.md,
              backgroundColor: palette.primary,
              borderRadius: theme.radius.button,
              // 没有改动时按钮退到灰里：一个永远可点、点了什么也不发生的按钮，
              // 比一个明显不可点的按钮更让人困惑（和设置页「之后」那几行同一个理由）
              opacity: saving || !dirty ? 0.35 : pressed ? 0.75 : 1,
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
              {saving ? '正在保存…' : savedOnce && !dirty ? '已保存' : '保存'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** 字段名。小字、拉开字距，和设置页的分组标题同一档 */
function FieldLabel({ text }: { text: string }) {
  const { theme, palette } = useTheme();
  return (
    <Text
      style={{
        fontSize: theme.typography.size.caption,
        lineHeight: theme.typography.lineHeight.caption,
        color: palette.textMuted,
        fontFamily: theme.typography.fontFamily.body,
      }}
    >
      {text}
    </Text>
  );
}

/**
 * 字数计数。
 *
 * 只在**接近上限**时才显示：一直显示「3 / 80」会让人以为这一栏有指标要完成。
 * 超过 80% 才出现，并且只用次要色——它不是警告，是提示。
 */
function Counter({ current, max }: { current: number; max: number }) {
  const { theme, palette } = useTheme();
  const show = current > max * 0.8;
  if (!show) return null;

  return (
    <Text
      style={{
        marginTop: theme.spacing.xs,
        textAlign: 'right',
        fontSize: theme.typography.size.caption,
        lineHeight: theme.typography.lineHeight.caption,
        color: palette.textMuted,
        fontFamily: theme.typography.fontFamily.body,
        fontVariant: ['tabular-nums'],
      }}
    >
      {current} / {max}
    </Text>
  );
}


