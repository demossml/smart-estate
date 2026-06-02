import { createContext } from 'react';

export interface LargeModeContextType {
  large: boolean;
  toggle: () => void;
}

export const LargeModeContext = createContext<LargeModeContextType>({ large: false, toggle: () => {} });
