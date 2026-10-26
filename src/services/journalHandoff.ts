/**
 * 「打开某一天的日记」—— 从目录页（`app/journal/history.tsx`）交回日记页的一件事。
 *
 * ---- 为什么不是路由参数 ----
 *
 * 直觉写法是 `router.push({ pathname: '/journal', params: { day } })`，
 * 日记页读 `day` 参数。这条路的坑在**参数会一直留在那个 tab 上**：
 *
 *   - tab 的 params 是持久化的，不像 push 出来的新页面那样随页面销毁；
 *   - React Navigation 的 `setParams` 是**浅合并**，传 `undefined` 删不掉这个键
 *     （`useLocalSearchParams` 的注释里写明了这一点），所以没有「用完清掉」的写法；
 *   - 结果是：点过一次 2024-03-05，以后每次切回日记 tab 都会重新打开那一天——
 *     而用户早就不记得自己点过什么了。
 *
 * 用 ref 记住「已经消费过」也不行：同一天点第二次时参数值没变，
 * 会被当成旧请求吞掉。
 *
 * ---- 所以：一次性请求，取走即清空 ----
 *
 * 与 `services/maintenance.ts` 里「攒着的话」同一个思路：模块级的一个格子，
 * 放进去、取走、清空。日记页每次聚焦都会取一次（它本来就在聚焦时重读数据库），
 * 取到就打开那一天，取不到就照常显示今天。
 *
 * 这个文件只有十来行、没有 React、没有数据库，仓库外那套 Node 测试能直接 import。
 */

/** 待打开的日期（业务日 YYYY-MM-DD）。null = 没有请求 */
let pendingDay: string | null = null;

/** 目录页点了一天：记下来，随后调用方自己 back / replace 回日记页 */
export function requestJournalDay(localDate: string): void {
  pendingDay = localDate;
}

/**
 * 日记页取走请求。
 *
 * **取走即清空**：同一天点两次也能生效（第二次是新的请求），
 * 而切 tab 回来时不会重放上一次的请求。
 */
export function takeJournalDay(): string | null {
  const day = pendingDay;
  pendingDay = null;
  return day;
}
