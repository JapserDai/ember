import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { AppState, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import {
  REMINDER_PRESETS,
  describeReminder,
  formatReminderMinute,
  parseReminderInput,
} from '../../src/domain/reminder';
import {
  getPermission,
  listReminderTargets,
  requestPermission,
  setTaskReminder,
  type ReminderPermission,
  type ReminderTarget,
} from '../../src/services/reminders';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 提醒设置（设置 → 节奏 → 提醒）。
 *
 * ---- 为什么提醒不放在「新建任务」的表单里 ----
 *
 * `app/tasks/new.tsx` 的规矩是「必填只有名字，首次创建不展示任何高级项」。
 * 提醒恰恰是一个**必须停下来想**的字段：它要求用户决定「我几点在做这件事」。
 * 在那张表单里加两排时间胶囊，会让第一次建任务的人以为自己漏填了什么。
 *
 * 而建完之后的某个时刻，用户会突然想「这件事早上提醒我一下」——
 * 那时候他来这一页，一次看到全部任务和它们各自的时刻。
 * 「所有提醒在一处」还有一个好处：**能一眼看出自己设了几条**，
 * 而分散在每条任务的详情页里，就没人数得清自己一天被叫几次。
 *
 * ---- 为什么这一页的每一行都是一张卡 ----
 *
 * 与「每一条数据都要框起来」同一条（D30）。一行 = 一件事 + 它的提醒时刻。
 *
 * ---- 权限为什么在打开开关时才问 ----
 *
 * 一打开 App 就弹系统权限框，用户还不知道要提醒什么，大概率点「不允许」；
 * 而 Android 上拒绝之后，再问就得去系统设置里手动打开。
 * 所以这里把它做成一个**明确的动作**：打开任一条提醒时，才请求。
 * 用户看到的是「我刚点了 08:00，系统问我允不允许」——因果关系清楚。
 */
export default function RemindersScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [targets, setTargets] = useState<ReminderTarget[]>([]);
  const [permission, setPermission] = useState<ReminderPermission>('undetermined');
  /** 正在等系统弹窗 / 正在写库。期间不给点，避免连点排两遍 */
  const [busy, setBusy] = useState(false);
  /** 上一次操作的结果。成功是既成事实，失败才需要说清 */
  const [notice, setNotice] = useState<string | null>(null);

  /** 从库里重读任务列表与权限状态 */
  const refresh = useCallback(() => {
    try {
      setTargets(listReminderTargets());
    } catch (err) {
      console.warn('[Ember] 读取提醒列表失败', err);
      // 有旧列表就留着：宁可显示几秒前的，也不要把整页清空
    }
    void getPermission().then(setPermission);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  /*
   * 从系统设置里改了通知权限再回来，这一页要跟着变。
   * AppState 监听是唯一能知道「用户离开过又回来了」的办法——
   * useFocusEffect 只在路由切换时触发，而「去系统设置改权限」不算路由切换。
   */
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  /**
   * 改一个任务的提醒时刻。
   *
   * 顺序：先要权限（如果还没有）→ 再写库 + 重排。
   * 先要权限是因为「写进去了但发不出来」比「什么都没发生」更糟：
   * 用户会以为设好了，然后在第二天早上什么都没等到。
   */
  const apply = useCallback(
    async (taskId: string, minute: number | null) => {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      try {
        if (minute !== null && permission !== 'granted') {
          const next = await requestPermission();
          setPermission(next);
          if (next !== 'granted') {
            setNotice(
              next === 'denied'
                ? '系统里没允许 Ember 发通知。去手机的「设置 → 应用 → Ember → 通知」里打开，再回来。'
                : '没有允许通知，所以这条提醒先不设。'
            );
            return;
          }
        }

        const result = await setTaskReminder(taskId, minute);
        setTargets(listReminderTargets());
        if (!result.ok) setNotice(result.message);
      } catch (err) {
        console.warn('[Ember] 设置提醒失败', err);
        setNotice('没存下来，再试一次。');
      } finally {
        setBusy(false);
      }
    },
    [busy, permission, refresh]
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings');
    }
  };

  const alerting = targets.filter((target) => target.minute !== null).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.sm,
        paddingBottom: insets.bottom + theme.spacing.xxl,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: theme.spacing.pageX }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回设置"
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
          提醒
        </Text>
      </View>

      {/* 说清楚这一页会做什么，以及它不会做什么 */}
      <Card style={{ marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {alerting === 0
            ? '现在没有提醒。想起来了就设一条。'
            : `现在有 ${alerting} 件事会提醒你。`}
        </Text>
        <Text
          style={{
            marginTop: theme.spacing.sm,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          提醒只出现在这台手机的通知栏里，不出声、不亮屏。所有通知都由手机自己排，不经过网络。
        </Text>
      </Card>

      {/* 权限被拒时：说清去哪儿开，并且**不隐藏**下面那些开关 */}
      {permission === 'denied' ? (
        <Card style={{ marginTop: theme.spacing.cardGap, marginHorizontal: theme.spacing.pageX }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.danger,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            系统里把 Ember 的通知关掉了。去手机的「设置 → 应用 → Ember → 通知」里打开，再回到这一页。
          </Text>
        </Card>
      ) : null}

      {notice ? (
        <View style={{ marginTop: theme.spacing.sm, paddingHorizontal: theme.spacing.pageX }}>
          <Text
            accessibilityRole="alert"
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {notice}
          </Text>
        </View>
      ) : null}

      {/* 任务列表：一行一张卡 */}
      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        {targets.length === 0 ? (
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            还没有可以提醒的事。先在「今天」页加一件。
          </Text>
        ) : (
          targets.map((target) => (
            <ReminderCard
              key={target.id}
              target={target}
              busy={busy}
              onChange={(minute) => void apply(target.id, minute)}
            />
          ))
        )}
      </View>

      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          一天最多排 20 条通知。设得多了，靠后的几天会被少排几条——这台手机上的通知额度是有限的。
        </Text>
      </View>
    </ScrollView>
  );
}

/**
 * 一个任务的提醒设置。
 *
 * 交互与「截止日」那一栏同一套（DueDateField）：几个快捷时间胶囊 + 「写时间」。
 * 为什么复用这套而不是做一个时间选择器：这个 App 里没有第三方组件库，
 * 自己画一个滚轮要处理惯性、吸附、无障碍、暗色——为了一个每天用一次不到的字段
 * 不值得。而「08:00 / 12:00 / 20:00 + 自己写」覆盖了绝大多数情况。
 */
function ReminderCard({
  target,
  busy,
  onChange,
}: {
  target: ReminderTarget;
  busy: boolean;
  onChange: (minute: number | null) => void;
}) {
  const { theme, palette } = useTheme();

  /** 是否展开「自己写时间」 */
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);

  const current = target.minute;
  const currentLabel = formatReminderMinute(current);
  // 当前时刻既不是「不提醒」也不是某个预设 → 是用户自己写的
  const isCustom =
    current !== null && !REMINDER_PRESETS.some((preset) => preset.minute === current);

  const pickPreset = (minute: number | null) => {
    onChange(minute);
    setTyping(false);
    setErrorText(null);
  };

  const commitDraft = () => {
    const text = draft.trim();
    if (text.length === 0) {
      // 清空等于「不提醒」，与截止日那一栏同一个约定
      onChange(null);
      setTyping(false);
      setErrorText(null);
      return;
    }
    const minute = parseReminderInput(text);
    if (minute === null) {
      setErrorText('写成 20:30 这样的格式。');
      return;
    }
    onChange(minute);
    setTyping(false);
    setErrorText(null);
  };

  return (
    <Card style={{ marginBottom: theme.spacing.cardGap }}>
      {/*
       *
       * 外观走查（1.5 倍字号）改的一处：标题与右侧时刻原来在**同一行**。
       *
       * 那一行是「标题 flex:1 + 时刻 numberOfLines:1」。当时字小，两边都放得下；
       * 系统字号放到 1.5 倍时，「每天 20:30」从 12 号变成 18 号、宽了将近一倍，
       * 把标题的位置挤到只剩几十像素——而标题又设了 numberOfLines={1}，
       * 表现是任务名只剩「喝…」。两个都是真实内容，抢同一条横线时不存在「谁该赢」。
       *
       * 改成上下两行：标题先占一行（最多两行），时刻放在它下面。
       * 时刻不靠右对齐：这一行不再需要「左边名字、右边状态」的对立关系，
       * 它就是标题的一句副标题，左对齐让两张文本的左右边缘对齐。
       * 下面的时间胶囊本来就是这一页的主要操作，它们不变。
       */}
      <Text
        numberOfLines={2}
        style={{
          fontSize: theme.typography.size.body,
          lineHeight: theme.typography.lineHeight.body,
          color: palette.text,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {target.title}
      </Text>
      <Text
        style={{
          marginTop: 2,
          fontSize: theme.typography.size.caption,
          lineHeight: theme.typography.lineHeight.caption,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
          fontVariant: ['tabular-nums'],
        }}
      >
        {describeReminder(current)}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: theme.spacing.sm }}>
        <TimeChip
          label="不提醒"
          selected={current === null}
          disabled={busy}
          onPress={() => pickPreset(null)}
          first
        />
        {REMINDER_PRESETS.map((preset) => (
          <TimeChip
            key={preset.label}
            label={preset.label}
            selected={current === preset.minute}
            disabled={busy}
            onPress={() => pickPreset(preset.minute)}
          />
        ))}
        <TimeChip
          label="写时间"
          selected={isCustom && !typing}
          disabled={busy}
          onPress={() => {
            setDraft(currentLabel);
            setTyping((prev) => !prev);
            setErrorText(null);
          }}
        />
      </View>

      {typing ? (
        <View style={{ marginTop: theme.spacing.sm }}>
          <TextInput
            value={draft}
            onChangeText={(next) => {
              setDraft(next);
              if (errorText) setErrorText(null);
            }}
            placeholder="20:30"
            placeholderTextColor={palette.textMuted}
            maxLength={5}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            onSubmitEditing={commitDraft}
            accessibilityLabel={`${target.title}的提醒时间，格式为时:分`}
            style={{
              minHeight: theme.touchTarget,
              paddingVertical: theme.spacing.sm,
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.body,
              borderBottomWidth: 1,
              borderBottomColor: palette.rule,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="用这个时间"
            onPress={commitDraft}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              minHeight: theme.touchTarget,
              justifyContent: 'center',
              opacity: pressed ? 0.55 : 1,
            })}
          >
            <Text
              style={{
                fontSize: theme.typography.size.label,
                lineHeight: theme.typography.lineHeight.label,
                color: palette.primary,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              用这个时间
            </Text>
          </Pressable>
          {errorText ? (
            <Text
              accessibilityRole="alert"
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.danger,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {errorText}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** 一个时间选项。选中只改描边与文字色，不填底色（与 DueDateField 的胶囊同一套） */
function TimeChip({
  label,
  selected,
  disabled,
  onPress,
  first = false,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  first?: boolean;
}) {
  const { theme, palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        /*
         *
         * 外观走查（1.5 倍字号）改的一处：40 → minHeight 跟着行高走。
         * 这五个胶囊是 flexWrap 的，每排三四个。系统把字号放到 1.5 倍时，
         * 「08:00」从 12 号变 18 号、行高从 16 变 24，而胶囊还是 40 高、
         * 上下 padding 都是 0——字就把胶囊顶满了，行的上下各被切掉一截。
         * 改成「行高 + 上下各 12 的内边距」，1.0 倍时是 40（不变），
         * 1.5 倍时自动长到 48。
         */
        minHeight: theme.typography.lineHeight.caption + 24,
        paddingHorizontal: theme.spacing.md,
        marginLeft: first ? 0 : theme.spacing.xs,
        marginBottom: theme.spacing.xs,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: selected ? palette.primary : palette.border,
        opacity: disabled ? 0.5 : pressed ? 0.55 : 1,
      })}
    >
      <Text
        style={{
          fontSize: theme.typography.size.caption,
          lineHeight: theme.typography.lineHeight.caption,
          color: selected ? palette.text : palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
          fontVariant: ['tabular-nums'],
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
