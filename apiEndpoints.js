export const DEFAULT_API_PATH = '/chat/completions';

function addressParts(value) {
  const [, address, query = '', hash = ''] = String(value || '').trim().match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  return { address, query, hash };
}

// Old profiles stored a full URL. Preserve custom routes rather than guessing /v1.
function splitLegacyEndpoint(endpoint) {
  const { address, query, hash } = addressParts(endpoint);
  const clean = address.replace(/\/+$/, '');
  const knownRoute = clean.match(/(\/(?:chat\/completions|responses|messages))$/i);
  if (knownRoute) {
    return { baseUrl: clean.slice(0, -knownRoute[1].length) + query + hash, apiPath: knownRoute[1] + address.slice(clean.length) };
  }
  const match = address.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
  const pathname = match?.[2] || '';
  if (!address || !pathname.replace(/\/+$/, '') || /\/v\d+(?:beta\d*)?$/i.test(clean)) {
    return { baseUrl: clean + query + hash, apiPath: DEFAULT_API_PATH };
  }
  // With an unknown legacy route, keep its whole path intact.
  return { baseUrl: match[1] + query + hash, apiPath: pathname };
}

function connectionFields(profile) {
  const fields = typeof profile?.baseUrl === 'string'
    ? { baseUrl: profile.baseUrl, apiPath: profile.apiPath ?? DEFAULT_API_PATH }
    : splitLegacyEndpoint(profile?.endpoint);
  const base = addressParts(fields.baseUrl);
  const path = addressParts(fields.apiPath || DEFAULT_API_PATH);
  let baseAddress = base.address.replace(/\/+$/, '');
  const route = '/' + (path.address.trim() || DEFAULT_API_PATH).replace(/^\/+/, '');
  // Also accept a full completion URL pasted into the Base URL input.
  for (const suffix of [route.replace(/\/+$/, ''), DEFAULT_API_PATH].filter(Boolean)) {
    if (baseAddress.toLowerCase().endsWith(suffix.toLowerCase())) {
      baseAddress = baseAddress.slice(0, -suffix.length).replace(/\/+$/, '');
      break;
    }
  }
  return { baseUrl: baseAddress + base.query + base.hash, apiPath: route + path.query + path.hash };
}

function joinEndpoint(baseUrl, apiPath) {
  const base = addressParts(baseUrl);
  if (!base.address) return '';
  const path = addressParts(apiPath);
  const query = [base.query.slice(1), path.query.slice(1)].filter(Boolean).join('&');
  return base.address + path.address + (query ? '?' + query : '') + (path.hash || base.hash);
}

export function normalizeApiProfile(profile) {
  const fields = connectionFields(profile);
  return { ...profile, ...fields, endpoint: joinEndpoint(fields.baseUrl, fields.apiPath) };
}

export function getApiEndpoint(profile) {
  return normalizeApiProfile(profile).endpoint;
}

export function getModelsEndpoint(profile) {
  const { baseUrl } = connectionFields(profile);
  // Preserve legacy URL query parameters, but never append the chat route to /models.
  const base = addressParts(baseUrl);
  return joinEndpoint(base.address.replace(/\/models\/?$/i, '') + base.query + base.hash, '/models');
}

