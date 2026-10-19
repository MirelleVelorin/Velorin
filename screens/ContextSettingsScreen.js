import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SettingsText as Text } from '../components/SettingsTypography';
import { SwipeBackView } from '../components/SwipeBackView';
import { COLORS } from '../colors';
import { loadConversations, loadMessages, loadContextMemory, clearContextMemory, loadContextBackups, loadContextExport } from '../db';
import { normalizeContextSettings, parseStoredContextMemory, planContext } from '../contextManager';

export function ContextSettingsScreen({ settings, conversationId, generationBusy, onSave, onCompact, onClose }) {
  const [draft, setDraft] = useState(() => normalizeContextSettings(settings));
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(conversationId);
  const [details, setDetails] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const readVersion = useRef(0);
  const operationBusy = useRef(false);
  const update = patch => setDraft(previous => ({ ...previous, ...patch }));
  const blocked = busy || generationBusy;
  const saveAndClose = () => { onSave(normalizeContextSettings(draft)); onClose(); };

  useEffect(() => {
    let live = true;
    loadConversations().then(rows => {
      if (!live) return;
      setConversations(rows);
      setSelectedId(previous => rows.some(row => row.id === previous) ? previous : rows[0]?.id ?? null);
    }).catch(e => { if (live) { setError(e.message); setLoading(false); } });
    return () => { live = false; readVersion.current += 1; };
  }, []);

  const refresh = async () => {
    const version = ++readVersion.current;
    setLoading(true);
    setError('');
    try {
      if (!selectedId) { setDetails(null); return; }
      const [rows, memoryRow, backups] = await Promise.all([
        loadMessages(selectedId), loadContextMemory(selectedId), loadContextBackups(selectedId),
      ]);
      if (version === readVersion.current) setDetails({ rows, memory: parseStoredContextMemory(memoryRow), backups });
    } catch (e) {
      if (version === readVersion.current) { setError(e.message); setDetails(null); }
    } finally { if (version === readVersion.current) setLoading(false); }
  };
  useEffect(() => { void refresh(); return () => { readVersion.current += 1; }; }, [selectedId, generationBusy]);

  const run = async action => {
    if (operationBusy.current || generationBusy) return;
    operationBusy.current = true;
    setBusy(true);
    try { await action(); await refresh(); }
    catch (e) { Alert.alert('操作未完成', e.message || '请稍后重试'); }
    finally { operationBusy.current = false; setBusy(false); }
  };
  const compact = () => run(async () => {
    const result = await onCompact(selectedId, normalizeContextSettings(draft));
    Alert.alert(result.error ? '整理未完成' : '上下文整理', result.status);
  });
  const reset = () => Alert.alert('重置本对话的摘要？', '只清除当前摘要，不删除聊天记录或已有备份。下次从原文重新整理，可能增加一次请求费用。', [
    { text: '取消', style: 'cancel' },
    { text: '重置摘要', style: 'destructive', onPress: () => run(() => clearContextMemory(selectedId)) },
  ]);
  const exportMemory = () => run(async () => {
    const data = await loadContextExport(selectedId);
    await Share.share({ title: 'Velorin 上下文与原文备份', message: JSON.stringify(data, null, 2) });
  });
  const memory = details?.memory;
  const plan = details ? planContext(details.rows, draft.enabled ? memory : null, draft) : null;
  const latest = details?.backups?.[0];
  const selectedName = conversations.find(row => row.id === selectedId)?.title || '未选择对话';

  return (
    <SwipeBackView onSwipeBack={saveAndClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="返回设置" style={styles.headerButton} onPress={saveAndClose}><Ionicons name="arrow-back" size={28} color={COLORS.text} /></Pressable>
          <Text style={styles.title}>上下文与记忆</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hint}>摘要按对话单独保存，不会混进其他对话。OB 仍负责外置长期记忆检索，本功能不依赖 OB 启动。</Text>
          <View style={styles.card}>
            <Toggle title="启用内置上下文" subtitle="已有摘要＋尚未压缩的原文；原始记录不删除" value={draft.enabled} onChange={value => update({ enabled: value })} />
            <Toggle title="达到阈值自动整理" subtitle="仅在需要时请求当前聊天模型，按该接口计费" value={draft.autoCompact} disabled={!draft.enabled} onChange={value => update({ autoCompact: value })} />
            <Options title="整理阈值（估算 token）" values={[4000, 8000, 16000]} selected={draft.triggerTokens} onChange={value => update({ triggerTokens: value })} />
            <Options title="至少保留最近多少条原文" values={[10, 30, 50, 80]} selected={draft.recentMessages} onChange={value => update({ recentMessages: value })} />
          </View>
          <Text style={styles.hint}>整理成功前，不会丢弃尚未总结的消息。关闭整理或整理失败时，长对话仍可能超过模型上限。估算不等于实际计费；本功能不保证中转站命中缓存。</Text>
          <Text style={styles.section}>查看本地记忆</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {conversations.map(row => <Pressable disabled={busy} key={row.id} style={[styles.tab, selectedId === row.id && styles.activeTab]} onPress={() => { setDetails(null); setSelectedId(row.id); }}>
              <Text numberOfLines={1} style={[styles.tabText, selectedId === row.id && styles.activeText]}>{row.title || '新对话'}</Text>
            </Pressable>)}
          </ScrollView>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loading ? <ActivityIndicator color={COLORS.textMuted} /> : !selectedId ? <Text style={styles.hint}>开始一段对话后，这里就能查看对应的摘要。</Text> : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{selectedName}</Text>
              <Text style={styles.hint}>原始消息 {details?.rows.length || 0} 条 · 本轮历史约 {plan?.estimatedTokens || 0} token（不含系统提示词、工具和图片）</Text>
              <Text style={styles.hint}>{memory ? `摘要第 ${memory.version} 版 · ${new Date(memory.lastCompactedAt).toLocaleString()}` : '暂无摘要；短对话无需整理。'}</Text>
              {latest?.status === 'failed' ? <Text style={styles.error}>上次整理失败：{latest.error}</Text> : null}
              {latest?.status === 'cancelled' ? <Text style={styles.hint}>上次整理已取消，原文保留。</Text> : null}
              {latest?.status === 'pending' ? <Text style={styles.hint}>有一份整理前备份尚未提交结果，可能正在整理或上次被中断；原文保留。</Text> : null}
              {[
                ['对话主线与重要经历', memory?.summary],
                ['关系与情绪', memory?.relationshipMemory],
                ['偏好与习惯', memory?.userPreferences],
                ['截至摘要时的状态', memory?.currentState],
              ].map(([title, content]) => <View key={title} style={styles.memorySection}><Text style={styles.label}>{title}</Text><Text selectable style={styles.body}>{content || '尚未整理'}</Text></View>)}
              <Pressable disabled={blocked || !draft.enabled} onPress={compact} style={[styles.button, (blocked || !draft.enabled) && styles.disabled]}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.activeText}>整理一次较早对话（使用当前模型）</Text>}
              </Pressable>
              <Text style={styles.hint}>每次最多一次摘要请求；很长的旧对话会分批整理。最近 {draft.recentMessages} 条原文不压缩。</Text>
              <View style={styles.actions}>
                <Pressable disabled={blocked} onPress={reset} style={styles.link}><Text style={styles.label}>重置摘要</Text></Pressable>
                <Pressable disabled={blocked} onPress={exportMemory} style={styles.link}><Text style={styles.label}>导出摘要与原文备份</Text></Pressable>
              </View>
              {generationBusy ? <Text style={styles.hint}>请等当前回复结束后再操作记忆。</Text> : null}
            </View>
          )}
          <Text style={styles.hint}>摘要可能遗漏细节，不等于永久记住一切。数据和整理前备份在本机，卸载应用可能丢失，请定期导出到其他位置。</Text>
        </ScrollView>
      </SafeAreaView>
    </SwipeBackView>
  );
}
function Toggle({ title, subtitle, value, disabled, onChange }) {
  return <View style={styles.toggle}><View style={styles.flex}><Text style={styles.label}>{title}</Text><Text style={styles.hint}>{subtitle}</Text></View><Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: COLORS.border, true: COLORS.text }} /></View>;
}
function Options({ title, values, selected, onChange }) {
  return <View style={styles.options}><Text style={styles.label}>{title}</Text><View style={styles.optionRow}>{values.map(value => <Pressable key={value} onPress={() => onChange(value)} style={[styles.option, selected === value && styles.activeTab]}><Text style={[styles.tabText, selected === value && styles.activeText]}>{value}</Text></Pressable>)}</View></View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg }, flex: { flex: 1 },
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 23, color: COLORS.text, marginLeft: 9 },
  content: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 100 },
  hint: { fontSize: 12, lineHeight: 20, color: COLORS.textMuted, marginVertical: 6 },
  card: { padding: 18, backgroundColor: '#fff', borderRadius: 18, marginVertical: 12 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  label: { fontSize: 15, lineHeight: 24, color: COLORS.text },
  section: { fontSize: 17, color: COLORS.text, marginVertical: 10 },
  cardTitle: { fontSize: 17, lineHeight: 26, color: COLORS.text },
  options: { marginTop: 14 }, optionRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  option: { borderRadius: 10, backgroundColor: COLORS.surface, paddingHorizontal: 14, paddingVertical: 8 },
  tabs: { gap: 8, paddingVertical: 8 }, tab: { maxWidth: 180, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff', borderRadius: 12 },
  activeTab: { backgroundColor: COLORS.text }, tabText: { fontSize: 13, color: COLORS.text }, activeText: { color: '#fff', fontSize: 13, lineHeight: 22 },
  error: { fontSize: 13, lineHeight: 21, color: '#A44949', marginVertical: 8 },
  memorySection: { marginTop: 15 }, body: { fontSize: 14, lineHeight: 23, color: COLORS.textMuted, marginTop: 5 },
  button: { backgroundColor: COLORS.text, borderRadius: 14, minHeight: 46, alignItems: 'center', justifyContent: 'center', padding: 10, marginTop: 20 },
  disabled: { opacity: 0.4 }, actions: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' }, link: { paddingVertical: 12 },
});

