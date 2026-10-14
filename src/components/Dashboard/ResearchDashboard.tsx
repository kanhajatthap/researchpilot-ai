'use client';

import { useState, useCallback } from 'react';
import { ChatWorkspace } from '@/components/Chat';
import { DocumentList } from '@/components/Documents';
import { AgentActivity } from '@/components/AgentTrace';
import { cn } from '@/lib/utils';
import type { AgentTrace } from '@/types/agent';

export interface ResearchDashboardProps {
  className?: string;
}

export function ResearchDashboard({ className }: ResearchDashboardProps) {
  const [latestAgentTrace, setLatestAgentTrace] = useState<AgentTrace | undefined>(undefined);

  const handleAgentTrace = useCallback((trace: AgentTrace) => {
    setLatestAgentTrace(trace);
  }, []);

  return (
    <div
      className={cn(
        'grid min-h-0 gap-4 p-3 sm:p-4 lg:h-full lg:grid-cols-[340px_1fr] lg:grid-rows-1 xl:grid-cols-[360px_1fr]',
        className
      )}
    >
      {/* Knowledge base + agent trace. Second on mobile, first (left rail) on desktop. */}
      <div className='order-2 flex min-w-0 flex-col gap-4 lg:order-1 lg:min-h-0'>
        <DocumentList className='shrink-0' />
        <AgentActivity trace={latestAgentTrace} className='lg:min-h-0 lg:flex-1' />
      </div>

      {/* Research assistant. First on mobile so it is immediately reachable. */}
      <div className='order-1 flex h-[68vh] min-h-[520px] min-w-0 flex-col lg:order-2 lg:h-auto lg:min-h-0 lg:flex-1'>
        <ChatWorkspace className='h-full min-h-0' onAgentTrace={handleAgentTrace} />
      </div>
    </div>
  );
}
