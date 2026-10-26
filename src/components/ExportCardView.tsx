import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { CARD_WIDTH, type ExportCardBlock, type ExportCardData } from '../domain/exportCard';
import { useTheme } from '../theme/ThemeProvider';

/**
 * 导出卡片的版式（周报图 / 月报图 / 复盘卡共用这一份）。
 *
 * ---- 为什么所有字号都是写死的数字 ----
 *
 * 这一页渲染出来会被拍成一张 PNG 发给别人（或者存进相册）。
 * 如果它跟着系统字号缩放，同一份内容在不同手机上导出会长得不一样：
 * 有人 1.5 倍字号，导出的卡片上每个字都巨大、一屏放不下三行。
 * 所以卡片内部的文字全部 `allowFontScaling={false}`，字号按 540dp 的版面定死。
 *
 * 这与「界面跟随系统字号」并不冲突：那是给**正在使用 App 的人**看的，
 * 而这是给**收到图片的人**看的图。图片是印刷品，印刷品不缩放。
 *
 * ---- 宽度为什么是固定的 540dp ----
 *
 * 验收标准是「中文不截断」。截断与否取决于版面的宽高比，
 * 不取决于手机屏宽——跟着屏幕宽走的话，窄屏导出会挤、宽屏导出会空。
 * 固定宽度之后，同一个内容在任何手机上导出都一模一样。
 *
 * ---- 为什么没有一条装饰线 ----
 *
 * 卡片本身就是一张白纸压在圆角矩形上。加一条主色横线、一个渐变角标，
 * 会让它开始像「模板」。这里只有三样东西：小字标签、标题、内容。
 */
export interface ExportCardViewProps {
  data: ExportCardData;
  style?: StyleProp<ViewStyle>;
}

export function ExportCardView({ data, style }: ExportCardViewProps) {
  const { theme, palette } = useTheme();

  /*
   * 卡片专用的字号与间距。**不要**换成 theme.typography：
   * 那一份会随系统字号放大（D37），而这张卡必须固定。
   * 数值用主题里的基准值乘一个固定系数，改主题时视觉仍然一致。
   */
  const s = {
    width: CARD_WIDTH,
    pad: 40,
    label: 20,
    title: 40,
    titleLine: 54,
    fact: 26,
    factLine: 40,
    prompt: 20,
    answer: 28,
    answerLine: 42,
    pair: 26,
    footer: 18,
  };

  return (
    <View
      style={[
        {
          width: s.width,
          backgroundColor: palette.background,
          borderRadius: 28,
          padding: s.pad,
        },
        style,
      ]}
    >
      {/* 小字标签。字幕格：它说明「这是一张什么卡」 */}
      <Text
        allowFontScaling={false}
        style={{
          fontSize: s.label,
          lineHeight: s.label * 1.5,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {data.label}
      </Text>

      {/* 标题：唯一的重量级元素 */}
      <Text
        allowFontScaling={false}
        style={{
          marginTop: 8,
          fontSize: s.title,
          lineHeight: s.titleLine,
          fontWeight: theme.typography.weight.semibold,
          color: palette.text,
          fontFamily: theme.typography.fontFamily.title,
        }}
      >
        {data.title}
      </Text>

      {/* 内容。块与块之间靠 20 的留白分开，不画分隔线 */}
      <View style={{ marginTop: 28 }}>
        {data.blocks.map((block, index) => (
          <Block key={index} block={block} first={index === 0} s={s} />
        ))}
      </View>

      {/* 页脚：一句可验证的事实，不是一句承诺 */}
      {data.footer ? (
        <Text
          allowFontScaling={false}
          style={{
            marginTop: 36,
            fontSize: s.footer,
            lineHeight: s.footer * 1.6,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {data.footer}
        </Text>
      ) : null}
    </View>
  );
}

/** 一块内容。四种 kind 各自的版式 */
function Block({
  block,
  first,
  s,
}: {
  block: ExportCardBlock;
  first: boolean;
  s: {
    label: number;
    fact: number;
    factLine: number;
    prompt: number;
    answer: number;
    answerLine: number;
    pair: number;
  };
}) {
  const { theme, palette } = useTheme();
  const marginTop = first ? 0 : 24;

  if (block.kind === 'fact') {
    return (
      <Text
        allowFontScaling={false}
        style={{
          marginTop,
          fontSize: s.fact,
          lineHeight: s.factLine,
          color: palette.text,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {block.text}
      </Text>
    );
  }

  if (block.kind === 'quote') {
    return (
      <View style={{ marginTop: first ? 0 : 32 }}>
        <Text
          allowFontScaling={false}
          style={{
            fontSize: s.prompt,
            lineHeight: s.prompt * 1.5,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {block.prompt}
        </Text>
        <Text
          allowFontScaling={false}
          style={{
            marginTop: 6,
            fontSize: s.answer,
            lineHeight: s.answerLine,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {block.answer}
        </Text>
      </View>
    );
  }

  // pair：左边名字、右边数值。两列，不做条形图（条形图会被读成完成度）
  return (
    <View
      style={{
        marginTop,
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
      }}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontSize: s.pair,
          lineHeight: s.pair * 1.4,
          color: palette.text,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {block.label}
      </Text>
      <Text
        allowFontScaling={false}
        style={{
          fontSize: s.pair,
          lineHeight: s.pair * 1.4,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
          fontVariant: ['tabular-nums'],
        }}
      >
        {block.value}
      </Text>
    </View>
  );
}
