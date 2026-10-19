export const DEFAULT_FINANCE_SETTINGS = {
  enabled: false,
  commentMode: 'important',
  singleExpenseThreshold: 200,
  mealCommentThreshold: 25,
  randomCommentProbability: 0.2,
  monthlyBudget: 0,
  lowBudgetRatio: 0.15,
  dailyCommentLimit: 3,
  essentialCategories: ['餐饮', '交通', '生活用品', '水电', '话费', '药品'],
  similarWindowDays: 7,
};

export function normalizeFinanceSettings(value = {}) {
  const source = value || {};
  const threshold = Number(source.singleExpenseThreshold);
  const mealThreshold = Number(source.mealCommentThreshold);
  const probability = Number(source.randomCommentProbability);
  const budget = Number(source.monthlyBudget);
  const limit = Number(source.dailyCommentLimit);
  const ratio = Number(source.lowBudgetRatio);
  return {
    ...DEFAULT_FINANCE_SETTINGS,
    ...source,
    singleExpenseThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULT_FINANCE_SETTINGS.singleExpenseThreshold,
    mealCommentThreshold: Number.isFinite(mealThreshold) && mealThreshold > 0 ? mealThreshold : DEFAULT_FINANCE_SETTINGS.mealCommentThreshold,
    randomCommentProbability: Number.isFinite(probability) && probability >= 0 && probability <= 1
      ? probability
      : DEFAULT_FINANCE_SETTINGS.randomCommentProbability,
    monthlyBudget: Number.isFinite(budget) && budget > 0 ? budget : 0,
    dailyCommentLimit: Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : DEFAULT_FINANCE_SETTINGS.dailyCommentLimit,
    lowBudgetRatio: Number.isFinite(ratio) && ratio > 0 && ratio < 1 ? ratio : DEFAULT_FINANCE_SETTINGS.lowBudgetRatio,
    essentialCategories: Array.isArray(source.essentialCategories)
      ? source.essentialCategories.map(item => String(item).trim()).filter(Boolean)
      : DEFAULT_FINANCE_SETTINGS.essentialCategories,
  };
}

const getDayKey = timestamp => {
  const date = new Date(timestamp || Date.now());
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const getMonthKey = timestamp => getDayKey(timestamp).slice(0, 7);
const getDayStart = timestamp => {
  const date = new Date(timestamp || Date.now());
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};
const normalizeCategory = value => String(value || '').trim();
const isMealCategory = category => Boolean(category) && ['餐饮', '吃饭', '食品', '外卖', '早餐', '午餐', '晚餐', '夜宵'].some(name => (
  category.includes(name) || name.includes(category)
));

export function shouldCommentOnTransaction(
  transaction,
  history = [],
  rawSettings = {},
  now = Date.now(),
  random = Math.random,
) {
  const settings = normalizeFinanceSettings(rawSettings);
  if (!settings.enabled) return { shouldComment: false, reasons: [] };

  const amount = Math.abs(Number(transaction?.amount) || 0);
  const type = transaction?.type || (transaction?.isIncome ? 'income' : 'expense');
  if (type !== 'expense' || amount <= 0) return { shouldComment: false, reasons: [] };

  const category = normalizeCategory(transaction?.category);
  const merchant = normalizeCategory(transaction?.merchant);
  const timestamp = transaction?.timestamp || now;
  const dayStart = getDayStart(timestamp);
  const sameDay = history.filter(item => (
    (item?.timestamp || now) >= dayStart
    && (item?.timestamp || now) < dayStart + 86400000
    && (item?.type || 'expense') === 'expense'
  ));
  const currentMonth = getMonthKey(timestamp);
  const monthExpenses = history
    .filter(item => getMonthKey(item?.timestamp || now) === currentMonth && (item?.type || 'expense') === 'expense')
    .reduce((sum, item) => sum + Math.abs(Number(item?.amount) || 0), 0) + amount;
  const recentSimilar = history.some(item => {
    if ((item?.type || 'expense') !== 'expense') return false;
    const age = timestamp - (item?.timestamp || timestamp);
    if (age < 0 || age > settings.similarWindowDays * 86400000) return false;
    return Boolean(category && item?.category && normalizeCategory(item.category) === category)
      || Boolean(merchant && item?.merchant && normalizeCategory(item.merchant) === merchant);
  });
  const isEssential = Boolean(category) && settings.essentialCategories.some(item => (
    category.includes(item) || item.includes(category)
  ));
  const reasons = [];

  if (amount >= settings.singleExpenseThreshold) reasons.push('单笔金额较高');
  if (!isEssential && sameDay.some(item => {
    if (item.id === transaction?.id) return false;
    const itemCategory = normalizeCategory(item?.category);
    return !settings.essentialCategories.some(name => itemCategory.includes(name) || name.includes(itemCategory));
  })) reasons.push('同日第二笔非必要消费');
  if (settings.monthlyBudget > 0 && monthExpenses >= settings.monthlyBudget * (1 - settings.lowBudgetRatio)) {
    reasons.push('本月预算接近上限');
  }
  if (!isEssential && recentSimilar) reasons.push('近期有相似消费');
  if (settings.commentMode === 'every') reasons.push('已开启每笔判断');
  if (isMealCategory(category) && amount > settings.mealCommentThreshold) {
    reasons.push('餐饮金额超过设定值');
  }

  // 规则之外的消费也保留少量随机生活关心，让必要消费不会完全沉默。
  if (reasons.length === 0 && settings.randomCommentProbability > 0) {
    const roll = Number(typeof random === 'function' ? random() : Math.random());
    if (roll < settings.randomCommentProbability) reasons.push('随机生活关心');
  }

  if (settings.dailyCommentLimit === 0) return { shouldComment: false, reasons: ['已关闭主动提醒'] };

  // 只有已经真正发给 AI 并完成回复的提醒才占用每日额度。
  // 仅命中规则但因对话开关关闭、网络失败等原因未发送，不应阻塞后续测试或提醒。
  const commentedToday = history.filter(item => (
    item?.commented
    && getDayKey(item.timestamp || now) === getDayKey(now)
  )).length;
  if (commentedToday >= settings.dailyCommentLimit) return { shouldComment: false, reasons: ['已达到每日提醒上限'] };

  return { shouldComment: reasons.length > 0, reasons };
}

