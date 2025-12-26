/**
 * MSW Request handlers for all API endpoints
 * These handlers intercept network requests and return mock responses for testing
 */

import { http, HttpResponse } from 'msw';
import { API_BASE } from '../../lib/api';
import type { WorkItem, Worker, DashboardStats } from '../../types/dashboard';

/**
 * Work Items handlers
 */
const workItemHandlers = [
  http.get(`${API_BASE}/api/work-items`, ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');

    const mockWorkItems: WorkItem[] = [
      {
        id: '1',
        title: 'Setup project infrastructure',
        type: 'feature',
        status: 'backlog',
        description: 'Initialize project with build tools and CI/CD',
        successCriteria: [],
        linkedFiles: [],
        createdBy: 'user-1',
        assignedAgents: {},
        requiresApproval: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        childIds: [],
        blockedBy: [],
      },
      {
        id: '2',
        title: 'Implement API authentication',
        type: 'feature',
        status: 'ready',
        description: 'Add JWT-based authentication to API',
        successCriteria: [],
        linkedFiles: [],
        createdBy: 'user-1',
        assignedAgents: {},
        requiresApproval: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        childIds: [],
        blockedBy: [],
      },
      {
        id: '3',
        title: 'Create dashboard component',
        type: 'feature',
        status: 'in_progress',
        description: 'Build the main dashboard UI',
        successCriteria: [],
        linkedFiles: [],
        createdBy: 'user-1',
        assignedAgents: {},
        requiresApproval: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        childIds: [],
        blockedBy: [],
      },
    ];

    const filtered = status
      ? mockWorkItems.filter((item) => item.status === status)
      : mockWorkItems;

    return HttpResponse.json(filtered);
  }),

  http.post(`${API_BASE}/api/work-items`, async ({ request }) => {
    const body = (await request.json()) as Partial<WorkItem>;
    const newWorkItem: WorkItem = {
      id: String(Date.now()),
      title: body.title || '',
      type: body.type || 'feature',
      status: body.status || 'backlog',
      description: body.description || '',
      createdAt: new Date(),
      updatedAt: new Date(),
      childIds: [],
      blockedBy: [],
      successCriteria: body.successCriteria || [],
      linkedFiles: body.linkedFiles || [],
      assignedAgents: body.assignedAgents || {},
      requiresApproval: body.requiresApproval || {},
      createdBy: body.createdBy || 'user-1',
    };
    return HttpResponse.json(newWorkItem, { status: 201 });
  }),

  http.get(`${API_BASE}/api/work-items/:id`, ({ params }) => {
    const mockWorkItem: WorkItem = {
      id: params.id as string,
      title: 'Sample Work Item',
      type: 'feature',
      status: 'ready',
      description: 'Sample description',
      successCriteria: [],
      linkedFiles: [],
      createdBy: 'user-1',
      assignedAgents: {},
      requiresApproval: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      childIds: [],
      blockedBy: [],
    };
    return HttpResponse.json(mockWorkItem);
  }),

  http.patch(`${API_BASE}/api/work-items/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Partial<WorkItem>;
    const updatedWorkItem: WorkItem = {
      id: params.id as string,
      title: body.title || 'Sample Work Item',
      type: body.type || 'feature',
      status: body.status || 'ready',
      description: body.description || 'Sample description',
      successCriteria: body.successCriteria || [],
      linkedFiles: body.linkedFiles || [],
      createdBy: body.createdBy || 'user-1',
      assignedAgents: body.assignedAgents || {},
      requiresApproval: body.requiresApproval || {},
      createdAt: new Date(),
      updatedAt: new Date(),
      childIds: body.childIds || [],
      blockedBy: body.blockedBy || [],
    };
    return HttpResponse.json(updatedWorkItem);
  }),

  http.delete(`${API_BASE}/api/work-items/:id`, () => {
    return HttpResponse.json(null, { status: 204 });
  }),

  http.post(`${API_BASE}/api/work-items/:id/transition`, async ({ params, request }) => {
    const body = (await request.json()) as { status?: string };
    const transitionedWorkItem: WorkItem = {
      id: params.id as string,
      title: 'Sample Work Item',
      type: 'feature',
      status: (body.status as WorkItem['status']) || 'ready',
      description: 'Sample description',
      successCriteria: [],
      linkedFiles: [],
      createdBy: 'user-1',
      assignedAgents: {},
      requiresApproval: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      childIds: [],
      blockedBy: [],
    };
    return HttpResponse.json(transitionedWorkItem);
  }),

  http.post(`${API_BASE}/api/work-items/:id/assign`, async ({ params, request }) => {
    const body = (await request.json()) as { role: string; agentId?: string };
    const assignedWorkItem: WorkItem = {
      id: params.id as string,
      title: 'Sample Work Item',
      type: 'feature',
      status: 'ready',
      description: 'Sample description',
      successCriteria: [],
      linkedFiles: [],
      createdBy: 'user-1',
      assignedAgents: { [body.role]: body.agentId },
      requiresApproval: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      childIds: [],
      blockedBy: [],
    };
    return HttpResponse.json(assignedWorkItem);
  }),

  http.post(`${API_BASE}/api/work-items/:id/success-criteria`, async ({ params, request }) => {
    const body = (await request.json()) as { description: string; completed?: boolean };
    const updatedWorkItem: WorkItem = {
      id: params.id as string,
      title: 'Sample Work Item',
      type: 'feature',
      status: 'ready',
      description: 'Sample description',
      successCriteria: [
        {
          id: String(Date.now()),
          description: body.description,
          completed: body.completed || false,
        },
      ],
      linkedFiles: [],
      createdBy: 'user-1',
      assignedAgents: {},
      requiresApproval: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      childIds: [],
      blockedBy: [],
    };
    return HttpResponse.json(updatedWorkItem);
  }),
];

/**
 * Workers handlers
 */
const workerHandlers = [
  http.get(`${API_BASE}/api/workers`, () => {
    const mockWorkers: Worker[] = [
      {
        id: 'worker-1',
        templateId: 'template-1',
        status: 'working',
        currentWorkItemId: '3',
        currentRole: 'engineer',
        sessionId: 'session-1',
        spawnedAt: new Date(),
        contextWindowUsed: 5000,
        contextWindowLimit: 8000,
        tokensUsed: 50000,
        costUsd: 0.15,
        toolCalls: 25,
        errors: 0,
      },
      {
        id: 'worker-2',
        templateId: 'template-1',
        status: 'idle',
        sessionId: 'session-2',
        spawnedAt: new Date(),
        contextWindowUsed: 0,
        contextWindowLimit: 8000,
        tokensUsed: 0,
        costUsd: 0,
        toolCalls: 0,
        errors: 0,
      },
    ];
    return HttpResponse.json({
      workers: mockWorkers,
      activeCount: 1,
      idleCount: 1,
    });
  }),

  http.post(`${API_BASE}/api/workers/spawn`, async ({ request }) => {
    const body = (await request.json()) as { templateId?: string };
    const newWorker: Worker = {
      id: `worker-${Date.now()}`,
      templateId: body.templateId || 'template-1',
      status: 'idle',
      sessionId: `session-${Date.now()}`,
      spawnedAt: new Date(),
      contextWindowUsed: 0,
      contextWindowLimit: 8000,
      tokensUsed: 0,
      costUsd: 0,
      toolCalls: 0,
      errors: 0,
    };
    return HttpResponse.json(newWorker, { status: 201 });
  }),

  http.post(`${API_BASE}/api/workers/:id/pause`, ({ params }) => {
    const pausedWorker: Worker = {
      id: params.id as string,
      templateId: 'template-1',
      status: 'paused',
      sessionId: 'session-1',
      spawnedAt: new Date(),
      contextWindowUsed: 0,
      contextWindowLimit: 8000,
      tokensUsed: 0,
      costUsd: 0,
      toolCalls: 0,
      errors: 0,
    };
    return HttpResponse.json(pausedWorker);
  }),

  http.post(`${API_BASE}/api/workers/:id/resume`, ({ params }) => {
    const resumedWorker: Worker = {
      id: params.id as string,
      templateId: 'template-1',
      status: 'idle',
      sessionId: 'session-1',
      spawnedAt: new Date(),
      contextWindowUsed: 0,
      contextWindowLimit: 8000,
      tokensUsed: 0,
      costUsd: 0,
      toolCalls: 0,
      errors: 0,
    };
    return HttpResponse.json(resumedWorker);
  }),

  http.post(`${API_BASE}/api/workers/:id/terminate`, ({ params }) => {
    const terminatedWorker: Worker = {
      id: params.id as string,
      templateId: 'template-1',
      status: 'terminated',
      sessionId: 'session-1',
      spawnedAt: new Date(),
      contextWindowUsed: 0,
      contextWindowLimit: 8000,
      tokensUsed: 0,
      costUsd: 0,
      toolCalls: 0,
      errors: 0,
    };
    return HttpResponse.json(terminatedWorker);
  }),

  http.get(`${API_BASE}/api/workers/available`, () => {
    const mockWorkers: Worker[] = [
      {
        id: 'worker-2',
        templateId: 'template-1',
        status: 'idle',
        sessionId: 'session-2',
        spawnedAt: new Date(),
        contextWindowUsed: 0,
        contextWindowLimit: 8000,
        tokensUsed: 0,
        costUsd: 0,
        toolCalls: 0,
        errors: 0,
      },
    ];
    return HttpResponse.json(mockWorkers);
  }),

  http.get(`${API_BASE}/api/workers/by-template`, ({ request }) => {
    const url = new URL(request.url);
    const templateId = url.searchParams.get('templateId');
    const mockWorkers: Worker[] = [
      {
        id: 'worker-1',
        templateId: templateId || 'template-1',
        status: 'working',
        currentWorkItemId: '3',
        currentRole: 'engineer',
        sessionId: 'session-1',
        spawnedAt: new Date(),
        contextWindowUsed: 5000,
        contextWindowLimit: 8000,
        tokensUsed: 50000,
        costUsd: 0.15,
        toolCalls: 25,
        errors: 0,
      },
    ];
    return HttpResponse.json(mockWorkers);
  }),

  http.post(`${API_BASE}/api/workers/:id/inject`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      success: true,
      workerId: params.id,
      message: body.message as string,
    });
  }),

  http.post(`${API_BASE}/api/workers/:id/assign`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const assignedWorker: Worker = {
      id: params.id as string,
      templateId: 'template-1',
      status: 'working',
      currentWorkItemId: body.workItemId as string,
      currentRole: body.role as string,
      sessionId: 'session-1',
      spawnedAt: new Date(),
      contextWindowUsed: 0,
      contextWindowLimit: 8000,
      tokensUsed: 0,
      costUsd: 0,
      toolCalls: 0,
      errors: 0,
    };
    return HttpResponse.json(assignedWorker);
  }),

  http.post(`${API_BASE}/api/workers/:id/complete`, ({ params }) => {
    const completedWorker: Worker = {
      id: params.id as string,
      templateId: 'template-1',
      status: 'idle',
      sessionId: 'session-1',
      spawnedAt: new Date(),
      contextWindowUsed: 0,
      contextWindowLimit: 8000,
      tokensUsed: 0,
      costUsd: 0,
      toolCalls: 0,
      errors: 0,
    };
    return HttpResponse.json(completedWorker);
  }),

  http.patch(`${API_BASE}/api/workers/:id/metrics`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const updatedWorker: Worker = {
      id: params.id as string,
      templateId: 'template-1',
      status: 'working',
      sessionId: 'session-1',
      spawnedAt: new Date(),
      contextWindowUsed: (body.contextWindowUsed as number) || 0,
      contextWindowLimit: 8000,
      tokensUsed: (body.tokensUsed as number) || 0,
      costUsd: (body.costUsd as number) || 0,
      toolCalls: (body.toolCalls as number) || 0,
      errors: (body.errors as number) || 0,
    };
    return HttpResponse.json(updatedWorker);
  }),

  http.post(`${API_BASE}/api/workers/:id/error`, async ({ params }) => {
    const errorWorker: Worker = {
      id: params.id as string,
      templateId: 'template-1',
      status: 'error',
      sessionId: 'session-1',
      spawnedAt: new Date(),
      contextWindowUsed: 0,
      contextWindowLimit: 8000,
      tokensUsed: 0,
      costUsd: 0,
      toolCalls: 0,
      errors: 1,
    };
    return HttpResponse.json(errorWorker);
  }),
];

/**
 * Templates handlers
 * NOTE: Specific routes must come BEFORE generic :id routes for MSW to match correctly
 */
const templateHandlers = [
  http.get(`${API_BASE}/api/templates`, () => {
    return HttpResponse.json([
      {
        id: 'template-1',
        name: 'Default Engineer',
        description: 'Standard engineer template',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  }),

  http.post(`${API_BASE}/api/templates`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: String(Date.now()),
        name: body.name || 'New Template',
        description: body.description || '',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { status: 201 }
    );
  }),

  // Specific template routes must come before the :id catch-all
  http.get(`${API_BASE}/api/templates/builtin`, () => {
    return HttpResponse.json([
      {
        id: 'builtin-1',
        name: 'Builtin Engineer',
        description: 'Builtin template',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  }),

  http.get(`${API_BASE}/api/templates/user-defined`, () => {
    return HttpResponse.json([
      {
        id: 'user-template-1',
        name: 'User Template',
        description: 'User created template',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  }),

  http.get(`${API_BASE}/api/templates/by-role`, ({ request }) => {
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    return HttpResponse.json([
      {
        id: `role-template-${role}`,
        name: `Template for ${role}`,
        description: `Template suited for ${role}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  }),

  http.get(`${API_BASE}/api/templates/for-work-item-type`, ({ request }) => {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    return HttpResponse.json([
      {
        id: `type-template-${type}`,
        name: `Template for ${type}`,
        description: `Template suited for ${type}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  }),

  // Now the generic :id routes
  http.get(`${API_BASE}/api/templates/:id`, ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      name: 'Sample Template',
      description: 'Sample description',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }),

  http.patch(`${API_BASE}/api/templates/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      id: params.id,
      name: (body.name as string) || 'Sample Template',
      description: (body.description as string) || 'Sample description',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }),

  http.delete(`${API_BASE}/api/templates/:id`, () => {
    return HttpResponse.json(null, { status: 204 });
  }),

  http.post(`${API_BASE}/api/templates/:id/clone`, async ({ request }) => {
    const body = (await request.json()) as { newName: string; createdBy: string };
    return HttpResponse.json({
      id: String(Date.now()),
      name: body.newName,
      description: 'Cloned template',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }),
];

/**
 * Dashboard handlers
 */
const dashboardHandlers = [
  http.get(`${API_BASE}/api/dashboard/stats`, () => {
    const stats: DashboardStats = {
      repositories: {
        total: 5,
        syncing: 1,
        synced: 3,
        error: 1,
        items: [],
      },
      agents: {
        total: 5,
        active: 2,
        idle: 2,
        working: 1,
        error: 0,
        items: [],
      },
      workItems: {
        byStatus: {
          backlog: 10,
          ready: 5,
          in_progress: 3,
          review: 2,
          done: 15,
        },
        recentCompletions: [],
      },
      recentActivity: [],
    };
    return HttpResponse.json(stats);
  }),
];

/**
 * Metrics handlers
 */
const metricsHandlers = [
  http.get(`${API_BASE}/api/metrics/agents`, () => {
    return HttpResponse.json({
      totalAgents: 5,
      activeAgents: 2,
      averageTokensUsed: 10000,
      averageCostUsd: 0.05,
      averageToolCalls: 10,
      errorRate: 0.01,
      agents: [],
    });
  }),

  http.get(`${API_BASE}/api/metrics/work`, () => {
    return HttpResponse.json({
      totalItems: 100,
      completedItems: 60,
      averageCompletionTime: 3600000,
      itemsByType: { feature: 50, bug: 30, task: 20 },
      itemsByStatus: { backlog: 10, ready: 20, in_progress: 10, review: 5, done: 55 },
      completionTrend: [],
    });
  }),

  http.get(`${API_BASE}/api/metrics/system`, () => {
    return HttpResponse.json({
      uptime: 86400000,
      memoryUsage: { used: 512000000, total: 1000000000, percentage: 51.2 },
      cpuUsage: 45.5,
      activeConnections: 15,
      requestsPerMinute: 120,
      errorRate: 0.02,
    });
  }),
];

/**
 * Config (Provider Settings) handlers
 */
const configHandlers = [
  http.get(`${API_BASE}/api/provider-settings`, () => {
    return HttpResponse.json([
      {
        id: 'setting-1',
        providerType: 'openai',
        baseUrl: 'https://api.openai.com',
        model: 'gpt-4',
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  }),

  http.get(`${API_BASE}/api/provider-settings/:id`, ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      providerType: 'openai',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4',
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }),

  http.post(`${API_BASE}/api/provider-settings`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: String(Date.now()),
        providerType: body.providerType || 'openai',
        baseUrl: body.baseUrl,
        model: body.model || 'gpt-4',
        isDefault: body.isDefault || false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { status: 201 }
    );
  }),

  http.put(`${API_BASE}/api/provider-settings/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      id: params.id,
      providerType: (body.providerType as string) || 'openai',
      baseUrl: body.baseUrl,
      model: (body.model as string) || 'gpt-4',
      isDefault: body.isDefault || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }),

  http.delete(`${API_BASE}/api/provider-settings/:id`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.post(`${API_BASE}/api/provider-settings/test-connection`, async () => {
    return HttpResponse.json({
      success: true,
      message: 'Connection successful',
    });
  }),

  http.get(`${API_BASE}/api/provider-settings/models/:providerType`, () => {
    return HttpResponse.json([
      {
        id: 'gpt-4',
        name: 'GPT-4',
        description: 'Most capable model',
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Fast and efficient',
      },
    ]);
  }),

  http.post(`${API_BASE}/api/provider-settings/:id/set-default`, ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      providerType: 'openai',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4',
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }),
];

/**
 * Combined handlers for all endpoints
 */
export const handlers = [
  ...workItemHandlers,
  ...workerHandlers,
  ...templateHandlers,
  ...metricsHandlers,
  ...configHandlers,
  ...dashboardHandlers,
];
