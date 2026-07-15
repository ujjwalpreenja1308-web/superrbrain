import { useState, useEffect, useRef } from "react";

export function useAnimatedNumber(target: number, duration = 800): number {
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);

  useEffect(() => {
    const start = currentRef.current;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();
    let frameId = 0;

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(start + diff * eased);
      currentRef.current = nextValue;
      setCurrent(nextValue);

      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    }

    frameId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [target, duration]);

  return current;
}
