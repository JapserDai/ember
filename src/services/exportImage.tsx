/**
 * 导出成图片（D39 的第二步：`react-native-view-shot` 已装）。
 *
 * ---- 这一层做什么 ----
 *
 * 「把一张卡片拍成 PNG 并交给分享面板」。它**不决定卡片上说什么**——
 * 那是 `domain/exportCard.ts` 的事；也不决定怎么排——那是
 * `components/ExportCardView.tsx` 的事。这里只负责：
 *
 *   离屏挂载 → 等两帧（布局 + 绘制）→ captureRef → 改名 → 分享
 *
 * ---- 为什么必须离屏挂载 ----
 *
 * `captureRef` 拍的是**已经画出来的东西**。要在点按钮那一刻拿到图，
 * 只能先把卡片渲染到屏幕外（绝对定位到 `left: -10000`），等它画完再拍，
 * 然后立刻卸载。画在屏幕里再拍不行：用户会看到一张卡片闪一下。
 *
 * 所以对外是两个东西：`begin()` 发起导出，`host` 负责把离屏卡片挂到树上。
 * **host 必须渲染在调用方的页面里**，否则那棵离屏节点不存在，拍了也是空的。
 *
 * ---- 为什么卡片宽度固定 540dp ----
 *
 * 验收标准是「中文不截断」。截断与否取决于版面宽高比，不取决于手机屏宽：
 * 跟着屏幕走的话，窄屏导出挤、宽屏导出空。固定宽度之后，
 * 同一份内容在任何手机上导出的图一模一样（见 domain/exportCard.ts）。
 */
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import React, { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { ExportCardView } from '../components/ExportCardView';
import { CARD_PIXEL_SCALE, cardFileName, type ExportCardData } from '../domain/exportCard';

/** 导出结果。ok=false 时 message 可以直接给用户看 */
export interface ExportImageResult {
  ok: boolean;
  message: string;
  /** 文件位置。失败但文件已生成时也会有 */
  uri?: string;
}

/** 一次导出请求 */
export interface ExportRequest {
  data: ExportCardData;
  /** 文件名前缀，决定 `ember-week-2026-W43.png` 里那个词 */
  prefix: 'week' | 'month' | 'memory';
  /** 文件名的后半段，例如 `2026-W43` */
  key: string;
}

/** 内部用：请求 + 一个唯一的 id（同一个请求对象重复设 state 不会触发重渲染） */
interface InternalRequest extends ExportRequest {
  id: number;
}

/** 离屏卡片。挂在屏幕外，拍完由父组件卸载 */
function ExportCardHost({
  request,
  onDone,
}: {
  request: InternalRequest;
  onDone: (result: ExportImageResult) => void;
}) {
  /*
   * ref 的类型：RN 0.88 起 `View` 的实例类型是 `ReactNativeElement`，
   * 而 `React.ElementRef` 已移除。用 `React.ComponentRef<typeof View>`
   * 拿到与当前 RN 版本一致的那个类型，也不会在下次升级时又错。
   * `captureRef` 接受这样的 ref 对象（内部会 findNodeHandle）。
   */
  const shotRef = useRef<React.ComponentRef<typeof View>>(null);
  /** 只拍一次：effect 因为任何原因重跑时不重复拍、不重复 resolve */
  const started = useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;

    const run = async () => {
      try {
        const tempUri = await captureRef(shotRef, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
          /*
           * 只给 width：高度按卡片实际高度等比缩放。
           * 两个都给会拉伸——周报与月报的内容行数不同，高度天然不同。
           */
          width: 540 * CARD_PIXEL_SCALE,
        });

        /*
         * captureRef 写的是随机名字的临时文件，用户保存时看不出来是哪一周。
         * 复制到我们自己的文件名下再分享。
         */
        const named = new File(Paths.cache, cardFileName(request.prefix, request.key));
        if (named.exists) named.delete();
        await new File(tempUri).copy(named);

        onDone({ ok: true, message: '已经写好了。', uri: named.uri });
      } catch (err) {
        console.warn('[Ember] 截图失败', err);
        onDone({ ok: false, message: '这台手机上没能生成图片，可以先用文字版。' });
      }
    };

    /*
     * 等两帧：第一帧完成布局，第二帧完成绘制。只等一帧时
     * 在部分机型上拍出来是空白图（节点已布局但还没画）。
     * 120ms 比两帧宽松，慢机器上也够。
     */
    const timer = setTimeout(() => {
      void run();
    }, 120);

    return () => clearTimeout(timer);
  }, [request, onDone]);

  return (
    /*
     * 离屏位置：移到屏幕左边很远。
     *
     * 不用 opacity: 0 或 display: none：
     *   - `opacity: 0` 的节点在部分 Android 版本上会被截图优化掉（拍出来全白）；
     *   - `display: none` 根本不布局，尺寸是 0×0。
     * 移到屏幕外是唯一「确实画了、但用户看不见」的写法。
     */
    <View
      style={{ position: 'absolute', left: -10000, top: 0 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <View ref={shotRef} collapsable={false}>
        <ExportCardView data={request.data} />
      </View>
    </View>
  );
}

/** `useExportCard()` 的返回值 */
export interface ExportCardApi {
  /** 拍一张图并打开分享面板。整个流程走完才 resolve */
  exportAndShare: (request: ExportRequest) => Promise<ExportImageResult>;
  /** 离屏卡片的挂载点。**必须**渲染在调用方的页面里 */
  host: React.ReactNode;
}

/**
 * 导出图片的调用接口。
 *
 * 用法：
 *   const { exportAndShare, host } = useExportCard();
 *   ...
 *   const result = await exportAndShare({ data, prefix: 'week', key: weekKey });
 *   ...
 *   return <ScrollView>...{host}</ScrollView>;
 */
export function useExportCard(): ExportCardApi {
  const [request, setRequest] = useState<InternalRequest | null>(null);
  const resolveRef = useRef<((result: ExportImageResult) => void) | null>(null);
  /** 请求序号。同一个 key 连点两次时让 effect 重跑 */
  const seq = useRef(0);

  const onDone = useCallback((result: ExportImageResult) => {
    // 先卸载离屏卡片，再 resolve：用户不该在分享面板后面看到卡片闪一下
    setRequest(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(result);
  }, []);

  const capture = useCallback(
    (req: ExportRequest) =>
      new Promise<ExportImageResult>((resolve) => {
        resolveRef.current = resolve;
        seq.current += 1;
        setRequest({ ...req, id: seq.current });
      }),
    []
  );

  const exportAndShare = useCallback(
    async (req: ExportRequest): Promise<ExportImageResult> => {
      let result: ExportImageResult;
      try {
        result = await capture(req);
      } catch (err) {
        console.warn('[Ember] 生成图片失败', err);
        return { ok: false, message: '这台手机上没能生成图片，可以先用文字版。' };
      }

      if (!result.ok || !result.uri) return result;

      let canShare = false;
      try {
        canShare = await Sharing.isAvailableAsync();
      } catch {
        canShare = false;
      }

      if (!canShare) {
        return {
          ok: false,
          message: '图片已经写好了，但这台手机没有能接收图片的 App。',
          uri: result.uri,
        };
      }

      try {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'image/png',
          dialogTitle: '保存这张卡',
        });
        return result;
      } catch (err) {
        console.warn('[Ember] 分享图片失败', err);
        return { ok: false, message: '图片已经写好了，只是没能打开分享面板。', uri: result.uri };
      }
    },
    [capture]
  );

  return {
    exportAndShare,
    host: request ? <ExportCardHost request={request} onDone={onDone} /> : null,
  };
}
