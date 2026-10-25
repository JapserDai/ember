/**
 * 预设任务模板与属性猜测
 *
 * 两件事放在一个文件里，因为它们回答的是同一个问题：
 * 「用户只写了一个名字，剩下的默认值从哪儿来？」
 *
 * 模板来自 docs/02 §3.3 的习惯 8 个 + 待办 4 个。
 * 属性猜测来自 docs/02 §3.1 的关键词表。
 *
 * 本文件是纯数据 + 纯函数：不 import React、不碰数据库、不读系统时间。
 * 以后新手引导、导出模板、示例数据都可以直接复用，不需要再写一份。
 */

import type { AttributeKey } from './balance';

/** 一个预设模板 */
export interface TaskTemplate {
  /** 稳定标识。以后引导页要记「用户选了哪几个」时用它，改名字不影响 */
  key: string;
  title: string;
  attribute: AttributeKey;
  type: 'habit' | 'todo';
}

/** 习惯模板（docs/02 §3.3，8 个） */
export const HABIT_TEMPLATES: readonly TaskTemplate[] = [
  { key: 'habit-phone-off', title: '睡前放下手机 10 分钟', attribute: 'spirit', type: 'habit' },
  { key: 'habit-water', title: '喝一杯水', attribute: 'body', type: 'habit' },
  { key: 'habit-walk', title: '走 10 分钟', attribute: 'body', type: 'habit' },
  { key: 'habit-read', title: '读 5 页书', attribute: 'mind', type: 'habit' },
  { key: 'habit-desk', title: '整理桌面 3 分钟', attribute: 'order', type: 'habit' },
  { key: 'habit-message', title: '给一个人发条消息', attribute: 'bond', type: 'habit' },
  { key: 'habit-note', title: '写下今天一件小事', attribute: 'spirit', type: 'habit' },
  { key: 'habit-stretch', title: '拉伸 5 分钟', attribute: 'body', type: 'habit' },
];

/** 待办模板（docs/02 §3.3，4 个） */
export const TODO_TEMPLATES: readonly TaskTemplate[] = [
  { key: 'todo-checkup', title: '预约一次体检', attribute: 'body', type: 'todo' },
  { key: 'todo-reply', title: '回复一条欠着的消息', attribute: 'bond', type: 'todo' },
  { key: 'todo-handin', title: '交一次该交的东西', attribute: 'order', type: 'todo' },
  { key: 'todo-toss', title: '扔掉一件不用的东西', attribute: 'order', type: 'todo' },
];

/**
 * 首页空状态用的 3 个快捷模板（固定，不做轮换）。
 *
 * 为什么是这三个：门槛最低、三秒内能做完；而且分别落在体魄 / 心智 / 联结，
 * 从 8 个里随手取 3 个有较大概率三个都是体魄（8 个里有 3 个体魄），
 * 那会让新用户以为这个 App 只管运动。
 */
export const QUICK_HABIT_TEMPLATES: readonly TaskTemplate[] = [
  HABIT_TEMPLATES[1], // 喝一杯水（体魄）
  HABIT_TEMPLATES[3], // 读 5 页书（心智）
  HABIT_TEMPLATES[5], // 给一个人发条消息（联结）
];

/**
 * 猜不出属性时的默认值。
 *
 * 选秩序而不是体魄：秩序是「把东西放回它该在的位置」，
 * 是最中性的一个维度，猜错时的误导最小（docs/02 §3.1 表格同此）。
 */
export const DEFAULT_ATTRIBUTE: AttributeKey = 'order';

/**
 * 关键词 → 属性。
 *
 * 顺序有意义：**具体的在前，宽泛的在后**。
 * 例如「跑完步读两页书」会命中「跑」→ 体魄，而不是「读」→ 心智。
 * 这类句子本来就没有唯一正确答案，取第一个明确信号是可接受的确定性取舍。
 *
 * 刻意不做分词、不做语法分析：规则越复杂，猜错时越难解释；
 * 用户也可以在新建设置里改（v0.2 起开放）。
 */
const ATTRIBUTE_KEYWORDS: ReadonlyArray<{ keywords: readonly string[]; attribute: AttributeKey }> = [
  // 心力：面向内在的、安静的事
  { keywords: ['冥想', '情绪', '呼吸', '写日记', '正念', '放下手机', '早睡', '不熬夜'], attribute: 'spirit' },
  // 联结：面向别人的事
  { keywords: ['联系', '朋友', '家人', '消息', '打电话', '陪', '见面', '回复'], attribute: 'bond' },
  // 体魄：身体的
  { keywords: ['跑', '走', '睡', '拉伸', '水', '运动', '锻炼', '健身', '瑜伽', '骑车', '爬'], attribute: 'body' },
  // 心智：学与读
  { keywords: ['读', '学', '书', '背', '听课', '复习', '写', '练习'], attribute: 'mind' },
  // 秩序：把环境收拾好
  { keywords: ['整理', '收拾', '清理', '桌面', '归档', '洗碗', '扫地', '扔'], attribute: 'order' },
];

/**
 * 按标题猜一个属性。
 *
 * 规则来自 docs/02 §3.1。命中第一个关键词就直接返回，
 * 所以同一个标题永远得到同一个结果——可预测比「更聪明」重要。
 */
export function guessAttribute(title: string): AttributeKey {
  const text = (title ?? '').trim();
  if (text.length === 0) return DEFAULT_ATTRIBUTE;

  for (const rule of ATTRIBUTE_KEYWORDS) {
    for (const word of rule.keywords) {
      if (text.includes(word)) return rule.attribute;
    }
  }

  return DEFAULT_ATTRIBUTE;
}
