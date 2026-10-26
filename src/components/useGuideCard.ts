import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';

import type { GuideCard } from '../domain/guide';
import { getGuideState } from '../services/guide';

/**
 * D1–D7 引导卡的取用接口。
 *
 * ---- 为什么「哪一页显示第几张」由页面自己声明 ----
 *
 * 七张卡分别属于不同的页面（D3 是目标、D5 是我的，其余在今天）。
 * 如果做成「一张全局浮层」，那它就要自己判断当前在哪一页，
 * 于是会出现「在目标页弹 D5」这种错位，而且浮层会挡住内容。
 * 让每页说「我负责第几天」，关系是静态的、一眼能看全：
 *
 *   今天页  → 1, 2, 4, 6, 7
 *   目标页  → 3
 *   我的页  → 5
 *
 * ---- 为什么「今天已经展示过第几天」存在模块级变量里 ----
 *
 * 它不能存库（见 `domain/guide.ts` 文件头：多一列就多一条迁移 + 一处备份白名单），
 * 也不能只存在组件里：用户从今天页切到目标页再切回来，组件会重挂，
 * 那时同一张卡会再出现一次。模块级变量在进程存活期间一直在，
 * 正好是我们要的粒度——**App 被杀掉之后重看一次同一张卡是可以接受的**。
 */
let shownDayThisSession: number | null = null;

/**
 * 一张引导卡属于哪一页。顺序与 domain/guide.ts 的 GUIDE_CARDS 对应。
 *
 * `goals` 现在指的是二级页 `app/goals/index.tsx`（D48 把目标从 tab 降级），
 * 不是底栏的某一格。D3 仍然挂在那里：那张卡说的是「目标是长期方向」，
 * 用户正看着目标列表时读它才成立。
 */
export const GUIDE_HOST = {
  today: [1, 2, 4, 6, 7],
  goals: [3],
  me: [5],
} as const;

export interface UseGuideCardResult {
  /** 这一页现在该显示的卡。null 表示不显示 */
  card: GuideCard | null;
  /** 关掉这一张（今天不再出现） */
  dismiss: () => void;
  /** 执行主按钮的动作。card.action 为 null 时什么也不做 */
  runAction: () => void;
}

/**
 * @param hostDays 这一页负责第几天。传 `GUIDE_HOST.today` 之类
 */
export function useGuideCard(hostDays: readonly number[]): UseGuideCardResult {
  const router = useRouter();
  /**
   * 只用来触发重渲染：真正的「已展示过第几天」在模块级变量里。
   * 初始值取模块变量，这样切回本页时不会把已经看过的卡再画一遍。
   */
  const [shown, setShown] = useState<number | null>(shownDayThisSession);

  /*
   * 每次渲染都读一次（不放进 state）：
   * 它依赖「今天」，而「今天」会在跨过日界时变化。
   * 这个读操作是几次同步的 SQLite 查询，首页本来每帧就要做一次同样的量。
   */
  const state = React.useMemo(
    () => getGuideState(shownDayThisSession),
    // shown 变了要重算（关掉之后 card 应该变成 null）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown]
  );

  const card =
    state.card && hostDays.includes(state.card.day) && shown !== state.day
      ? state.card
      : null;

  const dismiss = useCallback(() => {
    const day = getGuideState(shownDayThisSession).day;
    if (day === null) return;
    shownDayThisSession = day;
    setShown(day);
  }, []);

  const runAction = useCallback(() => {
    const current = getGuideState(shownDayThisSession).card;
    // 点了主动作也算「看过这一张」：否则回到本页还会看到同一个按钮
    const day = getGuideState(shownDayThisSession).day;
    if (day !== null) {
      shownDayThisSession = day;
      setShown(day);
    }

    switch (current?.action) {
      case 'new-todo':
        router.push('/tasks/new');
        break;
      case 'new-goal':
        router.push('/goals/new');
        break;
      case 'open-me':
        router.push('/me');
        break;
      case 'open-status':
        router.push('/status');
        break;
      case 'open-review':
        router.push('/review');
        break;
      default:
        // 没有动作：什么也不做（按钮不会画出来）
        break;
    }
  }, [router]);

  return { card, dismiss, runAction };
}
