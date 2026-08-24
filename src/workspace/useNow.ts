import { useEffect, useState } from "react";

/**
 * `11-06`: a `Date` that re-renders its consumers on an interval, so "waiting 4m" becomes "waiting
 * 5m" without anybody touching the page.
 *
 * Every elapsed-time and day-label rendering in the workspace takes `now` as an argument
 * (`time/format.ts`) rather than reading the clock itself. This hook is the single place the real
 * clock enters the component tree - the browser-side equivalent of `IClock` being the only way a
 * handler learns the time server-side, and for the same reason: what depends on the clock has to be
 * testable without one.
 *
 * One timer for the whole workspace, not one per row. A ten-second tick is deliberately coarser than
 * the minute it is rendering: the labels move in whole minutes below an hour, so a faster tick would
 * re-render the entire list for no visible change, and a slower one would leave a row reading `4m`
 * for most of the fifth minute.
 */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
