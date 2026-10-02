'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import DemoModal from '@/components/DemoModal';

interface ModalContextValue {
  openDemo: () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

/**
 * Owns the only piece of cross-section state on the page — which dialog is open.
 *
 * Sections are passed as children, so they can stay Server Components; only this provider and the
 * dialogs themselves ship client JS.
 *
 * There was once an `openCampaign` here, backed by a three-step modal. Campaign creation is a page at
 * /campaigns/new now, so those CTAs are anchors (see components/ui/CtaLink.tsx) and no campaign
 * dialog is mounted at all.
 */
export default function ModalProvider({ children }: { children: ReactNode }) {
  const [demoOpen, setDemoOpen] = useState(false);

  const openDemo = useCallback(() => setDemoOpen(true), []);

  const value = useMemo(() => ({ openDemo }), [openDemo]);

  return (
    <ModalContext.Provider value={value}>
      {children}
      <DemoModal isOpen={demoOpen} onClose={() => setDemoOpen(false)} />
    </ModalContext.Provider>
  );
}

export function useModals() {
  const context = useContext(ModalContext);
  if (!context) throw new Error('useModals must be used inside <ModalProvider>');
  return context;
}