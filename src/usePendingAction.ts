import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Guards a submit-like action against rapid repeated activation. The ref
 * blocks a second trigger before React can re-render the disabled control,
 * and `pending` lets the control show that the first one is still running.
 */
export function usePendingAction() {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async <Result,>(action: () => Promise<Result>) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    if (mounted.current) setPending(true);
    try {
      return await action();
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);

  return { pending, run };
}
