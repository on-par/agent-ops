/**
 * MSW handlers for container API endpoints
 */

import { http, HttpResponse } from 'msw';
import { API_BASE } from '../../lib/api';
import type { ContainerListResponse, Container, ContainerListItem } from '../../types/container';

const mockContainerListItem: ContainerListItem = {
  id: 'container-1',
  name: 'test-container',
  status: 'running',
  image: 'node:20-alpine',
  workspaceId: 'workspace-1',
  executionId: null,
  errorMessage: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  startedAt: new Date('2025-01-01T00:01:00Z'),
  stoppedAt: null,
};

const mockContainer: Container = {
  ...mockContainerListItem,
  config: {
    image: 'node:20-alpine',
    command: ['node', 'index.js'],
    env: {},
    workingDir: '/app',
  },
  resources: null,
  updatedAt: new Date('2025-01-01T00:01:00Z'),
};

export const containerHandlers = [
  // GET /api/containers - List containers
  http.get(`${API_BASE}/api/containers`, () => {
    const response: ContainerListResponse = {
      items: [mockContainerListItem],
      total: 1,
      hasMore: false,
    };
    return HttpResponse.json(response);
  }),

  // GET /api/containers/:id - Get single container
  http.get(`${API_BASE}/api/containers/:id`, ({ params }) => {
    return HttpResponse.json({
      ...mockContainer,
      id: params.id as string,
    });
  }),

  // POST /api/containers - Create container
  http.post(`${API_BASE}/api/containers`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        ...mockContainer,
        id: `container-${Date.now()}`,
        name: (body.name as string) || 'new-container',
        image: (body.image as string) || 'node:20-alpine',
        status: 'created',
      },
      { status: 201 }
    );
  }),

  // POST /api/containers/:id/start - Start container
  http.post(`${API_BASE}/api/containers/:id/start`, ({ params }) => {
    return HttpResponse.json({
      ...mockContainer,
      id: params.id as string,
      status: 'running',
      startedAt: new Date(),
    });
  }),

  // POST /api/containers/:id/stop - Stop container
  http.post(`${API_BASE}/api/containers/:id/stop`, ({ params }) => {
    return HttpResponse.json({
      ...mockContainer,
      id: params.id as string,
      status: 'stopped',
      stoppedAt: new Date(),
    });
  }),

  // DELETE /api/containers/:id - Delete container
  http.delete(`${API_BASE}/api/containers/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),
];
