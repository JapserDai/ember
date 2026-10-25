/**
 * Ember 数据层 · streak_bridges 仓库（宽限券与修复的桥接日）
 *
 * ---- 这张表存的是什么 ----
 *
 * 一行 = 「这一天算作有记录」，但它**没有打卡**。
 * 两种来源：
 *   - `grace`  宽限券自动桥接（每月几张，用完就没有）
 *   - `repair` 用户花余烬买的修复
 *
 * 它不发任何奖励：没有 XP、没有余烬、没有五维。它的唯一作用是让
 * `domain/streak.ts` 的 `summarizeDates()` 知道「这一段没断」。
 *
 * ---- 为什么这一层这么薄 ----
 *
 * 按分层规矩，repo 只做单表读写，互相不 import，也不做业务判断。
 * 「什么时候该用宽限券」「修复要花多少」全部在 domain 与 services 里。
 * 这里只有「读出来 / 写进去 / 删掉」。
 */
import { getDb } from '../client';
import type { BridgeDay } from '../../domain/streak';

/** 表的一行，字段名与数据库列一一对应 */
export interface StreakBridgeRow {
  local_date: string;
  kind: 'grace' | 'repair';
  ember_spent: number;
  material_spent: number;
  gap_start: string | null;
  gap_end: string | null;
  created_at: number;
}

/** 写入一条桥接记录时需要的东西 */
export interface NewBridge {
  localDate: string;
  kind: 'grace' | 'repair';
  /** 花掉的余烬。宽限券传 0 */
  emberSpent?: number;
  /** 花掉的材料。宽限券传 0 */
  materialSpent?: number;
  /** 这次修复覆盖的缺口起止（含）。宽限券可以传 null */
  gapStart?: string | null;
  gapEnd?: string | null;
}

/**
 * 读出全部桥接日（按日期升序）。
 *
 * 不带过滤条件：桥接日一年也就几十条（宽限券每月 0–3 张，修复是偶发动作），
 * 全量读进来比在 SQL 里算区间更简单，而且调用方（summarizeDates）本来就要
 * 一整份日期集合来扫连续区间。
 *
 * 读失败时**抛错**：静默返回空数组会让连胜看起来比真实值短，
 * 而用户会以为自己的记录丢了。让界面去决定怎么兜底。
 */
export function listBridges(): StreakBridgeRow[] {
  return getDb().getAllSync<StreakBridgeRow>(
    `SELECT local_date, kind, ember_spent, material_spent, gap_start, gap_end, created_at
       FROM streak_bridges
      ORDER BY local_date ASC`
  );
}

/**
 * 只取「算数的那一天」这一个字段，给 domain 层用。
 *
 * 与 `listBridges()` 分开是因为 `BridgeDay` 只需要日期与种类，
 * 而 domain 不该拿到 `ember_spent` 这类库字段——它不该关心钱。
 */
export function listBridgeDays(): BridgeDay[] {
  return listBridges().map((row) => ({
    date: row.local_date,
    kind: row.kind === 'repair' ? 'repair' : 'grace',
  }));
}

/** 某一天有没有桥接记录 */
export function getBridge(localDate: string): StreakBridgeRow | null {
  const row = getDb().getFirstSync<StreakBridgeRow>(
    `SELECT local_date, kind, ember_spent, material_spent, gap_start, gap_end, created_at
       FROM streak_bridges
      WHERE local_date = ?`,
    [localDate]
  );
  return row ?? null;
}

/**
 * 写入一条桥接记录。
 *
 * 用 `INSERT OR REPLACE` 而不是普通 INSERT：
 * 同一天被宽限过又被修复过（或反过来）时，后一次应该覆盖前一次，
 * 而不是撞主键抛错。这种情况罕见但真实——用户在宽限日之后才发现
 * 自己那天其实想修，而修复会把整段缺口都补上。
 *
 * 覆盖时 `ember_spent` 取**两次之和**？不。取后一次的记录，
 * 因为余额在 services 层已经真的扣过两次了，这里只记「这一行现在归谁管」。
 * 花钱的审计由 services 层的日志负责。
 */
export function upsertBridge(bridge: NewBridge): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO streak_bridges
       (local_date, kind, ember_spent, material_spent, gap_start, gap_end, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      bridge.localDate,
      bridge.kind,
      Math.max(0, Math.trunc(bridge.emberSpent ?? 0)),
      Math.max(0, Math.trunc(bridge.materialSpent ?? 0)),
      bridge.gapStart ?? null,
      bridge.gapEnd ?? null,
      Date.now(),
    ]
  );
}

/**
 * 批量写入一次修复覆盖的整段缺口。
 *
 * 一次修复补的是**整段**空档（docs/04 §7.3「一次修复覆盖整个断签缺口」），
 * 所以 gapDates 里的每一天都要各写一行——连胜是逐日连续性算的，
 * 少写一天就少连一天。
 *
 * 调用方负责把它包在事务里（services 层），这里只管写。
 */
export function insertRepairGap(
  gapDates: readonly string[],
  cost: { ember: number; material: number }
): number {
  if (gapDates.length === 0) return 0;

  const gapStart = gapDates[0];
  const gapEnd = gapDates[gapDates.length - 1];

  for (const date of gapDates) {
    upsertBridge({
      localDate: date,
      kind: 'repair',
      // 成本只记在缺口的**第一天**上：一天一行都记一遍的话，
      // 「这次修复花了多少」要靠求和才读得出来，而多写几遍很容易变成
      // 「花了几倍的余烬」的错觉。第一行是这次修复的主记录。
      emberSpent: date === gapStart ? cost.ember : 0,
      materialSpent: date === gapStart ? cost.material : 0,
      gapStart,
      gapEnd,
    });
  }

  return gapDates.length;
}

/**
 * 删掉某一天的桥接。
 *
 * 只有一个场景用它：撤销修复（这一版没做界面入口，但纯函数留着，
 * 因为「修复买错了」是必然会发生的诉求，而删一行是最小实现）。
 */
export function deleteBridge(localDate: string): void {
  getDb().runSync('DELETE FROM streak_bridges WHERE local_date = ?', [localDate]);
}

/** 本月用掉的宽限券日期（给 domain 的 graceRemaining 用） */
export function listGraceDates(): string[] {
  return getDb()
    .getAllSync<{ local_date: string }>(
      `SELECT local_date FROM streak_bridges WHERE kind = 'grace' ORDER BY local_date ASC`
    )
    .map((row) => row.local_date);
}
