/**
 * 打卡服务层
 *
 * 这一层回答的是「一次打卡要做哪些事」，而不是「这次该发多少分」。
 * 奖励计算在 domain/score.ts（纯函数），单表读写在各 repo，这里只负责编排：
 *
 *   读设置与玩家 → 算分 → 写事实行 → 写回玩家快照 → 收尾（待办置完成）
 *
 * 为什么单独一层，而不塞进 repo：
 * - repo/checkins.ts 的头注释写明「这一层不做任何奖励计算」；
 * - 如果放在那里，它就要 import tasks / player / settings 三个 repo，
 *   仓库之间开始互相依赖，以后很容易出现循环引用；
 * - 「跨表、且必须同生共死」这类操作只应该出现在一个地方，事务边界才好找。
 *
 * 分层：app → services → db → domain。
 */
import { runInTransaction } from '../db/client';
import {
  getActiveCheckin,
  getCheckinById,
  getDailyEmberTotal,
  getDailyXpTotal,
  insertCheckinFromDraft,
  listActiveCheckinDates,
  reverseCheckin,
  type Checkin,
} from '../db/repo/checkins';
import {
  getPlayerSnapshot,
  replaceAttributes,
  updatePlayer,
  type AttributeMap,
  type PlayerSnapshot,
} from '../db/repo/player';
import { getSettings } from '../db/repo/settings';
import { getTaskById, toScorable, updateTaskStatus } from '../db/repo/tasks';
import {
  LEVEL_UP_EMBER_REWARD,
  levelFromTotalXp,
  regressAttribute,
} from '../domain/balance';
import { diffDays, effectiveToday } from '../domain/date';
import { isScheduledOn, weekRange } from '../domain/recurrence';
import {
  computeScore,
  SCORE_ERROR_MESSAGE,
  type CapInfo,
  type LevelUpInfo,
  type ScoreErrorCode,
} from '../domain/score';

/**
 * 服务层的错误码 = 算分能给出的错误 + 编排层才会遇到的错误。
 *
 * 分开命名的意义：界面只有一个提示位，但排查时需要知道
 * 「是被算分拒绝了」还是「这条记录压根找不到」。
 */
export type CheckinErrorCode =
  | ScoreErrorCode
  | 'NOT_SCHEDULED'
  | 'CHECKIN_NOT_FOUND'
  | 'ALREADY_REVERSED'
  | 'DAY_ALREADY_SETTLED'
  | 'UNSUPPORTED';

/**
 * 错误码 → 中性中文提示。
 *
 * 算分那几条直接沿用 domain/score.ts 的文案（同一份，不复制），
 * 这里只补编排层新增的。全部避开禁用词：不说「失败」，不说「必须」。
 */
export const CHECKIN_ERROR_MESSAGE: Record<CheckinErrorCode, string> = {
  ...SCORE_ERROR_MESSAGE,
  NOT_SCHEDULED: '这一项今天不在安排里。',
  CHECKIN_NOT_FOUND: '没有找到这一次记录。',
  ALREADY_REVERSED: '这一次已经撤销过了。',
  DAY_ALREADY_SETTLED: '这一天已经结算过了，改不了了。',
  UNSUPPORTED: '这一项暂时还不能这样处理。',
};

/** 打卡成功后返回给界面的东西 */
export interface ScoreTaskSuccess {
  ok: true;
  /** 刚落库的事实行 */
  checkin: Checkin;
  /** 写回之后的玩家快照 */
  player: PlayerSnapshot;
  /** 本次实际发放量，界面直接拿去播动画 */
  awarded: { xp: number; ember: number; attrXp: number };
  levelUp: LevelUpInfo;
  cap: CapInfo;
}

/** 打卡被拒绝。没有任何写操作发生 */
export interface ScoreTaskFailure {
  ok: false;
  code: CheckinErrorCode;
  message: string;
}

export type ScoreTaskResult = ScoreTaskSuccess | ScoreTaskFailure;

/** 撤销成功后返回的东西 */
export interface UndoCheckinSuccess {
  ok: true;
  /** 被标记为 reversed 的那一行 */
  checkin: Checkin;
  player: PlayerSnapshot;
  /** 扣回明细。界面不一定要显示，但排查时很有用 */
  losses: { xp: number; ember: number; levels: number; attrXp: number };
}

export type UndoCheckinResult = UndoCheckinSuccess | ScoreTaskFailure;

export interface ScoreTaskInput {
  taskId: string;
  /** 要打卡的业务日。不传就是今天 */
  targetDate?: string;
  /** manual = 今天当场记；backfill = 补记过去某天 */
  source?: 'manual' | 'backfill';
  /** 真实时间戳。默认 Date.now()，测试与补记时可以从外面传 */
  nowMs?: number;
}

export interface UndoCheckinInput {
  /** 二选一：直接给打卡 id，或给 taskId + localDate */
  checkinId?: string;
  taskId?: string;
  localDate?: string;
  /** 撤销原因，只写进库供以后排查，不上界面 */
  reason?: string | null;
  nowMs?: number;
}

/**
 * 这一天还能不能撤销。
 *
 * 规则（docs/04 §5.3）：只能撤销「尚未结算」的业务日，即 `localDate >= lastSettledDate`。
 * 注意 diffDays(a, b) 返回的是 b - a，所以判断方向是
 * `diffDays(localDate, lastSettled) <= 0`——写成反过来会把该允许的拒掉。
 *
 * lastSettled 为空表示还没结算过任何一天，全部可撤销。
 */
export function canUndoCheckin(localDate: string, lastSettledDate: string | null): boolean {
  if (!lastSettledDate) return true;
  return diffDays(localDate, lastSettledDate) <= 0;
}

/**
 * 完成一次打卡。
 *
 * 全部写操作在同一个事务里（docs/04 §5.1）：写打卡 + 改玩家 + 待办置完成，
 * 三件事要么都成，要么都不成。（D55 起待办不再从前端发起算分，
 * 这一步只对「目标页挂上来的任务」与「导入的旧数据」有效。）中途抛错时 expo-sqlite 自动回滚，
 * 不会留下「打卡记上了但经验没加」这种半截状态。
 */
export function scoreTask(input: ScoreTaskInput): ScoreTaskResult {
  return runInTransaction(() => {
    const nowMs = input.nowMs ?? Date.now();

    // ---------- 1. 设置与业务日 ----------
    const settings = getSettings();
    const dayStartHour = settings.day_start_hour;
    // 用 effectiveToday 而不是 businessDate：系统时间被调回过去时，
    // 业务日只能前进不能倒退（docs/03 §4.4），读和写必须用同一个口径
    const { today } = effectiveToday(nowMs, dayStartHour, settings.last_settled_date);
    const targetDate = input.targetDate ?? today;
    const source = input.source ?? 'manual';

    // ---------- 2. 任务 ----------
    const task = getTaskById(input.taskId);
    if (!task) {
      return fail('TASK_NOT_FOUND');
    }

    // ---------- 3. 排期 ----------
    // 「今天该不该出现」是 recurrence.ts 的判断，不是算分的事。
    // weekly_times 需要知道本周已经做了几次，否则额度用完后仍然会算成可做。
    let weeklyDone = 0;
    if (task.recurrence === 'weekly_times') {
      const range = weekRange(targetDate, settings.week_starts_on);
      weeklyDone = listActiveCheckinDates(range.end).filter(
        (pair) =>
          pair.taskId === task.id && pair.localDate >= range.start && pair.localDate <= range.end
      ).length;
    }

    if (!isScheduledOn(task, targetDate, settings.week_starts_on, weeklyDone)) {
      return fail('NOT_SCHEDULED');
    }

    // ---------- 4. 算分需要的现场 ----------
    const player = getPlayerSnapshot();
    // 按「有效记录」数：撤销后重新记一次必须能通过校验
    const todayCount = getActiveCheckin(task.id, targetDate) ? 1 : 0;

    const result = computeScore({
      task: toScorable(task),
      player: {
        id: player.id,
        level: player.level,
        xpTotal: player.xpTotal,
        xpInLevel: player.xpInLevel,
        highestLevel: player.highestLevel,
        ember: player.ember,
        attributes: player.attributes,
      },
      targetDate,
      today,
      nowMs,
      source,
      difficulty: settings.difficulty,
      dayStartHour,
      todayCount,
      todayXp: getDailyXpTotal(targetDate),
      todayEmber: getDailyEmberTotal(targetDate),
    });

    // 被拒绝时直接返回：事务里一个字都没写，空提交
    if (!result.ok) {
      return { ok: false as const, code: result.code, message: result.message };
    }

    // ---------- 5. 写事实行 ----------
    // insertCheckinFromDraft 会自己补 playerId 与 scoreCount，调用方不用关心
    const checkin = insertCheckinFromDraft(result.checkin);

    // ---------- 6. 写回玩家快照 ----------
    updatePlayer({
      xpTotal: result.player.xpTotal,
      xpInLevel: result.player.xpInLevel,
      level: result.player.level,
      highestLevel: result.player.highestLevel,
      ember: result.player.ember,
    });
    replaceAttributes(result.player.attributes);

    /*
     * ---------- 7. 待办收尾（D55 之后是死代码，但留着） ----------
     *
     * 首页已经不再给待办算分（D55：待办没有完成态、不发 XP），
     * 所以从今天页走到这里的 todo 永远不会出现。
     *
     * **但不能删。** 还有两条路能进来：
     *   1. 目标详情页挂上来的任务，如果它 type 是 todo，别处仍可能调 scoreTask；
     *   2. 导入回来的旧备份里可能带着「待办 + 已打卡」的组合。
     *
     * 删掉这段的后果是：一条被算过分的待办停在 status='active'，
     * 首页照常列着它，而它其实已经有打卡了——点删除、点勾选都对不上账。
     *
     * 保留它的代价是「一处没人走的代码」，所以上面这几行注释是它的墓碑。
     */
    if (task.type === 'todo') {
      updateTaskStatus(task.id, 'done');
    }

    return {
      ok: true as const,
      checkin,
      player: getPlayerSnapshot(),
      awarded: result.awarded,
      levelUp: result.levelUp,
      cap: result.cap,
    };
  });
}

/**
 * 撤销一次打卡，并**扣回**本次发的奖励。
 *
 * 为什么必须扣回：撤销的语义是「这一次不算数」。如果只把记录标成作废、
 * 奖励留着，那每撤销一次就白拿一次 XP 和余烬，等级和五维会越刷越高。
 *
 * 重算顺序不能调换：先读旧快照，一次算出全部新值再写回。
 * 如果写成「先改 xpTotal，再读 player 算等级」，读到的是改过的新值，等级会算错。
 */
export function undoCheckin(input: UndoCheckinInput): UndoCheckinResult {
  return runInTransaction(() => {
    // input.nowMs 目前没有用处：reversed_at 由 reverseCheckin 自己取当前时间。
    // 保留这个参数是为了补记与测试，签名先固定下来。

    // ---------- 1. 找到这条事实 ----------
    const checkin = input.checkinId
      ? getCheckinById(input.checkinId)
      : input.taskId && input.localDate
        ? getActiveCheckin(input.taskId, input.localDate)
        : null;

    if (!checkin) return fail('CHECKIN_NOT_FOUND');
    // 幂等：已经撤销过的直接告诉调用方，不重复扣分
    if (checkin.status !== 'active') return fail('ALREADY_REVERSED');

    // ---------- 2. 结算保护 ----------
    const settings = getSettings();
    if (!canUndoCheckin(checkin.localDate, settings.last_settled_date)) {
      return fail('DAY_ALREADY_SETTLED');
    }

    const task = getTaskById(checkin.taskId);

    // 奖励兑换（用余烬换东西）的撤销要退还余烬，规则与打卡不同；
    // v0.1 的界面不会产生这类记录，与其算错不如明确拒绝
    if (task?.type === 'reward') return fail('UNSUPPORTED');

    // ---------- 3. 标记事实行（不删除，保留审计） ----------
    reverseCheckin(checkin.id, input.reason ?? null);

    // ---------- 4. 先算出全部新值，再一次性写回 ----------
    const player = getPlayerSnapshot();

    const xpAfter = Math.max(0, player.xpTotal - checkin.xpAwarded);
    const levelBefore = levelFromTotalXp(player.xpTotal).level;
    const levelAfterInfo = levelFromTotalXp(xpAfter);
    const levelsLost = Math.max(0, levelBefore - levelAfterInfo.level);

    // 升级余烬没有写进 checkins 行（它不是一个「奖励项目」，是等级变化的附属品），
    // 所以这里必须按「这次撤销掉了几个等级」反推。
    // 少了这一步就留下一条刷余烬的路：打卡升级 +10 → 撤销不回退 → 再打卡再 +10。
    const levelEmberToTakeBack = levelsLost * LEVEL_UP_EMBER_REWARD;
    const emberAfter = Math.max(
      0,
      player.ember - checkin.emberAwarded - levelEmberToTakeBack
    );

    const attrs: AttributeMap = {
      body: { ...player.attributes.body },
      mind: { ...player.attributes.mind },
      order: { ...player.attributes.order },
      spirit: { ...player.attributes.spirit },
      bond: { ...player.attributes.bond },
    };
    const before = attrs[checkin.attrKey];
    const regression = regressAttribute(before.xp, before.points, checkin.attrXpAwarded);
    attrs[checkin.attrKey] = { xp: regression.xp, points: regression.points };

    updatePlayer({
      xpTotal: xpAfter,
      xpInLevel: levelAfterInfo.inLevel,
      level: levelAfterInfo.level,
      // 刻意不传 highestLevel：历史最高是「你走到过哪儿」，撤销一次不该抹掉。
      // 也不用 setLevelState —— 它会顺手把 highest 抬高，那不是这里的语义。
      ember: emberAfter,
    });
    replaceAttributes(attrs);

    /*
     * ---------- 5. 待办重新打开（D55 之后是死代码，理由同上） ----------
     *
     * 撤销一条被算过分的待办时，把它从 'done' 放回 'active'，
     * 否则它会永远从首页消失、而用户没有任何入口能把它找回来。
     *
     * 只在「它确实因此被关掉」时重开：如果这之后又记过一次（理论上不会，
     * 同一天同一任务只有一条有效记录，但导入的数据可能不守规矩），别动它。
     */
    if (task && task.type === 'todo' && task.status === 'done') {
      const other = getActiveCheckin(task.id, checkin.localDate);
      if (!other) updateTaskStatus(task.id, 'active');
    }

    return {
      ok: true as const,
      checkin: getCheckinById(checkin.id)!,
      player: getPlayerSnapshot(),
      losses: {
        xp: checkin.xpAwarded,
        ember: checkin.emberAwarded + levelEmberToTakeBack,
        levels: levelsLost,
        attrXp: checkin.attrXpAwarded,
      },
    };
  });
}

/** 便利函数：按「任务 + 业务日」撤销。界面长按已完成的行走这条 */
export function undoCheckinByTaskDate(
  taskId: string,
  localDate: string,
  reason: string | null = null,
  nowMs?: number
): UndoCheckinResult {
  return undoCheckin({ taskId, localDate, reason, nowMs });
}

/** 组装一条失败结果，避免每个分支重复写三行 */
function fail(code: CheckinErrorCode): ScoreTaskFailure {
  return { ok: false, code, message: CHECKIN_ERROR_MESSAGE[code] };
}
