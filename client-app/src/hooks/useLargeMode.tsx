import { useContext } from 'react';
import { LargeModeContext } from './largeModeContext';

export function useLargeMode() {
  return useContext(LargeModeContext);
}
