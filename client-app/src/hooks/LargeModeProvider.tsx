import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { LargeModeContext } from './largeModeContext';

export function LargeModeProvider({ children }: { children: ReactNode }) {
  const [large, setLarge] = useState(false);
  const toggle = useCallback(() => setLarge(value => !value), []);

  return (
    <LargeModeContext.Provider value={{ large, toggle }}>
      {children}
    </LargeModeContext.Provider>
  );
}
