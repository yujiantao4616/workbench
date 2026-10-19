import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import type { WorkflowModule } from '../../shared/types';
import { moduleTabs } from '../lib/workflow';

export function ModuleNav({
  activeModule,
  onChange,
  executorRunning
}: {
  activeModule: WorkflowModule;
  onChange: (module: WorkflowModule) => void;
  executorRunning: boolean;
}) {
  return (
    <nav className="flex items-center gap-1 rounded-full bg-md-surface p-1">
      {moduleTabs.filter((tab) => tab.id !== 'memory').map((tab) => {
        const Icon = executorRunning && tab.id === 'executor' ? Loader2 : tab.icon;
        const active = activeModule === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={clsx(
              'flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition',
              active ? 'bg-md-primary text-md-onPrimary' : 'text-md-muted hover:bg-md-surfaceContainer hover:text-md-text'
            )}
          >
            <Icon size={17} className={executorRunning && tab.id === 'executor' ? 'animate-spin' : undefined} />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
