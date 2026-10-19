import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SettingsText as Text } from '../components/SettingsTypography';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../colors';
import { DEFAULT_API_SETTINGS, normalizeApiSettings } from '../apiResilience';
import { SwipeBackView } from '../components/SwipeBackView';

export function ApiStabilityScreen({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(normalizeApiSettings(settings));
  const update = patch => setDraft(previous => ({ ...previous, ...patch }));
  const saveAndClose = () => { onSave(draft); onClose(); };
  return (
    <SwipeBackView onSwipeBack={saveAndClose}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.header}>
            <Pressable style={styles.headerButton} onPress={saveAndClose}><Ionicons name="arrow-back" size={28} color={COLORS.text} /></Pressable>
            <Text style={styles.title}>接口稳定性</Text><View style={styles.headerButton} />
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.sectionTitle}>请求策略</Text>
            <View style={styles.card}>
              <SwitchRow title="失败后自动重试" subtitle="只重试网络错误、超时、限流和服务器异常" enabled={draft.retryEnabled} onPress={() => update({ retryEnabled: !draft.retryEnabled })} />
              <View style={styles.divider} />
              <View style={styles.retryRow}>
                <View style={{ flex: 1, paddingRight: 12 }}><Text style={styles.rowTitle}>重试次数</Text><Text style={styles.rowSubtitle}>单个接口最多额外请求几次</Text></View>
                <View style={styles.stepper}>{[0, 1, 2, 3].map(value => <Pressable key={value} onPress={() => update({ retryCount: value })} style={[styles.stepperButton, draft.retryCount === value && styles.stepperButtonActive]}><Text style={[styles.stepperText, draft.retryCount === value && styles.stepperTextActive]}>{value}</Text></Pressable>)}</View>
              </View>
              <View style={styles.divider} />
              <SwitchRow title="失败后切换备用接口" subtitle="按模型配置页面的顺序尝试其他接口" enabled={draft.fallbackEnabled} onPress={() => update({ fallbackEnabled: !draft.fallbackEnabled })} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SwipeBackView>
  );
}

function SwitchRow({ title, subtitle, enabled, onPress }) {
  return <Pressable style={styles.switchRow} onPress={onPress}><View style={{ flex: 1, paddingRight: 12 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View><View style={[styles.switch, enabled && styles.switchEnabled]}><View style={[styles.switchThumb, enabled && styles.switchThumbEnabled]} /></View></Pressable>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, container: { flex: 1, backgroundColor: COLORS.bg }, header: { height: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 }, headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, title: { flex: 1, fontSize: 25, fontWeight: '600', color: COLORS.text, marginLeft: 9 }, content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 260 }, sectionTitle: { fontSize: 16, color: COLORS.textMuted, marginLeft: 8, marginBottom: 10, marginTop: 10 }, card: { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 18 }, divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 44 }, switchRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center' }, retryRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center' }, rowTitle: { fontSize: 18, color: COLORS.text }, rowSubtitle: { marginTop: 4, fontSize: 12, lineHeight: 17, color: COLORS.textMuted }, switch: { width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: COLORS.border }, switchEnabled: { backgroundColor: COLORS.text }, switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }, switchThumbEnabled: { marginLeft: 20 }, stepper: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: COLORS.surface }, stepperButton: { minWidth: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, stepperButtonActive: { backgroundColor: COLORS.text }, stepperText: { fontSize: 13, color: COLORS.textMuted }, stepperTextActive: { color: '#fff', fontWeight: '600' },
});

