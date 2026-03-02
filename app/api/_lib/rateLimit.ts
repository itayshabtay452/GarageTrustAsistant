// שמור את המפה ברמת מודול (לא בתוך פונקציה)
const rateLimitMap: Map<string, { count: number; timestamp: number }> =
  globalThis.__rateLimitMap__ || new Map();
if (!(globalThis as any).__rateLimitMap__) {
  (globalThis as any).__rateLimitMap__ = rateLimitMap;
}

const RATE_LIMIT = 10;
const TIME_FRAME = 5 * 60 * 1000; // 5 דקות

export function isRateLimited(ip: string) {
  const currentTime = Date.now();
  const info = rateLimitMap.get(ip);
  if (info) {
    if (currentTime - info.timestamp < TIME_FRAME) {
      if (info.count >= RATE_LIMIT) {
        return true;
      }
      info.count++;
    } else {
      rateLimitMap.set(ip, { count: 1, timestamp: currentTime });
    }
  } else {
    rateLimitMap.set(ip, { count: 1, timestamp: currentTime });
  }
  return false;
}
