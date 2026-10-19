import { fetch as expoFetch } from 'expo/fetch';
import { getApiEndpoint } from './apiEndpoints';
import {
  loadMessages, loadContextMemory, createContextBackup, commitContextMemory, finishContextBackup,
} from './db';
import {
  normalizeContextSettings, parseStoredContextMemory, planContext, requestContextSummary,
  estimateTextTokens, formatStoredContextMemory, estimateConversationTokens,
} from './contextManager';

const inFlight = new Set();
const cooldowns = new Map();

// A failure must never move the coverage boundary or silently discard history.
export async function prepareConversationContext({ conversationId, beforeMessageId, settings: inputSettings, profile, signal, force = false, onStatus }) {
  const settings = normalizeContextSettings(inputSettings);
  const raw = (await loadMessages(conversationId)).filter(row => !beforeMessageId || row.id < beforeMessageId);
  const previousRow = await loadContextMemory(conversationId);
  const memory = settings.enabled ? parseStoredContextMemory(previousRow) : null;
  const plan = planContext(raw, memory, settings, force);
  const original = { memory, rows: plan.pending, status: plan.reason || '未达到整理阈值' };
  if (!plan.batch.length || !settings.enabled) return original;
  if (inFlight.has(conversationId)) return { ...original, status: '已有整理任务进行中' };
  const retryKey = `${conversationId}:${profile?.id}:${getApiEndpoint(profile)}:${profile?.model}`;
  if (!force && (cooldowns.get(retryKey) || 0) > Date.now()) return { ...original, status: '上次整理失败，暂缓自动重试；原文保留' };
  inFlight.add(conversationId);
  let backupId;
  try {
    if (signal?.aborted) { const error = new Error('已暂停生成'); error.code = 'PAUSED'; throw error; }
    if (!getApiEndpoint(profile) || !profile?.model?.trim()) throw new Error('请先选择可用的聊天模型');
    onStatus?.('正在整理较早的对话记忆…');
    const firstId = plan.batch[0].id;
    const lastId = plan.batch[plan.batch.length - 1].id;
    const sourceRows = raw.filter(row => row.id >= firstId && row.id <= lastId);
    backupId = await createContextBackup(conversationId, sourceRows, previousRow);
    const summary = await requestContextSummary({ fetcher: expoFetch, endpoint: getApiEndpoint(profile), profile, memory, rows: plan.batch, settings, signal });
    if (estimateTextTokens(formatStoredContextMemory(summary)) >= estimateConversationTokens(plan.batch) + estimateTextTokens(formatStoredContextMemory(memory))) {
      throw new Error('新摘要未缩短上下文，保留原文');
    }
    if (signal?.aborted) { const error = new Error('已暂停生成'); error.code = 'PAUSED'; throw error; }
    const updated = {
      ...summary, conversationId, lastCompactedMessageId: lastId,
      lastCompactedAt: Date.now(), version: (memory?.version || 0) + 1,
    };
    await commitContextMemory(conversationId, updated, previousRow, sourceRows, backupId);
    cooldowns.delete(retryKey);
    return { memory: updated, rows: plan.pending.filter(row => row.id > lastId), status: '已更新本对话的记忆摘要' };
  } catch (error) {
    if (backupId) await finishContextBackup(backupId, error.code === 'PAUSED' ? 'cancelled' : 'failed', error.message).catch(() => {});
    if (error.code === 'PAUSED' || signal?.aborted) { error.code = 'PAUSED'; throw error; }
    cooldowns.set(retryKey, Date.now() + 60000);
    // Do not log transcript contents, API credentials, or remote error bodies.
    console.warn('[context] Summary unchanged:', error.message);
    return { ...original, error: error.message, status: `整理未完成：${error.message}。继续使用旧摘要与未压缩原文。` };
  } finally {
    inFlight.delete(conversationId);
    onStatus?.('');
  }
}

