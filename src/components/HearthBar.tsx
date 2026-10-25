import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';

/**
 * 炉膛：首页顶部那条「正在亮起来的火带」。
 *
 * 它取代了原来那排炭（EmberMeter）。为什么要换：
 *
 *   原来那排炭是**七个静态小横条**，点着一块填一块。它没有错，但它只能
 *   表达「3 / 7」这个比例——而比例是一个数字的图形化，不是动力。
 *   To Do 那种「今天还剩几件」的提示之所以让人想动手，靠的不是进度条，
 *   是**有东西正在发生**：一条会流动的、有温度的带子。
 *
 * 所以这里画的不是进度条，是**火从炉膛往右烧出去**：
 *
 *   - 左端是炉膛（一小簇火，哪怕一件都没做也还有余温）；
 *   - 右边是还没烧到的地方（一条极淡的轨道）；
 *   - 做完一件，火头往右推一截，火头本身是一团更亮的核；
 *   - 全做完，整条带子烧满。
 *
 * 它和「不评判」底线的关系（这是换掉进度条时必须守住的东西）：
 *   - **没有百分比、没有「还差 3 件」**。带子只显示火到哪儿，不显示「你不够」。
 *   - **一件都没做时不是空的**：左端永远有一小簇火。0 件不等于熄灭。
 *   - 不用环形、不用刻度、不标数字——那三种都会把它变成仪表盘（D12）。
 *
 * 为什么 SVG 与 View 混用：
 *   带子本身（横向的一条）用 SVG 画，因为它的两端要圆、而且必须铺满
 *   未知宽度的容器；光斑用 View 画，因为 SVG 的 viewBox 会被横向拉伸，
 *   圆形会变成椭圆（见下面布局尺寸那段注释）。
 *   带子用 LinearGradient 而不是两段纯色：火从左端的亮色过渡到右端的余烬色，
 *   硬接缝会让它看起来是「两截」，而不是一条正在烧的东西。
 *   这是项目里唯一一处用渐变的地方——因为「光」没有别的画法。
 *
 * 动效（D14：全 App 只保留一个编排过的动效，就是记录完成时的亮起）：
 *   火头前进时，那一小段会先亮一下再落到常亮。不做循环呼吸、不做入场动画——
 *   循环呼吸是「有东西在等你」，会让这一页变成一个有情绪的背景。
 *   reduce_motion 打开时直接跳到位，不播。
 */

export interface HearthBarProps {
  /** 已完成数 */
  done: number;
  /** 总数。0 表示今天没有安排 */
  total: number;
  /** 高度（像素）。默认 10 */
  height?: number;
}

export function HearthBar({ done, total, height = 10 }: HearthBarProps) {
  const { theme, palette, reduceMotion } = useTheme();

  /**
   * 火头用什么颜色。
   *
   * 这里踩过一个坑，值得写下来：一开始火头用 palette.highlight
   * （accent 向白色混合的亮色），理由是「火头最热，应该最亮」。
   * 但 highlight 在白底上是接近白的，压在同为浅色的背景上对比度只有 1.4–1.8，
   * 也就是说它几乎不存在。
   *
   * 白纸上正确的做法是反过来：**深 = 热**。用 primaryDeep（primary 往文字色混），
   * 白纸上的火头是墨色最重的那一笔。
   *
   * 早先还有一套暗色主题时这里写过「暗色用 highlight、亮色用 primaryDeep」，
   * 现在只剩白底，那条分支没有意义了，直接取深的那一支。
   */
  const coreColor = palette.primaryDeep;

  /**
   * 完成比例。
   *
   * 没有安排时按 0 算，但**不显示成「空」**——左端的炉膛火始终在。
   * 那一点火是「炉子还在这儿」，与「今天有几件事」无关。
   */
  const progress = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;

  // 火头的亮起：只在这一段变化时播一次
  const flare = useRef(new Animated.Value(1)).current;
  const prevProgress = useRef(progress);

  useEffect(() => {
    const grew = progress > prevProgress.current + 0.001;
    prevProgress.current = progress;

    if (!grew || reduceMotion) {
      flare.setValue(1);
      return;
    }

    flare.setValue(0.45);
    Animated.timing(flare, {
      toValue: 1,
      duration: theme.motion.slow,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [progress, flare, reduceMotion, theme.motion.slow]);

  /**
   * 布局尺寸。
   *
   * 这里有一个**必须绕开的坑**：带子要铺满容器宽度，而容器宽度事先不知道，
   * 所以 SVG 只能用 viewBox + preserveAspectRatio="none" 横向拉伸。
   * 拉伸之后，x 方向的单位被放大（典型手机上是 3.6 倍），
   * 于是**任何圆形的光斑都会变成横向的扁椭圆**——火头会从一团光
   * 变成一条横着的雾。
   *
   * 所以分工是这样的：
   *   - **SVG 只画不受拉伸影响的东西**：横向的带子、横向的轨道。
   *     它们的形状本来就是「一条」，拉宽只是变长，不会变形。
   *   - **圆形的光斑（炉膛余温、火头）用外层普通 View 画**，按像素定位。
   *     View 不受 viewBox 影响，画出来就是正圆。
   *
   * 这也是为什么下面有一个独立的发光层，而不是把所有东西都塞进 SVG。
   */
  const boxW = 100;
  const boxH = height;

  const litW = boxW * progress;

  /**
   * 渐变 id。
   *
   * 必须带上**实际用到的两个颜色**。现在只有一套主题，颜色不会变，
   * 但这个 id 仍然按颜色拼：将来主题回来时不用再改这里，
   * 而且颜色才是真正决定渐变长什么样的东西。
   */
  const gid = useMemo(
    () => `hearth-${palette.primary.replace('#', '')}-${coreColor.replace('#', '')}`,
    [palette.primary, coreColor]
  );

  return (
    <View
      accessibilityRole="progressbar"
      // 读屏不念百分比（那是仪表盘的语言），念「今天几件里有几件」
      accessibilityLabel={
        total > 0 ? `今天 ${done} 件里有 ${total} 件` : '今天还没有安排'
      }
      style={{ height, alignSelf: 'stretch' }}
    >
      <Svg width="100%" height={height} viewBox={`0 0 ${boxW} ${boxH}`} preserveAspectRatio="none">
        <Defs>
          {/*
           * 火带本身：从左端的高光色到主色。
           * 为什么左亮右暗：火头在最右端，但它前面是冷空气，
           * 真正最热的是已经烧稳的那一段。反过来（右亮左暗）会让
           * 火看起来在往回退。
           */}
          <LinearGradient id={`${gid}-bar`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={coreColor} />
            <Stop offset="0.55" stopColor={palette.primary} />
            <Stop offset="1" stopColor={palette.primary} />
          </LinearGradient>

        </Defs>

        {/* 还没烧到的那一截：一条极淡的轨道。它是「路」，不是「缺口」 */}
        <Rect
          x="0"
          y={boxH * 0.5 - 0.9}
          width={boxW}
          height={1.8}
          rx={0.9}
          fill={palette.text}
          fillOpacity={0.08}
        />

        {/* 已经烧到的那一段 */}
        {litW > 0.5 ? (
          <Rect
            x="0"
            y={boxH * 0.5 - boxH * 0.36}
            width={litW}
            height={boxH * 0.72}
            rx={boxH * 0.36}
            fill={`url(#${gid}-bar)`}
          />
        ) : null}

      </Svg>

      {/*
       * 炉膛那一端永远有一小簇火。一件都没做时，它是这一页唯一还热着的东西。
       *
       * 用 View + 多层同心圆近似径向渐变：外圈大而淡、内圈小而实。
       * 三层就够——再多在低端机上会看到色阶断层，而这里要的只是「有个热源」。
       */}
      <Glow
        color={palette.primary}
        size={height * 3.4}
        peak={0.34}
        style={{ left: -height * 1.2, top: -height * 1.2 }}
      />

      {/*
       * 火头：已烧段的右端一团更亮的光。
       *
       * 它是这一页「火在往前烧」的那个尖。progress 为 0 时不画——
       * 炉膛还没点着，不该有一个悬在起点的火头。
       */}
      {progress > 0 ? (
        <>
          <Glow
            color={coreColor}
            size={height * 4}
            peak={0.3}
            style={{ left: `${progress * 100}%`, top: -height * 1.5, marginLeft: -height * 2 }}
          />
          <Glow
            color={coreColor}
            size={height * 1.8}
            peak={0.55}
            style={{ left: `${progress * 100}%`, top: -height * 0.4, marginLeft: -height * 0.9 }}
          />
        </>
      ) : null}

      {/*
       * 火头的「亮一下」：记录完成时，火头会先亮到 2 倍再落回来。
       *
       * 为什么不直接动上面那个 Glow 的透明度：Glow 是静态的（跟着 progress
       * 换位置），如果它的透明度也由动画驱动，那么「换位置」和「亮一下」
       * 会在同一次渲染里争同一个值，结果是两个都做不干净。
       * 单独一层只管动画，位置永远跟着 progress，两者互不干扰。
       *
       * 它是纯装饰：读屏跳过（pointerEvents none），不然它会吃掉带子上的点击。
       */}
      {progress > 0 && !reduceMotion ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: `${progress * 100}%`,
            top: -height * 1.2,
            width: height * 3.4,
            height: height * 3.4,
            marginLeft: -height * 1.7,
            borderRadius: height * 1.7,
            backgroundColor: coreColor,
            opacity: Animated.multiply(flare, 0.22),
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * 一团光。
 *
 * 用三层同心圆叠出「中心实、边缘散」的效果，代替 RadialGradient。
 *
 * 为什么不用 RadialGradient：带子用 preserveAspectRatio="none" 横向拉伸，
 * 渐变画在 SVG 里会被一起拉扁（在典型手机上横向放大 3.6 倍），
 * 一团圆光会变成一条横着的雾。而这个组件是普通 View，不受 viewBox 影响，
 * 画出来永远是正圆。
 *
 * 为什么是三层而不是一层：一层就是一块半透明色板，边缘是硬的，看起来像一个
 * 圆点而不是光。三层（1.0 / 0.72 / 0.46 的直径，透明度递减）让边缘散开。
 * 为什么不多加几层：更多层在低端机上会出现色阶断层，而这里只需要「有个热源」，
 * 不需要真实的辉光。
 */
function Glow({
  color,
  size,
  peak,
  style,
}: {
  color: string;
  size: number;
  /** 最内圈的透明度。外圈按比例递减 */
  peak: number;
  style: { left: number | string; top: number; marginLeft?: number };
}) {
  const layers = [
    { scale: 1, alpha: peak * 0.32 },
    { scale: 0.72, alpha: peak * 0.55 },
    { scale: 0.46, alpha: peak },
  ];

  return (
    <View pointerEvents="none" style={{ position: 'absolute', ...style, width: size, height: size }}>
      {layers.map((layer, i) => {
        const d = size * layer.scale;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              // 三层都以中心对齐，所以每层要各自偏移
              left: (size - d) / 2,
              top: (size - d) / 2,
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: color,
              opacity: layer.alpha,
            }}
          />
        );
      })}
    </View>
  );
}
