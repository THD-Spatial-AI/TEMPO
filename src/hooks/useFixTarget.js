import { useEffect, useRef } from 'react';
import { FIX_EVENT, takeFix } from '../services/fixIntent';

// Calls onTarget with a readiness Fix target meant for `view`: on mount (the link
// navigated here) and on later requests while the view is open.
export default function useFixTarget(view, onTarget) {
  const handler = useRef(onTarget);
  useEffect(() => {
    handler.current = onTarget;
  });
  useEffect(() => {
    const consume = () => {
      const t = takeFix(view);
      if (t) handler.current(t);
    };
    consume();
    window.addEventListener(FIX_EVENT, consume);
    return () => window.removeEventListener(FIX_EVENT, consume);
  }, [view]);
}
