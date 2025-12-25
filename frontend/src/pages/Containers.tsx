import { useState } from 'react';
import { Container as ContainerIcon, Plus } from 'lucide-react';
import { useContainers, useContainer, useStartContainer, useStopContainer, useDeleteContainer } from '../hooks/use-containers';
import { ContainerList } from '../components/containers/ContainerList';
import { ContainerDetail } from '../components/containers/ContainerDetail';
import type { ContainerStatus } from '../types/container';

const STATUS_FILTERS: Array<{ label: string; value: ContainerStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Stopped', value: 'stopped' },
  { label: 'Exited', value: 'exited' },
  { label: 'Error', value: 'error' },
];

export function Containers() {
  const [activeFilter, setActiveFilter] = useState<ContainerStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Fetch containers with optional status filter
  const { data: containersData, isLoading } = useContainers(
    activeFilter === 'all' ? {} : { status: activeFilter }
  );

  // Fetch selected container details
  const { data: selectedContainer } = useContainer(selectedId || '');

  // Mutations
  const startMutation = useStartContainer();
  const stopMutation = useStopContainer();
  const deleteMutation = useDeleteContainer();

  const containers = containersData?.items || [];

  const handleStart = (id: string) => {
    startMutation.mutate(id);
  };

  const handleStop = (id: string) => {
    stopMutation.mutate(id);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        // Clear selection if deleted container was selected
        if (selectedId === id) {
          setSelectedId(null);
        }
      },
    });
  };

  const handleCreateContainer = () => {
    // TODO: Implement create container modal/form
    console.log('Create container clicked');
  };

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] relative">
      {/* Grid background */}
      <div className="grid-bg" />

      <div className="relative z-10 p-6 lg:p-8 max-w-[1800px] mx-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 animate-fade-in">
          <h1 className="text-[28px] font-semibold text-[var(--text-primary)] flex items-center gap-3 tracking-tight">
            <ContainerIcon className="w-8 h-8 text-[var(--cyan-glow)]" />
            Containers
          </h1>
          <button
            onClick={handleCreateContainer}
            className="px-4 py-2 bg-[var(--cyan-glow)]/10 hover:bg-[var(--cyan-glow)]/20 text-[var(--cyan-glow)] border border-[var(--cyan-glow)]/20 rounded transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Container
          </button>
        </header>

        {/* Status filter tabs */}
        <div className="mb-6 animate-slide-up">
          <div className="tab-container inline-flex gap-1">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setActiveFilter(filter.value)}
                className={`tab-item ${activeFilter === filter.value ? 'active' : ''}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Container list */}
          <ContainerList
            containers={containers}
            isLoading={isLoading}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onStart={handleStart}
            onStop={handleStop}
            onDelete={handleDelete}
            total={containersData?.total}
          />

          {/* Container detail */}
          <ContainerDetail
            container={selectedContainer || null}
            onStart={handleStart}
            onStop={handleStop}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  );
}
