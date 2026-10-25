/**
 * 人物资料：保存名字与自我介绍
 *
 * 为什么要有这一层：
 *   规则在 domain/profile.ts（纯函数），落库在 db/repo/player.ts（同步）。
 *   页面如果两边各调一次，就会出现「校验用的是 A 规则、写库用的是 B 规则」
 *   这种只有边界上才暴露的问题。收在一个函数里，页面只关心结果。
 *
 * 与头像（services/avatar.ts）分开：
 *   头像是一个七选一的 id，写一次就完了；名字与简介要走校验、要数码点。
 *   两者没有共用的规则，放在一个文件里只会让「改个名字」也翻一遍头像代码。
 */
import { updateBio, updateDisplayName } from '../db/repo/player';
import { checkBio, checkName } from '../domain/profile';

/**
 * 一次保存的结果。
 *
 * 与 AvatarActionResult 同一套形状（ok / message），
 * 页面可以用同一段逻辑处理两种结果，不用写两遍 if。
 */
export type ProfileSaveResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * 保存名字。
 *
 * 校验通过才写库——写失败时界面不该先变（和换头像同一条规矩）。
 * 返回值里不带新快照：调用方手里已经有要保存的值，重新读一遍库只会
 * 多一次 IO，还会在「库写成功但读失败」时给出一个空值。
 */
export function saveName(raw: string): ProfileSaveResult {
  const check = checkName(raw);
  if (!check.ok) {
    return { ok: false, message: check.reason };
  }

  try {
    updateDisplayName(check.value);
    return { ok: true };
  } catch (err) {
    console.warn('[Ember] 保存名字失败', err);
    return { ok: false, message: '存不下来，名字没有变。' };
  }
}

/** 保存自我介绍。空字符串是合法的——表示清空 */
export function saveBio(raw: string): ProfileSaveResult {
  const check = checkBio(raw);
  if (!check.ok) {
    return { ok: false, message: check.reason };
  }

  try {
    updateBio(check.value);
    return { ok: true };
  } catch (err) {
    console.warn('[Ember] 保存自我介绍失败', err);
    return { ok: false, message: '存不下来，这段话没有变。' };
  }
}

/**
 * 一次保存两样。
 *
 * 为什么需要它：资料编辑页是一张表单，用户改完名字又改简介，
 * 点「保存」应该是一件事，而不是「名字存了、简介没存」。
 *
 * 注意：这里**不是**数据库事务。两次 UPDATE 各自独立提交，
 * 第二句失败时第一句已经生效。没有做成事务的原因：
 *   - updatePlayer 内部自己开连接、自己拼 SQL，没有对外暴露事务句柄；
 *   - 这个场景的失败代价是「名字改了、简介没改」——用户重开一次就能看到，
 *     不是数据损坏，也不涉及任何奖励与记录。
 * 真正的「必须同生共死」是打卡那类（services/checkin.ts），那才有事务。
 *
 * 如果以后资料变多（比如要一次改五项），应该改成一条 UPDATE，
 * 而不是加事务——一次 UPDATE 本身就是原子的。
 */
export function saveProfile(input: { name: string; bio: string }): ProfileSaveResult {
  const nameCheck = checkName(input.name);
  if (!nameCheck.ok) return { ok: false, message: nameCheck.reason };

  const bioCheck = checkBio(input.bio);
  if (!bioCheck.ok) return { ok: false, message: bioCheck.reason };

  // 两样都校验完才动手：先写名字再发现简介不合格，会让用户
  // 以为「什么都没保存」，其实名字已经变了
  try {
    updateDisplayName(nameCheck.value);
    updateBio(bioCheck.value);
    return { ok: true };
  } catch (err) {
    console.warn('[Ember] 保存资料失败', err);
    return { ok: false, message: '存不下来，资料没有变。' };
  }
}
