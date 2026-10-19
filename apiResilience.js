export const DEFAULT_API_SETTINGS = {
  retryEnabled: true,
  retryCount: 1,
  fallbackEnabled: true,
};

const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export const normalizeApiSettings = (value = {}) => ({
  ...DEFAULT_API_SETTINGS,
  ...value,
  retryCount: Math.max(0, Math.min(3, Number(value.retryCount ?? DEFAULT_API_SETTINGS.retryCount) || 0)),
});

export const isRetryableStatus = (status) => RETRYABLE_STATUSES.has(Number(status));

export const waitBeforeRetry = (attempt) => new Promise(resolve => {
  setTimeout(resolve, Math.min(2400, 650 * Math.max(1, attempt)));
});

const cleanProviderMessage = (value) => String(value || '')
  .replace(/^API\s*报错[：:]?\s*/i, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 240);

const describeStatus = (status, error) => {
  const message = cleanProviderMessage(error?.providerMessage || error?.message);
  if (error?.partialResponse) return '回复传输中途断开，为避免重复扣费，没有自动重试。';
  if (error?.code === 'NETWORK_ERROR') return '无法连接到接口，请检查网络、URL 或中转站状态。';
  if (status === 400) return '接口拒绝了请求（400），请检查模型名、接口格式或该站是否支持工具调用。';
  if (status === 401) return 'API Key 无效、过期或填写错误（401）。';
  if (status === 403) return '接口拒绝访问（403），请检查账号权限、余额或地区限制。';
  if (status === 404) return '没有找到接口（404），请检查 Endpoint 是否填写完整。';
  if (status === 408) return '接口响应超时（408），请稍后重试。';
  if (status === 409) return '接口请求冲突（409），已尝试自动重试。';
  if (status === 429) return '请求过于频繁或额度不足（429），请稍后再试。';
  if (status >= 500) return `中转站服务异常（${status}），请稍后再试。`;
  if (status) return `接口请求失败（HTTP ${status}）。`;
  return message || '接口请求失败，请检查配置和网络。';
};

export const buildUserFacingApiError = (error, attempts = []) => {
  const status = Number(error?.status || error?.apiDetails?.status) || null;
  const lines = [describeStatus(status, error)];
  const names = [...new Set(attempts.map(item => item.profileName).filter(Boolean))];
  if (names.length > 1) lines.push(`已尝试：${names.join(' → ')}`);
  else if (attempts.length > 1) lines.push(`已自动尝试 ${attempts.length} 次。`);

  const providerMessage = cleanProviderMessage(error?.providerMessage || error?.message);
  if (providerMessage && !lines[0].includes(providerMessage)) {
    lines.push(`接口信息：${providerMessage}`);
  }
  lines.push('可到“设置 → 模型与参数配置”检查。');
  return lines.join('\n');
};

