'use client';

import { Play } from 'lucide-react';
import Modal from '@/components/ui/Modal';

/** Buyer-facing summary. No storage providers, data stores or internal component names. */
const HIGHLIGHTS = [
  { label: 'Discovery', value: 'Audience-matched venues' },
  { label: 'Publishing', value: 'Automated, verified' },
  { label: 'Reporting', value: 'Per location and screen' },
];

export default function DemoModal({ isOpen, onClose }: DemoModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="How String Theory works"
      description="A four-minute walkthrough of the campaign flow."
      maxWidth="max-w-3xl"
    >
      {/*
        Placeholder for the real product video. Deliberately not an autoplaying background loop —
        autoplay consumes data and creates a motion barrier, and there is nothing to pause.
      */}
      <div className="flex aspect-video flex-col items-center justify-center gap-5 rounded-lg bg-ink px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-pill bg-paper-raised text-ink">
          <Play className="h-5 w-5 translate-x-0.5 fill-ink" aria-hidden="true" />
        </span>
        <p className="max-w-sm text-[length:var(--type-body)] leading-relaxed text-paper-raised/80">
          Brand to audience to matching venues to a live campaign — the same chain the platform runs
          end to end.
        </p>
      </div>

      <dl className="mt-6 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
        {HIGHLIGHTS.map((item) => (
          <div key={item.label} className="bg-paper-raised px-5 py-5">
            <dt className="type-eyebrow text-ink-muted">{item.label}</dt>
            <dd className="mt-2.5 text-[length:var(--type-body)] font-semibold text-ink">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}