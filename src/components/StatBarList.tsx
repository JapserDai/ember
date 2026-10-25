import React from 'react';
import { Text, View } from 'react-native';

import { Card } from './Card';
import { withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/**
 * 一组横条 —— 统计页唯一的一种图。
 *
 * ---- 为什么是横条，不是柱状图 / 饼图 / 雷达图 ----
 *
 * 这一页的三组数据都是「几个类别的量比一比」：哪一段时段记得多、
 * 哪一维花的时间多。比较量的大小，横条是默认答案，理由有三条：
 *
 *   1. **标签可以是中文全称**，横着写在条的左边，不用斜排或换行；
 *   2. 条从同一条基线（左边缘）长出来，长短可以直接比；
 *   3. 不需要纵轴刻度，也就不需要读者先看懂刻度再看数据。
 *
 * 不用饼图：人眼比较角度比比较长度差得多，而且五个扇区里三个接近时
 * 根本分不出大小。不用雷达图：它用面积表达数值，同样的五个数换个轴顺序
 * 画出来形状完全不同，读者会去比较形状而不是数值。
 *
 * ---- 三个规格（来自图表规范，不是随手定的）----
 *
 *   - 条粗 8px：比这更细在低端机上看不清，更粗会显得是一条色块而不是读数；
 *   - 数据端 4px 圆角、基线端方角：圆角标出「这一头是数值」，
 *     两端都圆会看起来像一个胶囊，读者会以为整条长度没有意义；
 *   - 轨道是同色系更淡的一档，不是灰色：这样「满格」与「空」是同一个颜色的深浅，
 *     一眼就知道哪一条是满的，而灰色轨道会让人以为那是另一组数据。
 *
 * ---- 数值写在右边，不写在条上 ----
 *
 * 写在条内部，短条上放不下就会被裁掉（裁掉的文字比没有文字更糟）。
 * 统一放在右边一列，等宽数字对齐，竖着扫一眼就能比较。
 */

/** 一条横条的数据。与 services/stats.ts 的 StatBar 同构 */
export interface StatBarItem {
  key: string;
  label: string;
  /** 副标题（例如「17–23 点」）。null 表示不显示 */
  hint: string | null;
  value: number;
  /** 相对本组最大值的比例 0–1 */
  ratio: number;
}

export interface StatBarListProps {
  /** 这一组叫什么。会显示在卡片的左上角 */
  title: string;
  bars: readonly StatBarItem[];
  /** 数值后面跟的单位。不传表示不跟 */
  unit?: string;
  /** 一组全为 0 时说的话。不传时整条轨道画成空的，不额外解释 */
  emptyHint?: string;
}

export function StatBarList({ title, bars, unit, emptyHint }: StatBarListProps) {
  const { theme, palette } = useTheme();

  const allZero = bars.every((bar) => bar.value === 0);

  return (
    <Card>
      <Text
        style={{
          fontSize: theme.typography.size.caption,
          lineHeight: theme.typography.lineHeight.caption,
          fontWeight: theme.typography.weight.semibold,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {title}
      </Text>

      {/*
       * 全为 0 时不给一排空轨道：五条空轨道看起来像「五个都是零分」，
       * 而事实是「还没有数据」。一句话说清，比画五个空括号诚实。
       */}
      {allZero && emptyHint ? (
        <Text
          style={{
            marginTop: theme.spacing.sm,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {emptyHint}
        </Text>
      ) : (
        <View style={{ marginTop: theme.spacing.sm }}>
          {bars.map((bar, index) => (
            <BarRow
              key={bar.key}
              bar={bar}
              unit={unit}
              last={index === bars.length - 1}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

function BarRow({
  bar,
  unit,
  last,
}: {
  bar: StatBarItem;
  unit?: string;
  last: boolean;
}) {
  const { theme, palette } = useTheme();

  return (
    <View style={{ marginBottom: last ? 0 : theme.spacing.md }}>
      {/*
       * 标签行：左边名字（带范围的用小字跟在后面），右边数值。
       *
       * 外观走查（1.5 倍字号）改的一处：名字与范围都加了 flexShrink。
       * 没有它的时候，RN 的默认 flexShrink 是 0——字号放大到 1.5 倍后
       * 「17–23 点」这种范围会把这一行顶出卡片右边，而卡片没有裁剪，
       * 结果是数字跑到白底外面、在白底与灰底之间浮着。
       * 加 flexShrink 之后它们自己换行，卡片跟着长高，什么都不丢。
       */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text
          style={{
            flexShrink: 1,
            fontSize: theme.typography.size.label,
            lineHeight: theme.typography.lineHeight.label,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {bar.label}
        </Text>
        {bar.hint ? (
          <Text
            style={{
              flexShrink: 1,
              marginLeft: theme.spacing.sm,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {bar.hint}
          </Text>
        ) : null}

        {/* 数值推到最右。等宽数字：换一个值，这一列不会左右跳 */}
        <View style={{ flex: 1 }} />
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
            fontVariant: ['tabular-nums'],
          }}
        >
          {bar.value}
          {unit ?? ''}
        </Text>
      </View>

      {/* 轨道 + 条。轨道一像素不留地托住条，条从左边长出去 */}
      <View
        style={{
          marginTop: theme.spacing.xs,
          height: 8,
          borderRadius: 2,
          // 同色系更淡的一档（主色 14%）。不用灰色：灰色轨道读起来像另一组数据
          backgroundColor: withAlpha(palette.primary, 0.14),
          overflow: 'hidden',
        }}
      >
        {bar.ratio > 0 ? (
          <View
            style={{
              // 最小 2%：值为 0 的条不画（上面判断过了），但极小的值也该看得见。
              // 6px 左右的长度不会让人误读成「很大」，只是「不是零」
              width: `${Math.max(2, bar.ratio * 100)}%`,
              height: '100%',
              // 数据端圆角、基线端方角
              borderTopRightRadius: 4,
              borderBottomRightRadius: 4,
              backgroundColor: palette.primary,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
