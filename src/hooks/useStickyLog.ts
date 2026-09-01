import { useState, useRef, useCallback, useEffect } from 'react';

const BOTTOM_THRESHOLD_PX = 60;

/** A bounded log buffer whose view only auto-scrolls to the newest entry
 * when the user was already near the bottom — scrolling up to read older
 * lines is never fought by incoming messages.
 */
export function useStickyLog(maxLines = 300) {
  const [lines, setLines] = useState<string[]>([]);
  // Hidden by default: a spammy board (or one still finishing its
  // handshake) can produce many lines per second, and the log serves
  // debugging, not the main workflow — better to opt in than to make users
  // fight both the volume and the scroll.
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const isNearBottom = () => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
  };

  const handleScroll = useCallback(() => {
    stickRef.current = isNearBottom();
  }, []);

  const add = useCallback((line: string) => {
    stickRef.current = isNearBottom();
    setLines(prev => [...prev.slice(-(maxLines - 1)), line]);
  }, [maxLines]);

  const clear = useCallback(() => setLines([]), []);

  useEffect(() => {
    // `block: 'nearest'` is load-bearing: the default ('center') walks up
    // to the nearest scrollable ancestor, which on first mount can be the
    // page's own scroll container (not yet this log div, if it has no
    // scroll overflow yet) — that scrolls the whole page to center this
    // element instead of just scrolling the log itself.
    if (stickRef.current) endRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  }, [lines]);

  return {
    lines, add, clear, containerRef, endRef, handleScroll,
    visible, toggleVisible: () => setVisible(v => !v),
  };
}
