export function ungarble(value) {
  if (typeof value !== 'string') return value;
  try {
    return decodeURIComponent(escape(value));
  } catch {
    return value;
  }
}

export function ungarbleAll(value) {
  if (Array.isArray(value)) return value.map(ungarbleAll);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ungarbleAll(v)]));
  }
  return ungarble(value);
}
