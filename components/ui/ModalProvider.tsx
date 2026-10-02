'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import CampaignModal from '@/components/CampaignModal';
import DemoModal from '@/components/DemoModal';

interface ModalContextValue {
  openCampaign: () => void;
  openDemo: () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

/**
 * Owns the only piece of cross-section state on the page — which dialog is open.
 *
 * Sections are passed as children, so they can stay Server Components; only this provider and the
 * dialogs themselves ship client JS.
 */
export default function ModalProvider({ children }: { children: ReactNode }) {
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  const openCampaign = useCallback(() => setCampaignOpen(true), []);
  const openDemo = useCallback(() => setDemoOpen(true), []);

  const value = useMemo(() => ({ openCampaign, openDemo }), [openCampaign, openDemo]);

  return (
    <ModalContext.Provider value={value}>
      {children}
      <CampaignModal isOpen={campaignOpen} onClose={() => setCampaignOpen(false)} />
      <DemoModal isOpen={demoOpen} onClose={() => setDemoOpen(false)} />
    </ModalContext.Provider>
  );
}

export function useModals() {
  const context = useContext(ModalContext);
  if (!context) throw new Error('useModals must be used inside <ModalProvider>');
  return context;
}