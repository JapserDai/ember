/**
 * 头像的读写流程：挑一只、存下来
 *
 * ---- 为什么这一层只剩两个函数 ----
 *
 * 上一版这里是「选图 → 缩放 → 编码 → 落库」的异步流水线：要动态加载
 * expo-image-picker / expo-image-manipulator / expo-file-system 三个包，
 * 要按能力探测两套 manipulator API，还要把四五种失败翻译成人话。
 *
 * 现在头像是一个七选一的常量 id，整套流水线都不需要了：
 * 没有图片、没有异步、没有权限、没有失败路径。**能删的复杂度就删掉**，
 * 留着一段「也许以后还用得上」的代码，比删掉它更贵——
 * 它每次升级 SDK 都要重新验证一遍，而它已经不为任何用户服务了。
 *
 * 剩下的两件事：
 *   1. 把用户挑中的 id 写进库（`updateAvatar`）；
 *   2. 失败时说一句人话，而不是把异常抛给页面（`chooseAvatar`）。
 *
 * 为什么还要包一层，不直接让页面调 `updateAvatar`：
 * 页面要的是「成功 → 换界面 / 失败 → 弹一句」，而不是 try/catch。
 * 把 try/catch 收在这里，页面里就不会出现第三、第四种处理方式。
 */
import {
  getPlayerSnapshot,
  updateAvatar as writeAvatarId,
  type PlayerSnapshot,
} from '../db/repo/player';
import { normalizeAvatarId } from '../domain/avatar';

/**
 * 一次换头像的结果。
 *
 * 失败时返回 ok: false + 一句人话，而不是抛错：
 * 换头像不是关键路径，页面要的是「提示一下、别的都不变」。
 * 形状与 services/profile.ts 的 SaveResult 一致——同一个 App 里
 * 两种结果类型会让人以为它们的失败语义不同。
 */
export type AvatarActionResult =
  | { ok: true; snapshot: PlayerSnapshot }
  | { ok: false; message: string };

/** 失败文案。集中放这里，方便以后统一改成产品的语气 */
const MESSAGES = {
  saveFailed: '存不下来，头像没有变。',
} as const;

/**
 * 挑一只头像并落库。
 *
 * @param id 用户选中的头像 id。不认识的值会退回默认的狐狸（normalizeAvatarId）
 *
 * 先把库写成功再返回新快照：写失败时界面不该先变，否则用户以为换好了，
 * 下次打开却变回去。
 */
export function chooseAvatar(id: string): AvatarActionResult {
  try {
    writeAvatarId(normalizeAvatarId(id));
    // 写完之后重新读一遍快照，而不是在内存里拼一个：
    // 快照里还有等级、余烬等字段，拼一个假的会让「我的」页读到过期数据
    return { ok: true, snapshot: getPlayerSnapshot() };
  } catch (err) {
    console.warn('[Ember] 存头像失败', err);
    return { ok: false, message: MESSAGES.saveFailed };
  }
}

/**
 * 面板里左右走的那两个箭头由 `domain/avatar.ts` 的 `stepAvatar` 算，
 * 这里**不再转出一遍**。同一个函数有两个 import 路径的话，
 * 后来的人就会从两处分别引，而“到底该从哪引”会变成一个新问题。
 */
