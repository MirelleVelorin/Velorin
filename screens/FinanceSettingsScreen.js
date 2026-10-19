import { useEffect, useState } from 'react';
import {
  View, Pressable, ScrollView, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { SettingsText as Text, SettingsTextInput as TextInput } from '../components/SettingsTypography';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '../colors';
import { normalizeFinanceSettings } from '../financeRules';
import { SwipeBackView } from '../components/SwipeBackView';

export function FinanceSettingsScreen({ config, onSave, onClose, onTestTransaction }) {
  const [draft, setDraft] = useState(() => normalizeFinanceSettings(config.finance));
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0 });
  const [testAmount, setTestAmount] = useState('220');
  const [testCategory, setTestCategory] = useState('购物');
  const [testMerchant, setTestMerchant] = useState('测试商户');
  const [testType, setTestType] = useState('expense');
  const [testResult, setTestResult] = useState('');
  const update = patch => setDraft(previous => ({ ...previous, ...patch }));
  const saveAndClose = () => {
    onSave({ ...config, finance: draft });
    onClose();
  };
  const refreshTransactions = async () => {
    const rows = await onTestTransaction?.({ action: 'list' });
    if (!rows) return;
    setTransactions(rows.transactions || []);
    setSummary(rows.summary || { income: 0, expense: 0 });
  };
  useEffect(() => {
    refreshTransactions();
  }, []);
  const addTestTransaction = async () => {
    const amount = Number(testAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const result = await onTestTransaction?.({
      action: 'add',
      transaction: { type: testType, amount, category: testCategory, merchant: testMerchant, source: 'manual-test' },
      settings: draft,
    });
    if (result) {
      setTransactions(result.transactions || []);
      setSummary(result.summary || { income: 0, expense: 0 });
      if (testType === 'income') {
        setTestResult('已记录收入，不会触发消费提醒。');
      } else if (result.decision?.shouldComment) {
        setTestResult(result.commentScheduled
          ? `命中规则：${result.decision.reasons.join('、')}；已让 AI 在当前对话里自然接住这件事。`
          : `命中规则：${result.decision.reasons.join('、')}；请在聊天左下角「＋」中打开当前对话的“消费提醒”。`);
      } else if (!draft.enabled) {
        setTestResult('账单已保存，但当前未启用消费提醒。');
      } else {
        const reasons = Array.isArray(result.decision?.reasons) ? result.decision.reasons.filter(Boolean) : [];
        setTestResult(reasons.length
          ? `账单已保存：${reasons.join('、')}。`
          : '账单已保存，本次没有命中提醒规则。');
      }
    }
  };

  return (
    <SwipeBackView onSwipeBack={saveAndClose}>
      <SafeAreaView style={local.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={local.header}>
            <Pressable style={local.headerButton} onPress={saveAndClose}>
              <Ionicons name="arrow-back" size={28} color={COLORS.text} />
            </Pressable>
            <Text style={local.title}>理财与消费提醒</Text>
            <View style={local.headerButton} />
          </View>

          <ScrollView
            contentContainerStyle={local.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <Text style={local.intro}>
              自动记录收支，只有符合规则的消费才会交给 AI 判断是否提醒你。
            </Text>

            <View style={local.card}>
              <SwitchRow
                title="启用消费提醒"
                subtitle="后续接入支付通知后，在后台自动分析账单"
                enabled={draft.enabled}
                onPress={() => update({ enabled: !draft.enabled })}
              />
            </View>

            <Text style={local.sectionTitle}>提醒模式</Text>
            <View style={local.card}>
              <ChoiceRow
                title="重要消费才提醒"
                subtitle="推荐：只处理高金额、重复或接近预算的消费"
                active={draft.commentMode === 'important'}
                onPress={() => update({ commentMode: 'important' })}
              />
              <View style={local.divider} />
              <ChoiceRow
                title="每笔都让 AI 判断"
                subtitle="更主动，但每笔可能产生一次 API 请求"
                active={draft.commentMode === 'every'}
                onPress={() => update({ commentMode: 'every' })}
              />
            </View>

            <Text style={local.sectionTitle}>触发规则</Text>
            <View style={local.card}>
              <NumberRow
                title="单笔提醒金额"
                subtitle="达到这个金额时，优先交给 AI 判断"
                value={String(draft.singleExpenseThreshold)}
                suffix="元"
                keyboardType="numeric"
                onChangeText={value => update({ singleExpenseThreshold: value.replace(/[^0-9.]/g, '') })}
              />
              <View style={local.divider} />
              <NumberRow
                title="餐饮主动关心金额"
                subtitle="一顿饭超过这个金额时，交给 AI 自然接话"
                value={String(draft.mealCommentThreshold)}
                suffix="元"
                keyboardType="numeric"
                onChangeText={value => update({ mealCommentThreshold: value.replace(/[^0-9.]/g, '') })}
              />
              <View style={local.divider} />
              <NumberRow
                title="随机生活关心概率"
                subtitle="规则之外的消费，也有机会被 AI 自然问候"
                value={String(Math.round(Number(draft.randomCommentProbability || 0) * 100))}
                suffix="%"
                keyboardType="numeric"
                onChangeText={value => update({ randomCommentProbability: Math.min(100, Math.max(0, Number(value.replace(/[^0-9]/g, '') || 0))) / 100 })}
              />
              <View style={local.divider} />
              <NumberRow
                title="每月预算"
                subtitle="填 0 表示暂不按预算提醒"
                value={draft.monthlyBudget ? String(draft.monthlyBudget) : ''}
                suffix="元"
                keyboardType="numeric"
                onChangeText={value => update({ monthlyBudget: value.replace(/[^0-9.]/g, '') })}
              />
              <View style={local.divider} />
              <NumberRow
                title="每日最多主动提醒"
                subtitle="防止一天内提醒太多次"
                value={String(draft.dailyCommentLimit)}
                suffix="次"
                keyboardType="numeric"
                onChangeText={value => update({ dailyCommentLimit: value.replace(/[^0-9]/g, '') })}
              />
            </View>

            <Text style={local.sectionTitle}>默认不评价的类别</Text>
            <View style={local.promptCard}>
              <Text style={local.rowSubtitle}>用逗号分隔，例如：吃饭、交通、生活用品</Text>
              <TextInput
                style={local.categoryInput}
                value={draft.essentialCategories.join('、')}
                onChangeText={value => update({ essentialCategories: value.split(/[、,，]/).map(item => item.trim()).filter(Boolean) })}
                placeholder="餐饮、交通、生活用品、药品"
                placeholderTextColor={COLORS.textMuted}
                multiline
              />
            </View>

            <View style={local.noteCard}>
              <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.textMuted} />
              <Text style={local.noteText}>
                目前先用模拟账单测试；真正读取支付通知仍需要开发版 APK 和原生 Android 通知监听。命中规则后，会尝试在当前对话里结合人设和记忆自然回应。
              </Text>
            </View>

            <Text style={local.sectionTitle}>本地账单测试</Text>
            <View style={local.promptCard}>
              <Text style={local.rowSubtitle}>先用模拟账单验证规则，后续接入支付通知后会自动写入这里。</Text>
              <View style={local.summaryRow}>
                <Text style={local.summaryText}>收入 ¥{summary.income.toFixed(2)}</Text>
                <Text style={local.summaryText}>支出 ¥{summary.expense.toFixed(2)}</Text>
              </View>
              <View style={local.typeRow}>
                {['expense', 'income'].map(type => (
                  <Pressable key={type} onPress={() => setTestType(type)} style={[local.typeButton, testType === type && local.typeButtonActive]}>
                    <Text style={[local.typeButtonText, testType === type && local.typeButtonTextActive]}>{type === 'expense' ? '模拟支出' : '模拟收入'}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput style={local.testInput} value={testAmount} onChangeText={setTestAmount} keyboardType="decimal-pad" placeholder="金额" placeholderTextColor={COLORS.textMuted} />
              <TextInput style={local.testInput} value={testCategory} onChangeText={setTestCategory} placeholder="类别，例如：购物" placeholderTextColor={COLORS.textMuted} />
              <TextInput style={local.testInput} value={testMerchant} onChangeText={setTestMerchant} placeholder="商户" placeholderTextColor={COLORS.textMuted} />
              <Pressable style={local.testButton} onPress={addTestTransaction}>
                <Ionicons name="add-circle-outline" size={19} color="#fff" />
                <Text style={local.testButtonText}>添加测试账单</Text>
              </Pressable>
              {testResult ? <Text style={local.testResult}>{testResult}</Text> : null}
              {transactions.length ? (
                <Pressable style={local.clearButton} onPress={async () => {
                  const result = await onTestTransaction?.({ action: 'clear' });
                  setTransactions(result?.transactions || []);
                  setSummary(result?.summary || { income: 0, expense: 0 });
                  setTestResult('测试账单已清空。');
                }}>
                  <Text style={local.clearButtonText}>清空测试账单</Text>
                </Pressable>
              ) : null}
              {transactions.slice(0, 8).map(item => (
                <View key={item.id} style={local.transactionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={local.transactionTitle}>{item.merchant || '未命名商户'} · {item.category || '未分类'}</Text>
                    <Text style={local.rowSubtitle}>{item.should_comment ? `待 AI 判断：${formatReasons(item.reasons)}` : '本地规则未触发提醒'}</Text>
                  </View>
                  <Text style={local.transactionAmount}>{item.type === 'income' ? '+' : '-'}¥{Number(item.amount).toFixed(2)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SwipeBackView>
  );
}


function formatReasons(value) {
  if (Array.isArray(value)) return value.join('、');
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.join('、') : String(value || '命中规则');
  } catch {
    return String(value || '命中规则');
  }
}

function SwitchRow({ title, subtitle, enabled, onPress }) {
  return (
    <Pressable style={local.switchRow} onPress={onPress}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={local.rowTitle}>{title}</Text>
        <Text style={local.rowSubtitle}>{subtitle}</Text>
      </View>
      <View style={[local.switch, enabled && local.switchEnabled]}>
        <View style={[local.switchThumb, enabled && local.switchThumbEnabled]} />
      </View>
    </Pressable>
  );
}

function ChoiceRow({ title, subtitle, active, onPress }) {
  return (
    <Pressable style={local.switchRow} onPress={onPress}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={local.rowTitle}>{title}</Text>
        <Text style={local.rowSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={active ? COLORS.text : COLORS.textMuted} />
    </Pressable>
  );
}

function NumberRow({ title, subtitle, value, suffix, keyboardType, onChangeText }) {
  return (
    <View style={local.numberRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={local.rowTitle}>{title}</Text>
        <Text style={local.rowSubtitle}>{subtitle}</Text>
      </View>
      <View style={local.numberInputWrap}>
        <TextInput
          style={local.numberInput}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          selectTextOnFocus
          maxLength={8}
        />
        <Text style={local.suffix}>{suffix}</Text>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { height: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 23, fontWeight: '600', color: COLORS.text, marginLeft: 9 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 180 },
  intro: { fontSize: 14, lineHeight: 21, color: COLORS.textMuted, marginHorizontal: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, color: COLORS.textMuted, marginLeft: 8, marginBottom: 10, marginTop: 10 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 18, marginBottom: 8 },
  promptCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, marginBottom: 14 },
  switchRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center' },
  numberRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 17, color: COLORS.text },
  rowSubtitle: { marginTop: 4, fontSize: 12, lineHeight: 17, color: COLORS.textMuted },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 0 },
  switch: { width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: COLORS.border },
  switchEnabled: { backgroundColor: COLORS.text },
  switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  switchThumbEnabled: { marginLeft: 20 },
  numberInputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, backgroundColor: COLORS.surface, paddingHorizontal: 8 },
  numberInput: { minWidth: 58, height: 38, paddingHorizontal: 6, paddingVertical: 0, textAlign: 'right', fontSize: 16, color: COLORS.text },
  suffix: { fontSize: 13, color: COLORS.textMuted, marginLeft: 3 },
  categoryInput: { minHeight: 70, marginTop: 12, borderRadius: 12, backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, lineHeight: 22, color: COLORS.text },
  noteCard: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, backgroundColor: COLORS.surface },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18, color: COLORS.textMuted },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, marginBottom: 12 },
  summaryText: { fontSize: 14, color: COLORS.text },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  typeButton: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: COLORS.surface },
  typeButtonActive: { backgroundColor: COLORS.text },
  typeButtonText: { fontSize: 13, color: COLORS.textMuted },
  typeButtonTextActive: { color: '#fff' },
  testInput: { height: 42, borderRadius: 10, backgroundColor: COLORS.surface, paddingHorizontal: 12, marginBottom: 8, fontSize: 14, color: COLORS.text },
  testButton: { height: 42, borderRadius: 10, backgroundColor: COLORS.text, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 10 },
  testButtonText: { fontSize: 14, color: '#fff' },
  testResult: { fontSize: 12, lineHeight: 18, color: COLORS.textMuted, marginBottom: 8 },
  clearButton: { alignItems: 'center', paddingVertical: 8 },
  clearButtonText: { fontSize: 12, color: COLORS.textMuted },
  transactionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: COLORS.border },
  transactionTitle: { fontSize: 14, color: COLORS.text },
  transactionAmount: { marginLeft: 10, fontSize: 14, color: COLORS.text },
});

