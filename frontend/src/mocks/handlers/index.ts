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
    const body = (await request.json()) as { to?: string };
    const transitionedWorkItem: WorkItem = {
      id: params.id as string,
      title: 'Sample Work Item',
      type: 'feature',
      status: (body.to as WorkItem['status']) || 'ready',
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
    return HttpResponse.json(mockWorkers);
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

  http.post(`${API_BASE}/api/workers/:id/terminate`, () => {
    return HttpResponse.json(null, { status: 204 });
  }),
];

/**
 * Templates handlers (minimal for now)
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
 * Combined handlers for all endpoints
 */
export const handlers = [
  ...workItemHandlers,
  ...workerHandlers,
  ...templateHandlers,
  ...dashboardHandlers,
];
