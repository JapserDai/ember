import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarPickerSheet } from '../../src/components/AvatarPickerSheet';
import { SettingsRow } from '../../src/components/SettingsRow';
import { getPlayerSnapshot, type PlayerSnapshot } from '../../src/db/repo/player';
import { getSettings } from '../../src/db/repo/settings';
import { DEFAULT_AVATAR_ID, getAvatarOption, type AvatarId } from '../../src/domain/avatar';
import { DIFFICULTY_LABEL_TEXT } from '../../src/domain/text-rules';
import { chooseAvatar, type AvatarActionResult } from '../../src/services/avatar';
import { THEME_LABEL } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 设置页。
 *
 * 独立于底部 4 个 tab 之外，从「我的」页头右上角推上来（docs/02 §4.3）。
 * 打开后底栏消失，页面上唯一的出口是左上角的「返回」。
 *
 * 四组：资料 / 外观 / 节奏 / 数据。分组沿用「账本」的排版——
 * 一个拉开的灰色小标签 + 通栏的行 + 发丝分隔线，没有卡片、没有箭头。
 *
 * **「资料」组是这一版新加的，也是「我的」页让出来的那部分**：
 * 头像、名字、那句自我介绍原先挂在「我的」页上（点头像换头像、点名字改资料）。
 * 挪进来的理由：它们都是「把 App 调成你想要的样子」，与主题、难度同类；
 * 而「我的」页回答的是「你走到了哪儿」。混在一起的代价是——
 * 用户点头像或名字时，并不知道自己正在离开那一页。
 *
 * 不能改的行要么显示真实值（readonly），要么标「之后」且不给点——
 * 不把未做的行做成「灰色可点」：点了没反应比不给点更让人困惑。
 */

/** 一组设置 */
interface SettingsGroup {
  title: string;
  /** 组标题下的一句说明。空字符串表示不写 */
  note: string;
  rows: Array<{
    label: string;
    /** 真实值。later 状态不显示这个 */
    value?: string;
    state: 'interactive' | 'readonly' | 'later';
    /** interactive 状态下的点击回调 */
    onPress?: () => void;
  }>;
}

/** 从库里读到的、需要显示在设置页上的值 */
interface SettingsValues {
  difficulty: string;
  dayStartHour: number;
}

/**
 * 读玩家资料。读失败时返回 null——设置页不该因为一行数据把整个 App 卡住。
 *
 * 与「我的」页不同，这里不做全零兜底：设置页要显示的是「现在的名字是什么」，
 * 一个假的「旅人」会让用户以为自己被改名了。null 时那几行显示为未知。
 */
function loadPlayer(): PlayerSnapshot | null {
  try {
    return getPlayerSnapshot();
  } catch (err) {
    console.warn('[Ember] 设置页读取玩家资料失败', err);
    return null;
  }
}

/**
 * 读设置。只在挂载时执行一次（useState 的惰性初始化），不在每次渲染时查库。
 * 读失败时退回默认值——设置页不该因为一行数据把整个 App 卡住。
 */
function loadSettingsValues(): SettingsValues {
  try {
    const settings = getSettings();
    return {
      difficulty: DIFFICULTY_LABEL_TEXT[settings.difficulty] ?? DIFFICULTY_LABEL_TEXT.easy,
      dayStartHour: settings.day_start_hour,
    };
  } catch {
    return { difficulty: DIFFICULTY_LABEL_TEXT.easy, dayStartHour: 4 };
  }
}

export default function SettingsScreen() {
  const { theme, palette, themeId } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [values] = useState<SettingsValues>(loadSettingsValues);

  /**
   * 玩家资料。
   *
   * 先在挂载时读一次（首帧不能空着），再用 useFocusEffect 在回到这一页时重读——
   * 从「资料」页改完名字回来，这一行必须显示新名字。
   * 读失败时退回 null，那几行按「还不知道」显示，而不是把整页拖垮。
   */
  const [player, setPlayer] = useState<PlayerSnapshot | null>(loadPlayer);
  useFocusEffect(
    useCallback(() => {
      setPlayer(loadPlayer());
    }, [])
  );

  /** 换头像面板是否打开 */
  const [pickerOpen, setPickerOpen] = useState(false);
  /** 正在写库。期间按钮不给点，避免连点两次写两遍 */
  const [busy, setBusy] = useState(false);

  /**
   * 所有换头像的动作都走这里，统一处理「成功 → 更新界面 / 失败 → 说一句」。
   *
   * 先把库写成功再更新界面：写失败时如果界面已经变了，用户会以为换好了，
   * 下次打开却变回去。所以 handler 拿到的都是**已经落库之后**的快照。
   */
  const applyResult = useCallback((result: AvatarActionResult) => {
    if (result.ok) {
      setPlayer(result.snapshot);
      return true;
    }
    Alert.alert('头像没换成', result.message);
    return false;
  }, []);

  /**
   * 「动效」开关 D66 删掉了。
   *
   * 它原本是一个能用的设置：`reduce_motion` 写进库，火带、飘字、
   * 勾选圈都读它，打开之后那几处都不播。问题不在它没用，
   * 而在**用户看不出它做了什么**——
   *   1. 设置页本身一个动画都没有，改完停在原地，屏幕上什么都不会变；
   *   2. 回到「今天」页能看到的只有一处（记录时的飘字），
   *      其余要么只闪 280ms、要么根本触发不到。
   *
   * 所以开关从界面上消失了，并按 D66 记录的补偿方案改成**跟随系统**：
   * `ThemeProvider` 现在读 `AccessibilityInfo`（Android 的「移除动画」），
   * 不再读库。`settings.reduce_motion` 列仍留在表里（D31：已发布的
   * 建表常量不许改），但没有任何写入方。六个组件照旧读 `reduceMotion`，
   * 不需要动——系统开了「移除动画」的用户，动效自然全停。
   * 将来若要恢复 App 内开关，在这里加一行 `SettingsRow`，
   * 并在 `ThemeProvider` 里把系统源与用户源合并——只改这两个文件。
   */

  /**
   * 确认一只头像。
   *
   * 面板里只负责预览，写库发生在这里：滑到别处再关掉面板，库里的值不变。
   * 成功后才关面板；失败时面板留着，用户可以直接再选一次。
   */
  const handleConfirmAvatar = useCallback(
    (id: AvatarId) => {
      if (busy) return;
      setBusy(true);
      try {
        const ok = applyResult(chooseAvatar(id));
        if (ok) setPickerOpen(false);
      } finally {
        setBusy(false);
      }
    },
    [applyResult, busy]
  );

  /** 返回。深链直接打开设置页时没有上一页，退回「我的」而不是卡住 */
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/me');
    }
  };

  /**
   * 三种状态的划分标准是「这个值现在存不存在」，不是「能不能改」：
   *   - readonly：库里有真实值、此刻正在生效，只是还没有修改入口
   *   - later：这个功能压根还没做，没有值可显示
   *
   * 不把「能改」当成唯一标准，是因为同一页里一半行显示真值、一半写「之后」，
   * 会让人以为显示真值的那几行能点。
   */
  const groups: SettingsGroup[] = [
    {
      title: '资料',
      note: '',
      rows: [
        // 换头像走底部面板，不跳页：换头像是「一眼就能决定」的动作
        {
          label: '头像',
          // 右侧直接写动物名（狐狸 / 猫 / …），而不是「像素动物」：
          // 设置页每一行的右侧都是「现在是什么值」，而「像素动物」是种类，不是值
          value: player ? getAvatarOption(player.avatarId).label : '—',
          state: 'interactive',
          onPress: () => setPickerOpen(true),
        },
        // 名字与自我介绍在同一张表单里，所以同一个入口、同一页
        {
          label: '名字',
          value: player?.displayName ?? '—',
          state: 'interactive',
          onPress: () => router.push('/profile/edit'),
        },
        /*
         * 「一句自我介绍」这一行 D63 删掉了。
         *
         * 字段（`player.bio`）与库里已经写过的内容**都保留**——
         * 这一版只是不再有任何入口去读它或写它。将来想接回来，
         * 在这一行与「我的」页的身份卡各加一段渲染即可。
         */
      ],
    },
    {
      title: '外观',
      note: '',
      rows: [
        /*
         * 「主题」这一行在阶段 4 回来了（D40）。
         *
         * 它在阶段 1 被删过（D27）：那时只有一套白底，一个只有一项的单选列表
         * 不是选择，是一个占位符。阶段 4 把另外三套做回来了，这一行重新有了意义。
         *
         * 「深浅」仍然没有：四套主题各自包含了自己的深浅（白 / 晨光是浅的，
         * 夜航是深的），再叠一层「跟随系统」会出现没有设计过的组合。
         */
        {
          label: '主题',
          value: THEME_LABEL[themeId].name,
          state: 'interactive',
          onPress: () => router.push('/settings/theme'),
        },
        /*
         * 「动效」那一行 D66 删掉了——见上面 handleToggleMotion 位置的注释。
         */
        /*
         * 首页设置（D62）。
         *
         * 放在「外观」而不是单独一组：它改的是「今天」那一页的样子，
         * 与主题、动效是同一类东西——都是「看起来怎样」，不是「算得怎样」。
         */
        {
          label: '首页',
          value: '月历 / 火带 / 待办条数',
          state: 'interactive',
          onPress: () => router.push('/settings/home'),
        },
        /*
         * 日记设置（D65）。放在「外观」这一组里是勉强合适：
         * 其中「字数计数」是外观，而「字数上限」「历史条数」其实改了行为。
         * 单独给它一组会让设置页变成六个分组（现在四个），
         * 而这一页的规矩是「分组要少到能一眼看完」。
         */
        {
          label: '日记',
          value: '字数上限 / 历史条数',
          state: 'interactive',
          onPress: () => router.push('/settings/journal'),
        },
        /*
         * 番茄钟设置（D68）。三项：默认档 / 完成音 / 自动接下一档。
         * 默认档其实已经在番茄钟页里换档时顺手记住了——这一页给的是
         * 一个改主意的入口，不另设页面就重复了，所以它只放三项里
         * 另外两项没有的那个 + 默认档的兜底。
         */
        {
          label: '番茄钟',
          value: '默认档 / 完成音 / 自动接续',
          state: 'interactive',
          onPress: () => router.push('/settings/pomodoro'),
        },
      ],
    },
    {
      title: '节奏',
      note: '',
      rows: [
        /*
         * 难度与日界从「只读」变成可选（D62）。
         *
         * 它们从 v1 就在表里，但界面从来没有接上——所以这个 App 的三档难度
         * 与日界，此前**没有任何用户改过**，所有人跑的都是默认值。
         *
         * 难度有一个禁改窗口（有缺口且能修时不许改，见那个页面里的注释）。
         */
        {
          label: '难度',
          value: values.difficulty,
          state: 'interactive',
          onPress: () => router.push('/settings/difficulty'),
        },
        {
          label: '日界',
          value: `凌晨 ${values.dayStartHour} 点`,
          state: 'interactive',
          onPress: () => router.push('/settings/day-start'),
        },
        { label: '提醒', value: '每个任务各设各的', state: 'interactive', onPress: () => router.push('/settings/reminders') },
      ],
    },
    {
      title: '数据',
      note: '记录只在这台手机上。卸载、换机、手机坏掉，都会跟着没。',
      rows: [
        /*
         * 导出与导入在同一页，不拆成两行。
         *
         * 它们是同一件事的两端：一个把数据拿出去，一个把数据拿回来。
         * 拆成两行会让人以为导入是另一个功能，而它其实就在同一页的下半部分。
         */
        {
          label: '备份与导入',
          value: '导出 JSON / 从文件恢复',
          state: 'interactive',
          onPress: () => router.push('/settings/backup'),
        },
        // 隐私说明（阶段 6 第 5 条）。它属于「数据」，不是「关于」
        {
          label: '你的数据在哪儿',
          value: '没有网络权限',
          state: 'interactive',
          onPress: () => router.push('/privacy'),
        },
      ],
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      {/*
       * 换头像面板。放在 ScrollView 之外：它在 Modal 里，和滚动无关。
       * 行为：左右走、只看不写、点「用这一只」才落库。
       */}
        <AvatarPickerSheet
          visible={pickerOpen}
          busy={busy}
          currentId={player?.avatarId ?? DEFAULT_AVATAR_ID}
          onConfirm={handleConfirmAvatar}
          onClose={() => setPickerOpen(false)}
        />

      <ScrollView
        style={{ flex: 1, backgroundColor: palette.background }}
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* 返回。纯文字，不用箭头：箭头是图标库的语言，这一页用字 */}
        <View style={{ paddingHorizontal: theme.spacing.pageX }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回我的"
            onPress={handleBack}
            style={({ pressed }) => ({
              // 触控目标 44×44（docs/02 §9）。两个字只有 30 宽，所以补一个最小宽度
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
              // 与「返回」拉开到 md：两者同为左对齐，靠得太近会读成一个两行标题
              marginTop: theme.spacing.md,
              fontSize: theme.typography.size.title,
              lineHeight: theme.typography.lineHeight.title,
              fontWeight: theme.typography.weight.semibold,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.title,
            }}
          >
            设置
          </Text>
        </View>

        {groups.map((group) => (
          <View
            key={group.title}
            style={{
              marginTop: theme.spacing.xl,
              paddingHorizontal: theme.spacing.pageX,
            }}
          >
            <Text
              style={{
                marginBottom: theme.spacing.xs,
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {group.title}
            </Text>

            {group.note ? (
              <Text
                style={{
                  marginBottom: theme.spacing.sm,
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {group.note}
              </Text>
            ) : null}

            <View>
              {group.rows.map((row) => (
                <SettingsRow
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  state={row.state}
                  onPress={row.onPress}
                />
              ))}
            </View>
          </View>
        ))}

      {/* 隐私说明。这不是法律文本，是一句实话 */}
        <View
          style={{
            marginTop: theme.spacing.xxl,
            paddingHorizontal: theme.spacing.pageX,
          }}
        >
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            这个 App 没有网络权限。没有账号，没有服务器，数据只在这台手机上。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
