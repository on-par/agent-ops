/**
 * Integration tests for API client
 * Tests full request/response cycles with MSW mocking
 */

import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from './client';
import { API_BASE } from '../lib/api';

describe('API Client Integration Tests', () => {
  describe('Dashboard API', () => {
    it('should fetch dashboard stats successfully', async () => {
      const stats = await api.dashboard.getStats();

      expect(stats).toHaveProperty('repositories');
      expect(stats).toHaveProperty('agents');
      expect(stats).toHaveProperty('workItems');
      expect(stats.repositories.total).toBe(5);
      expect(stats.agents.total).toBe(5);
    });

    it('should get WebSocket URL', () => {
      const url = api.dashboard.getWebSocketUrl();

      expect(url).toMatch(/^wss?:\/\//);
      expect(url).toContain('/api/dashboard/ws');
    });
  });

  describe('Work Items API', () => {
    it('should fetch all work items', async () => {
      const items = await api.workItems.getAll();

      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
    });

    it('should fetch work items with filters', async () => {
      const items = await api.workItems.getAll({ status: 'ready' });

      expect(Array.isArray(items)).toBe(true);
      expect(items[0].status).toBe('ready');
    });

    it('should fetch single work item by ID', async () => {
      const item = await api.workItems.getById('1');

      expect(item).toHaveProperty('id', '1');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('status');
    });

    it('should create a work item', async () => {
      const input = {
        title: 'Test Task',
        type: 'feature',
        description: 'Test description',
      };

      const item = await api.workItems.create(input);

      expect(item).toHaveProperty('id');
      expect(item.title).toBe('Test Task');
      expect(item.type).toBe('feature');
    });

    it('should update a work item', async () => {
      const item = await api.workItems.update('1', {
        title: 'Updated Title',
      });

      expect(item).toHaveProperty('id', '1');
      expect(item.title).toBe('Updated Title');
    });

    it('should delete a work item', async () => {
      await api.workItems.delete('1');
      // If no error, delete was successful
      expect(true).toBe(true);
    });

    it('should transition work item status', async () => {
      const item = await api.workItems.transition('1', 'in_progress');

      expect(item.status).toBe('in_progress');
    });

    it('should assign agent to work item', async () => {
      const item = await api.workItems.assign('1', 'engineer', 'agent-123');

      expect(item.assignedAgents).toBeDefined();
    });

    it('should add success criterion to work item', async () => {
      const item = await api.workItems.addSuccessCriterion(
        '1',
        'Test passes',
        false
      );

      expect(item.successCriteria).toBeDefined();
      expect(item.successCriteria.length).toBeGreaterThan(0);
    });
  });

  describe('Templates API', () => {
    it('should fetch all templates', async () => {
      const templates = await api.templates.getAll();

      expect(Array.isArray(templates)).toBe(true);
    });

    it('should fetch single template', async () => {
      const template = await api.templates.getById('1');

      expect(template).toHaveProperty('id');
      expect(template).toHaveProperty('name');
    });

    it('should create a template', async () => {
      const template = await api.templates.create({
        name: 'New Template',
        description: 'Test template',
      });

      expect(template).toHaveProperty('id');
      expect(template.name).toBe('New Template');
    });

    it('should update a template', async () => {
      const template = await api.templates.update('1', {
        name: 'Updated Template',
      });

      expect(template.name).toBe('Updated Template');
    });

    it('should delete a template', async () => {
      await api.templates.delete('1');
      expect(true).toBe(true);
    });

    it('should fetch builtin templates', async () => {
      const templates = await api.templates.getBuiltin();

      expect(Array.isArray(templates)).toBe(true);
    });

    it('should fetch user-defined templates', async () => {
      const templates = await api.templates.getUserDefined('user-1');

      expect(Array.isArray(templates)).toBe(true);
    });

    it('should fetch templates by role', async () => {
      const templates = await api.templates.getByRole('engineer');

      expect(Array.isArray(templates)).toBe(true);
    });

    it('should fetch templates for work item type', async () => {
      const templates = await api.templates.getForWorkItemType('feature');

      expect(Array.isArray(templates)).toBe(true);
    });

    it('should clone a template', async () => {
      const template = await api.templates.clone(
        '1',
        'Cloned Template',
        'user-1'
      );

      expect(template).toHaveProperty('id');
      expect(template.name).toBe('Cloned Template');
    });
  });

  describe('Workers API', () => {
    it('should fetch worker pool', async () => {
      const pool = await api.workers.getPool();

      expect(pool).toHaveProperty('workers');
      expect(pool).toHaveProperty('activeCount');
      expect(pool).toHaveProperty('idleCount');
    });

    it('should spawn a worker', async () => {
      const worker = await api.workers.spawn('template-1', 'session-1');

      expect(worker).toHaveProperty('id');
      expect(worker).toHaveProperty('status');
    });

    it('should get available workers', async () => {
      const workers = await api.workers.getAvailable();

      expect(Array.isArray(workers)).toBe(true);
    });

    it('should get workers by template', async () => {
      const workers = await api.workers.getByTemplate('template-1');

      expect(Array.isArray(workers)).toBe(true);
    });

    it('should terminate a worker', async () => {
      const worker = await api.workers.terminate('worker-1');

      expect(worker.status).toBe('terminated');
    });

    it('should pause a worker', async () => {
      const worker = await api.workers.pause('worker-1');

      expect(worker.status).toBe('paused');
    });

    it('should resume a worker', async () => {
      const worker = await api.workers.resume('worker-1');

      expect(worker.status).not.toBe('paused');
    });

    it('should inject message into worker', async () => {
      const result = await api.workers.inject(
        'worker-1',
        'test message',
        'text'
      );

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('workerId');
    });

    it('should assign worker to work item', async () => {
      const worker = await api.workers.assign('worker-1', 'item-1', 'engineer');

      expect(worker).toHaveProperty('currentWorkItemId');
      expect(worker).toHaveProperty('currentRole');
    });

    it('should complete a worker', async () => {
      const worker = await api.workers.complete('worker-1');

      expect(worker).toHaveProperty('id');
    });

    it('should update worker metrics', async () => {
      const worker = await api.workers.updateMetrics('worker-1', {
        tokensUsed: 1000,
        costUsd: 0.05,
      });

      expect(worker.tokensUsed).toBe(1000);
      expect(worker.costUsd).toBe(0.05);
    });

    it('should report worker error', async () => {
      const worker = await api.workers.reportError(
        'worker-1',
        'Test error'
      );

      expect(worker.status).toBe('error');
    });
  });

  describe('Metrics API', () => {
    it('should fetch agent metrics', async () => {
      const metrics = await api.metrics.getAgents();

      expect(metrics).toHaveProperty('totalAgents');
      expect(metrics).toHaveProperty('activeAgents');
    });

    it('should fetch work metrics', async () => {
      const metrics = await api.metrics.getWork();

      expect(metrics).toHaveProperty('totalItems');
      expect(metrics).toHaveProperty('completedItems');
    });

    it('should fetch system metrics', async () => {
      const metrics = await api.metrics.getSystem();

      expect(metrics).toHaveProperty('uptime');
      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('cpuUsage');
    });
  });

  describe('Config API', () => {
    it('should fetch all provider settings', async () => {
      const settings = await api.config.getAll();

      expect(Array.isArray(settings)).toBe(true);
    });

    it('should fetch single provider setting', async () => {
      const setting = await api.config.getById('setting-1');

      expect(setting).toHaveProperty('id');
      expect(setting).toHaveProperty('providerType');
    });

    it('should create a provider setting', async () => {
      const setting = await api.config.create({
        providerType: 'openai',
        model: 'gpt-4',
      });

      expect(setting).toHaveProperty('id');
      expect(setting).toHaveProperty('providerType');
    });

    it('should update a provider setting', async () => {
      const setting = await api.config.update('setting-1', {
        model: 'gpt-4-turbo',
      });

      expect(setting.model).toBe('gpt-4-turbo');
    });

    it('should delete a provider setting', async () => {
      const result = await api.config.delete('setting-1');

      expect(result).toHaveProperty('success', true);
    });

    it('should test connection', async () => {
      const result = await api.config.testConnection({
        providerType: 'openai',
        apiKey: 'test-key',
      });

      expect(result).toHaveProperty('success');
    });

    it('should get available models', async () => {
      const models = await api.config.getModels('openai');

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });

    it('should set default provider', async () => {
      const setting = await api.config.setDefault('setting-1');

      expect(setting.isDefault).toBe(true);
    });
  });

  describe('Date Parsing in Responses', () => {
    it('should parse dates in work item responses', async () => {
      const item = await api.workItems.getById('1');

      expect(item.createdAt).toBeInstanceOf(Date);
      expect(item.updatedAt).toBeInstanceOf(Date);
    });

    it('should parse dates in template responses', async () => {
      const template = await api.templates.getById('1');

      expect(template.createdAt).toBeInstanceOf(Date);
      expect(template.updatedAt).toBeInstanceOf(Date);
    });

    it('should parse dates in worker responses', async () => {
      const worker = await api.workers.getByTemplate('template-1');

      expect(worker[0].spawnedAt).toBeInstanceOf(Date);
    });
  });

  describe('Error Handling', () => {
    it('should handle 401 unauthorized errors', async () => {
      server.use(
        http.get(`${API_BASE}/api/work-items`, () => {
          return HttpResponse.json(
            { message: 'Unauthorized' },
            { status: 401 }
          );
        })
      );

      try {
        await api.workItems.getAll();
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        const apiError = error as Record<string, unknown>;
        expect(apiError.type).toBe('unauthorized');
      }
    });

    it('should handle 404 not found errors', async () => {
      server.use(
        http.get(`${API_BASE}/api/work-items/:id`, () => {
          return HttpResponse.json(
            { message: 'Not found' },
            { status: 404 }
          );
        })
      );

      try {
        await api.workItems.getById('nonexistent');
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        const apiError = error as Record<string, unknown>;
        expect(apiError.type).toBe('not_found');
      }
    });

    it('should handle 500 server errors', async () => {
      server.use(
        http.get(`${API_BASE}/api/templates`, () => {
          return HttpResponse.json(
            { message: 'Server error' },
            { status: 500 }
          );
        })
      );

      try {
        await api.templates.getAll();
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        const apiError = error as Record<string, unknown>;
        expect(apiError.type).toBe('server');
      }
    });
  });

  describe('Query Parameters', () => {
    it('should pass query parameters correctly', async () => {
      let capturedUrl = '';

      server.use(
        http.get(`${API_BASE}/api/work-items`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json([]);
        })
      );

      await api.workItems.getAll({ status: 'ready', type: 'feature' });

      expect(capturedUrl).toContain('status=ready');
      expect(capturedUrl).toContain('type=feature');
    });

    it('should encode special characters in query parameters', async () => {
      let capturedUrl = '';

      server.use(
        http.get(`${API_BASE}/api/templates/by-role`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json([]);
        })
      );

      await api.templates.getByRole('senior engineer');

      expect(capturedUrl).toContain('senior%20engineer');
    });
  });
});
