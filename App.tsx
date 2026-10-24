import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

/**
 * Ember 阶段 0 的首页。
 * 目前只验证两件事：
 *   1. 工具链能跑（能在这台手机上打开）
 *   2. 界面能响应（点一下有反馈）
 * 真正的功能从阶段 1 开始写。
 */
export default function App() {
  // 记录今天点了几下，用来证明「状态变化 → 界面更新」这条链路是通的
  const [taps, setTaps] = useState(0);

  return (
    <View style={styles.container}>
      {/* 顶部：日期与一句话问候 */}
      <View style={styles.header}>
        <Text style={styles.date}>{formatToday()}</Text>
        <Text style={styles.greeting}>这是你的火堆。</Text>
      </View>

      {/* 中部：伙伴占位（阶段 1 会换成真正的插画） */}
      <View style={styles.fireArea}>
        <View style={[styles.flame, taps > 0 && styles.flameLit]} />
        <Text style={styles.companionName}>小焰</Text>
        <Text style={styles.companionLine}>
          {taps === 0 ? '它还在等着被点亮。' : `火已经亮了 ${taps} 次。`}
        </Text>
      </View>

      {/* 底部：一个能点的按钮 */}
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => setTaps((n) => n + 1)}
      >
        <Text style={styles.buttonText}>点一下</Text>
      </Pressable>

      <Text style={styles.hint}>它不需要你每天做很多。</Text>

      <StatusBar style="dark" />
    </View>
  );
}

/** 返回「10 月 24 日 星期五」这样的中文日期 */
function formatToday(): string {
  const d = new Date();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${weekdays[d.getDay()]}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBF3EA', // 炉边主题的 background
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
  },
  header: {
    alignItems: 'center',
  },
  date: {
    fontSize: 13,
    color: '#332823',
    opacity: 0.6,
    letterSpacing: 1,
  },
  greeting: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: '600',
    color: '#332823',
  },
  fireArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flame: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#7A5A4A', // 未点亮：暗褐色
  },
  flameLit: {
    backgroundColor: '#B8502F', // 点亮：炉边主题的 primary
  },
  companionName: {
    marginTop: 20,
    fontSize: 17,
    fontWeight: '600',
    color: '#332823',
  },
  companionLine: {
    marginTop: 6,
    fontSize: 15,
    color: '#332823',
    opacity: 0.7,
  },
  button: {
    backgroundColor: '#B8502F',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#FFF9F2',
    fontSize: 17,
    fontWeight: '600',
  },
  hint: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 13,
    color: '#332823',
    opacity: 0.5,
  },
});
