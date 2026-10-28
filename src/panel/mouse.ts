import { useEffect, useRef } from 'react';
import { useStdin, useStdout } from 'ink';

export interface MouseClick {
  /** 1-based column and row within the terminal (or the tmux pane) */
  x: number;
  y: number;
  button: 'left' | 'wheel-up' | 'wheel-down';
}

// SGR mouse reports: ESC [ < button ; x ; y M (press) or m (release)
const SGR = /\u001B?\[<(\d+);(\d+);(\d+)([Mm])/g;

/** Ink hands mouse reports to useInput as text; handlers skip them with this. */
export const isMouseInput = (input: string) => /\[<\d+;\d+;\d+[Mm]/.test(input);

/** Reports clicks and wheel turns while active. Turns the terminal's mouse reporting on and back off. */
export function useMouse(handler: (event: MouseClick) => void, isActive = true): void {
  const { stdout } = useStdout();
  const { internal_eventEmitter: events } = useStdin();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!isActive) return;
    stdout.write('\u001B[?1000h\u001B[?1006h');
    const onData = (data: string | Buffer) => {
      for (const m of String(data).matchAll(SGR)) {
        if (m[4] === 'm') continue;
        const code = Number(m[1]);
        const button = code === 64 ? 'wheel-up' : code === 65 ? 'wheel-down' : code === 0 ? 'left' : undefined;
        if (button) handlerRef.current({ x: Number(m[2]), y: Number(m[3]), button });
      }
    };
    events.on('input', onData);
    return () => {
      events.removeListener('input', onData);
      stdout.write('\u001B[?1000l\u001B[?1006l');
    };
  }, [isActive, stdout, events]);
}
