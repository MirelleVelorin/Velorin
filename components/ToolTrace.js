import { useEffect, useState } from 'react';
import { BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';

import { COLORS } from '../colors';

const formatPayload = (value) => {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); }
  catch { return String(value); }
};

function TraceSheet({ trace }) {
  const steps = Array.isArray(trace?.steps) ? trace.steps : [];
  const thinking = trace?.status === 'thinking';
  const paused = trace?.status === 'paused';
  const failed = trace?.status === 'error' || steps.some(step => step.status === 'error');
  const toolCount = steps.length;

  const activity = trace?.contextStatus || trace?.mentalActivity || (
    thinking
      ? (toolCount ? '正在借助工具确认信息…' : '正在想该怎么回应你…')
      : paused
        ? '这次生成已暂停。'
        : failed
          ? '刚才的思路被错误打断了。'
          : '认真想了想，该怎么回应你。'
  );

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetTop}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>Thought process</Text>
      </View>
      <ScrollView style={styles.detailsScroll} contentContainerStyle={styles.details}>
        <View style={styles.entry}>
          <View style={styles.rail}>
            {toolCount > 0 && <View style={styles.line} />}
          </View>
          <View style={styles.entryBody}>
            <Text style={styles.activityText}>{activity}</Text>
            {trace?.contextNotice ? <Text style={styles.payload}>{trace.contextNotice}</Text> : null}
          </View>
        </View>

        {steps.map((step, index) => {
          const args = formatPayload(step.arguments);
          const result = formatPayload(step.result);
          return (
            <View key={step.id || `${step.name}-${index}`} style={styles.entry}>
              <View style={styles.rail}>
                <Ionicons
                  name={step.status === 'running'
                    ? 'time-outline'
                    : step.status === 'paused'
                      ? 'pause-circle-outline'
                      : step.status === 'error'
                        ? 'close-circle-outline'
                        : 'checkmark-circle-outline'}
                  size={18}
                  color={step.status === 'error' ? '#B35C5C' : COLORS.textMuted}
                />
                {index < steps.length - 1 && <View style={styles.line} />}
              </View>
              <View style={styles.entryBody}>
                <Text style={styles.entryName}>{step.name || 'MCP 工具'}</Text>
                {args ? <Text style={styles.payload} numberOfLines={8}>参数：{args}</Text> : null}
                {step.status === 'running' ? (
                  <Text style={styles.status}>正在执行…</Text>
                ) : result ? (
                  <Text style={styles.payload} numberOfLines={10}>
                    {step.status === 'error' ? '错误' : '结果'}：{result}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function TraceBackdrop({ onClose, blurTarget }) {
  return (
    <Pressable
      style={styles.backdrop}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel="关闭思考过程"
    >
      <BlurView
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        blurTarget={blurTarget}
        intensity={12}
        tint="dark"
        blurReductionFactor={1}
        blurMethod="dimezisBlurView"
      />
      <View pointerEvents="none" style={styles.backdropTint} />
    </Pressable>
  );
}

export function ToolTraceOverlay({ trace, onClose, blurTarget }) {
  useEffect(() => {
    if (!trace) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [trace, onClose]);

  if (!trace) return null;
  return (
    <View style={styles.overlayRoot}>
      <TraceBackdrop onClose={onClose} blurTarget={blurTarget} />
      <TraceSheet trace={trace} />
    </View>
  );
}

export function ToolTrace({ trace, onOpen }) {
  const [expanded, setExpanded] = useState(false);

  if (!trace) return null;

  const open = () => {
    if (onOpen) onOpen(trace);
    else setExpanded(true);
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        onPress={open}
      >
        <Ionicons name="time-outline" size={18} color={COLORS.textMuted} />
        <Text style={styles.title}>Thought process</Text>
        <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
      </Pressable>

      {!onOpen ? (
        <Modal
          visible={expanded}
          transparent={true}
          animationType="slide"
          presentationStyle="overFullScreen"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => setExpanded(false)}
        >
          <View style={styles.modalRoot}>
            <TraceBackdrop onClose={() => setExpanded(false)} />
            <TraceSheet trace={trace} />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '96%', marginBottom: 10 },
  header: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingRight: 6,
    borderRadius: 8,
  },
  headerPressed: { opacity: 0.6 },
  title: {
    color: COLORS.textMuted,
    fontFamily: 'NotoSansSC',
    fontSize: 14,
    lineHeight: 19,
    includeFontPadding: false,
    fontWeight: '400',
    flexShrink: 1,
    transform: [{ translateY: -2 }],
  },
  overlayRoot: {
    // RN 0.86 removed absoluteFillObject; keep this layer out of the chat layout.
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 1000,
    elevation: 1000,
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  backdropTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(72, 76, 84, 0.10)',
  },
  sheet: {
    height: '56%',
    maxHeight: '72%',
    backgroundColor: '#F0ECE6',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    paddingBottom: 24,
  },
  sheetTop: {
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  handle: {
    position: 'absolute',
    top: 10,
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
  },
  sheetTitle: {
    color: COLORS.text,
    fontFamily: 'HarmonyOSSansMedium',
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    letterSpacing: 0.2,
  },
  detailsScroll: { flex: 1 },
  details: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  entry: { flexDirection: 'row', alignItems: 'stretch' },
  rail: { width: 28, alignItems: 'center' },
  line: { width: 1, flex: 1, minHeight: 16, backgroundColor: COLORS.border, marginVertical: 3 },
  activityIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  entryBody: { flex: 1, paddingBottom: 15, paddingRight: 2 },
  entryName: { color: COLORS.text, fontFamily: 'NotoSansSC', fontSize: 15, fontWeight: '500', marginBottom: 4 },
  activityText: { color: COLORS.textMuted, fontFamily: 'NotoSansSC', fontSize: 15, lineHeight: 23 },
  status: { color: COLORS.textMuted, fontFamily: 'NotoSansSC', fontSize: 14 },
  payload: {
    color: COLORS.textMuted,
    fontFamily: 'NotoSansSC',
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    marginTop: 5,
  },
});

