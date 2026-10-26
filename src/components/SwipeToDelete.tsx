import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Card } from './Card';
import { useTheme } from '../theme/ThemeProvider';

/**
 * 「左滑露出删除」的卡片框（D55 立、D65 改方向）。
 *
 * ---- 为什么是滑动，而不是一个「编辑」开关 ----
 *
 * 早先首页的做法是页头的「编辑」：点一下，每一行右边长出一个「删」。
 * 它的问题是**它是一页的第二个模式**——进入之后整页看起来都变了，
 * 而用户只是想删掉其中一件。滑动把「删除」放在那一条自己身上：
 * 手指落在哪儿，动作就发生在哪儿。
 *
 * ---- 为什么手指往左滑，按钮出现在右边（D65 从右滑改过来） ----
 *
 * 卡片被手指推着往左走，右边空出来的位置露出「删」。这个方向与
 * iOS 邮件 / 微信一致，也是绝大多数中国用户的肌肉记忆。
 *
 * **代价**：左滑同时是 Android 的「返回」方向。这一条我核对过两处：
 *   1. `app.json` 里 `predictiveBackGestureEnabled: false`，预测性返回手势已关；
 *   2. 但某些 ROM 的侧滑返回仍然存在，会抢走边缘那一小段的手势。
 * 所以判据比右滑版更严（见 CLAIM_DX / CLAIM_RATIO）：宁可这一行不响应，
 * 也不能在用户想返回时误删一条待办。**失败的方向必须是「不响应」**。
 *
 * ---- 依赖：RN 自带的 PanResponder，不装 gesture-handler ----
 *
 * D47 明确不让 `react-native-gesture-handler` 进 `node_modules`（它是
 * expo-router 的 optional peer，装进来会让开发服务器报
 * `Cannot read property 'ErrorBoundary' of undefined`）。所以手势是手写的，
 * 代价有三条，都处理在下面：
 *   1. 手写要自己判断「这次横滑该不该我管」——否则页面就滑不动了（见 shouldClaim）；
 *   2. 手写要自己保证「同时只有一行是开的」——模块级的 activeCloser 管这件事；
 *   3. 手写没有「惯性」，所以松手时按位移过没过半自己吸附到开 / 关。
 *
 * ---- 读屏用户摸不到「左滑」 ----
 *
 * 所以每个卡片同时挂一个 `accessibilityActions` 的自定义动作「删除」：
 * 读屏开启时双击并上滑可以选到它。**这条不是可选的**——没有它，
 * 这个 App 的删除功能对一类用户就是完全关着的。
 */

/** 「删」露出来的宽度。84 = 文字宽度 + 左右各一段留白，再窄就点不准了 */
const ACTION_WIDTH = 84;

/**
 * 判断「这次横滑归我管」的最小横向位移。
 *
 * 16（右滑版是 8）：左滑与侧滑返回同向，边缘那一段更容易被系统抢走，
 * 所以门槛抬高到 16——一次真的「想把这一行推开」的手指动作，
 * 横向位移远超这个数；而一次「想返回」的边缘滑动通常会被系统先接管。
 */
const CLAIM_DX = 16;

/**
 * 横向 / 纵向位移的比。必须明显大于 1，否则斜着滑的时候会和
 * ScrollView 抢手势——那种「滑列表滑不动」的手感比没有滑动删除更糟。
 *
 * 2.0（右滑版是 1.6）：与 CLAIM_DX 同一个理由，左滑要多一层把握才接管。
 */
const CLAIM_RATIO = 2;

/**
 * 当前开着的那一行。**模块级**，不在组件树里。
 *
 * 为什么不做成页面里的 state：那就得把 openId / onOpen 一路传进
 * 每一个 TodoCard 与 TaskRow，而这两个组件的其余 props 与「哪一行开着」
 * 毫无关系。模块级的一个变量就够，因为「同时只开一行」本身就是全局的一件事。
 *
 * 记得在卸载时释放：那一行被删掉之后，activeCloser 还指着一个已经
 * 不存在的组件，下一次打开别的行会调用它，然后什么也没发生——
 * 结果是「两行同时开着」。
 */
let activeCloser: (() => void) | null = null;

/**
 * 当前开着的那一行开过没有。
 *
 * 「左滑可以删」是隐藏手势，新用户不会自己发现（这正是 TaskRow 早先
 * 拒绝用滑动删除的理由）。所以第一次出现待办时，第一张卡会**自己轻轻
 * 推 12px 再退回去**——一次就够，看见过的人不需要再看第二遍。
 *
 * 存在模块级变量里而不是库里：它不是一个需要跨启动记住的偏好，
 * 而为了它多一列设置 + 一份备份白名单，收益为零。
 */
let peekedInThisSession = false;

export interface SwipeToDeleteProps {
  children: React.ReactNode;
  /** 点「删」之后执行。确认弹窗由调用方负责（删除不可撤销） */
  onDelete: () => void;
  /** 读屏与确认弹窗里用的名字，例如「交房租」 */
  title: string;
  /** 卡片是否自带上边距之外的下边距（列表最后一行传 0） */
  marginBottom?: number;
  /** 额外的卡片样式 */
  style?: StyleProp<ViewStyle>;
  /**
   * 挂载时自己轻轻推开一下再退回去，告诉用户「这里能滑」。
   * 整个进程只会有一次真的播（见 peekedInThisSession）。
   */
  peek?: boolean;
}

export function SwipeToDelete({
  children,
  onDelete,
  title,
  marginBottom = 8,
  style,
  peek = false,
}: SwipeToDeleteProps) {
  const { theme, palette, reduceMotion } = useTheme();

  /**
   * 卡片当前的横向位移（**负数**：左滑）。
   *
   * 0 = 关，`-ACTION_WIDTH` = 开。负数不是笔误：`translateX` 往左是负，
   * 而卡片往左走才露得出右边的「删」。
   */
  const offset = useRef(new Animated.Value(0)).current;
  /** 手势开始时的位移。松手吸附要靠它 + dx 算出终点 */
  const base = useRef(0);
  /**
   * 当前「推开了多少」的正数镜像（0 … ACTION_WIDTH）。
   *
   * 为什么不直接记 `offset` 的值：Animated 的值不能同步读（要回调），
   * 而松手吸附的判断必须同步。所以这里存一个**正数**，
   * 需要喂给 `offset` 的地方自己取负（`-live`）。
   * 两套符号混用是这个组件最容易写错的一处，所以注释里写死：
   * `live` 永远是正数，`offset` 永远是负数或 0。
   */
  const live = useRef(0);
  /** 是否已经开着。用 ref 判手势，用 state 决定那一层「点一下关掉」要不要画 */
  const isOpen = useRef(false);
  const [overlay, setOverlay] = useState(false);
  /** 每一行自己的「关上」函数。注册进 activeCloser 的那个就是用这个 */
  const closer = useRef<() => void>(() => {});

  const animateTo = useCallback(
    (target: number, onDone?: () => void) => {
      Animated.timing(offset, {
        toValue: target,
        // 减少动效时不做位移：直接把位置放过去。这一处不能省成「不生效」——
        // 位置本身就是功能（按钮露不露出来）
        duration: reduceMotion ? 0 : theme.motion.fast,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => onDone?.());
      // target 是 offset 的值（负数），live 存正数
      live.current = Math.abs(target);
    },
    [offset, reduceMotion, theme.motion.fast]
  );

  const close = useCallback(() => {
    isOpen.current = false;
    setOverlay(false);
    animateTo(0);
    if (activeCloser === closer.current) activeCloser = null;
  }, [animateTo]);

  closer.current = close;

  // 卸载时把自己从「开着的那一行」里摘掉
  useEffect(() => {
    return () => {
      if (activeCloser === closer.current) activeCloser = null;
    };
  }, []);

  /*
   * 第一次的「推开一下」。
   *
   * 只在第一张卡上、整个进程只播一次、reduce_motion 时不播——
   * 它本质上是一个教学动作，而不是装饰，所以它应该短暂、可错过、
   * 而且绝不在用户第二次打开这一页时重播。
   */
  useEffect(() => {
    if (!peek || peekedInThisSession || reduceMotion) return;
    peekedInThisSession = true;
    const timer = setTimeout(() => {
      // 这 420ms 里用户可能已经自己滑过（或者干脆点开了「删」）。
      // 那时候再推一下就是把他的动作盖掉，所以直接放弃这一次提示
      if (isOpen.current || live.current !== 0) return;
      Animated.sequence([
        Animated.timing(offset, {
          toValue: -12,
          duration: theme.motion.slow,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(offset, {
          toValue: 0,
          duration: theme.motion.slow,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }, 420);
    return () => clearTimeout(timer);
  }, [offset, peek, reduceMotion, theme.motion.slow]);

  const open = useCallback(() => {
    // 先把别的那一行关上。它是开着的、而用户滑开了这一行，
    // 说明他要对这一行动手
    if (activeCloser && activeCloser !== closer.current) activeCloser();
    activeCloser = closer.current;
    isOpen.current = true;
    setOverlay(true);
    animateTo(-ACTION_WIDTH);
  }, [animateTo]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        /*
         * 只接管「明显是横着划」的手势。
         *
         * 判据三条，缺一条都会出问题：
         *   1. 横向位移 > 8（CLAIM_DX）：滤掉落指抖动；
         *   2. 横向明显大于纵向（CLAIM_RATIO）：斜着划的时候让 ScrollView 走，
         *      否则上下滚列表会时不时被某一行吃掉；
         *   3. 方向对：关着的时候只认左滑（露出右边的「删」）；
         *      开着的时候只认右滑（把它推回去）。
         */
        onMoveShouldSetPanResponder: (_e, g) => {
          const horizontal = Math.abs(g.dx) > CLAIM_DX && Math.abs(g.dx) > Math.abs(g.dy) * CLAIM_RATIO;
          if (!horizontal) return false;
          // 开着的时候只认右滑（把它推回去）；关着的时候只认左滑
          if (isOpen.current) return g.dx > 0;
          return g.dx < 0;
        },
        onPanResponderGrant: () => {
          base.current = live.current;
          offset.stopAnimation((value) => {
            // value 是负数（或 0），统一取绝对值存进 live
            base.current = Math.abs(value);
            live.current = Math.abs(value);
          });
        },
        onPanResponderMove: (_e, g) => {
          // 左滑时 g.dx 是负的，所以这里要取反再算位移。
          // `raw` 的含义统一成「已经推开了多少」（0 … ACTION_WIDTH）
          const raw = base.current - g.dx;
          // 拖过 84 之后加阻尼：手指不会「拽断」这一行，
          // 同时又能感觉到「已经到底了」
          const next =
            raw <= 0 ? 0 : raw <= ACTION_WIDTH ? raw : ACTION_WIDTH + (raw - ACTION_WIDTH) * 0.22;
          offset.setValue(-next);
          live.current = next;
        },
        onPanResponderRelease: () => {
          // 过了一半就算开。用位移比例而不是速度：手写的 PanResponder
          // 拿不到可靠的速度，而「推过一半」是最直观的那条线
          if (live.current > ACTION_WIDTH * 0.45) {
            open();
          } else {
            close();
          }
        },
        onPanResponderTerminate: () => {
          // 被 ScrollView 抢走（斜着划）：回到原来的状态，不留一个半开的卡片
          if (isOpen.current) open();
          else close();
        },
      }),
    [close, open, offset]
  );

  return (
    <Card
      padding={0}
      // overflow: hidden 让「删」这块红底被卡片的圆角裁掉，
      // 也保证卡片滑出去时不会盖住相邻的那一行
      style={[{ overflow: 'hidden', marginBottom }, style]}
    >
      {/*
       * 红底 + 「删」。它一直在下面待着，卡片往左滑就露出来。
       *
       * 文字用「删」不用垃圾桶图标：这里没有图标库，而一个汉字比
       * 手画的垃圾桶稳（与 TaskRow / TodoCard 早先那个按钮同一判断）。
       */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`删除 ${title}`}
        onPress={() => {
          // 先把卡片收回去，再问那句「删掉？」。不收的话，确认框弹在
          // 一张半开的卡片上，取消之后那一行还开着——看起来像刚才点失败了
          close();
          onDelete();
        }}
        style={({ pressed }) => ({
          position: 'absolute',
          // 左滑露出右边，所以红底贴右边（D65）
          right: 0,
          top: 0,
          bottom: 0,
          width: ACTION_WIDTH,
          backgroundColor: palette.danger,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontSize: theme.typography.size.label,
            lineHeight: theme.typography.lineHeight.label,
            color: palette.onPrimary,
            fontFamily: theme.typography.fontFamily.body,
            fontWeight: theme.typography.weight.medium,
          }}
        >
          删
        </Text>
      </Pressable>

      <Animated.View
        {...panResponder.panHandlers}
        /*
         * 读屏用户摸不到「左滑」，所以这里挂一个**自定义无障碍动作**。
         *
         * 没有它，这个 App 的删除功能对读屏用户就是完全关着的——
         * 左滑是纯手势，TalkBack 不会替他们滑。
         *
         * 动作名用系统认识的 'delete'（TalkBack 会念成「删除」），
         * 而不是自造的字符串：自造的名字在某些读屏里只会念成一串英文。
         *
         * `accessibilityRole` 用 'button' 而不是 'none'：读屏要有一个可聚焦的
         * 节点才谈得上对它做动作。卡片本身不可点这件事，用
         * `accessibilityState` 表达不出来，所以靠 accessibilityLabel 说清楚。
         */
        accessibilityRole="button"
        accessibilityLabel={`${title}，可以删除`}
        accessibilityActions={[{ name: 'delete', label: '删除' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName !== 'delete') return;
          close();
          onDelete();
        }}
        style={{
          // 内容自己要有底色，否则红底会透上来
          backgroundColor: palette.surface,
          transform: [{ translateX: offset }],
        }}
      >
        {children}
      </Animated.View>

      {/*
       * 开着的时候盖一层透明的「点一下就关」。
       *
       * 不加这一层的话，卡片开着时手指落在勾选圈上会记一笔——
       * 而用户那一下的本意是「别删，我只是想把它推回去」。
       */}
      {overlay ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="收起删除"
          onPress={close}
          // 只盖住卡片本体，不盖右边那个「删」。盖满的话，
          // 手指按在「删」上会先打到这一层——删除按钮就永远点不到
          style={{ position: 'absolute', left: 0, top: 0, right: ACTION_WIDTH, bottom: 0 }}
        />
      ) : null}
    </Card>
  );
}
