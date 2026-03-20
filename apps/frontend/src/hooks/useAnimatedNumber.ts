import { useState, useEffect, useRef } from "react";

export function useAnimatedNumber(target: number, duration = 800): number {
  const [current, setCurrent] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    const start = prevTarget.current;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(start + diff * eased));

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        prevTarget.current = target;
      }
    }

    requestAnimationFrame(step);
    return () => {
      prevTarget.current = target;
    };
  }, [target, duration]);

  return current;
}
