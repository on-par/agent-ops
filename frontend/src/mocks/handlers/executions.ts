/**
 * MSW handlers for execution API endpoints
 */

import { http, HttpResponse } from 'msw';
import { API_BASE } from '../../lib/api';
import type {
  ExecutionListResponse,
  ExecutionDetail,
  ExecutionListItem,
  TraceEvent,
} from '../../types/execution';

const mockExecutionListItem: ExecutionListItem = {
  id: 'exec-1',
  status: 'success',
  workerId: 'worker-1',
  workItemId: 'wi-1',
  startedAt: new Date('2025-01-01T00:00:00Z'),
  completedAt: new Date('2025-01-01T00:05:00Z'),
  durationMs: 300000,
  tokensUsed: 5000,
  errorMessage: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
};

const mockTrace: TraceEvent = {
  id: 'trace-1',
  eventType: 'tool_call',
  data: { name: 'read_file', input: { path: '/app/index.js' } },
  timestamp: new Date('2025-01-01T00:01:00Z'),
};

const mockExecutionDetail: ExecutionDetail = {
  ...mockExecutionListItem,
  output: {
    summary: 'Task completed successfully',
    filesChanged: ['index.js'],
    testsRun: true,
    testsPassed: true,
  },
  traces: [mockTrace],
};

export const executionHandlers = [
  // GET /api/executions - List executions
  http.get(`${API_BASE}/api/executions`, () => {
    const response: ExecutionListResponse = {
      items: [mockExecutionListItem],
      total: 1,
      hasMore: false,
    };
    return HttpResponse.json(response);
  }),

  // GET /api/executions/:id - Get single execution with traces
  http.get(`${API_BASE}/api/executions/:id`, ({ params }) => {
    return HttpResponse.json({
      ...mockExecutionDetail,
      id: params.id as string,
    });
  }),

  // GET /api/executions/:id/traces - Get traces for execution
  http.get(`${API_BASE}/api/executions/:id/traces`, () => {
    return HttpResponse.json([mockTrace]);
  }),
];
