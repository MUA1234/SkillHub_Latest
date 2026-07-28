import { TeachingModeProvider } from '@/contexts/TeachingModeContext';

/**
 * Wraps every /teachers/** route in the TeachingModeProvider so the single
 * teacher dashboard's General / Visual / Hearing switch and the content upload
 * form share one active mode.
 */
export default function TeachersLayout({ children }: { children: React.ReactNode }) {
  return <TeachingModeProvider>{children}</TeachingModeProvider>;
}
