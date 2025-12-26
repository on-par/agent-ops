/**
 * MSW handlers for GitHub API endpoints
 */

import { http, HttpResponse } from 'msw';
import { API_BASE } from '../../lib/api';
import type { GitHubConnection, Repository, AvailableRepository } from '../../types/github';

const mockConnection: GitHubConnection = {
  id: 'conn-1',
  username: 'testuser',
  avatarUrl: 'https://avatars.githubusercontent.com/u/1234567',
  scopes: 'repo read:user user:email',
  createdAt: '2025-01-01T00:00:00Z',
};

const mockRepository: Repository = {
  id: 'repo-1',
  connectionId: 'conn-1',
  githubId: 12345678,
  fullName: 'testuser/test-repo',
  owner: 'testuser',
  name: 'test-repo',
  description: 'A test repository',
  private: false,
  syncStatus: 'synced',
  labelsFilter: null,
  autoAssign: false,
  lastSyncAt: '2025-01-01T12:00:00Z',
  lastSyncError: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T12:00:00Z',
};

const mockAvailableRepository: AvailableRepository = {
  id: 87654321,
  name: 'another-repo',
  full_name: 'testuser/another-repo',
  description: 'Another repository to connect',
  private: true,
  owner: {
    login: 'testuser',
    avatar_url: 'https://avatars.githubusercontent.com/u/1234567',
  },
  permissions: {
    admin: true,
    push: true,
    pull: true,
  },
};

export const githubHandlers = [
  // GET /api/auth/github/connections
  http.get(`${API_BASE}/api/auth/github/connections`, () => {
    return HttpResponse.json([mockConnection]);
  }),

  // DELETE /api/auth/github/connections/:id
  http.delete(`${API_BASE}/api/auth/github/connections/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // GET /api/repositories
  http.get(`${API_BASE}/api/repositories`, () => {
    return HttpResponse.json([mockRepository]);
  }),

  // GET /api/repositories/available/:connectionId
  http.get(`${API_BASE}/api/repositories/available/:connectionId`, () => {
    return HttpResponse.json([mockAvailableRepository]);
  }),

  // POST /api/repositories
  http.post(`${API_BASE}/api/repositories`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        ...mockRepository,
        id: `repo-${Date.now()}`,
        fullName: body.fullName as string,
        name: body.name as string,
        syncStatus: 'pending',
      },
      { status: 201 }
    );
  }),

  // PATCH /api/repositories/:id
  http.patch(`${API_BASE}/api/repositories/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ...mockRepository,
      id: params.id as string,
      labelsFilter: (body.labelsFilter as string[] | undefined) || null,
      autoAssign: (body.autoAssign as boolean | undefined) || false,
    });
  }),

  // DELETE /api/repositories/:id
  http.delete(`${API_BASE}/api/repositories/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // POST /api/repositories/:id/sync
  http.post(`${API_BASE}/api/repositories/:id/sync`, ({ params }) => {
    return HttpResponse.json({
      jobId: `job-${Date.now()}`,
      repositoryId: params.id,
    });
  }),
];
