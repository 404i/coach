/**
 * Date/time context utility for freshness annotations.
 */
export function getDateTimeContext() {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = days[now.getDay()];
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].substring(0, 5);

  return {
    date,
    day,
    time,
    formatted: `${day}, ${date} at ${time}`,
    timestamp: now.getTime(),
  };
}
