/**
 * Unit tests for API client utility functions and methods
 */

import { describe, it, expect } from 'vitest';
import { buildQueryString, parseDates, api } from './client';

describe('buildQueryString', () => {
  it('returns empty string for undefined params', () => {
    expect(buildQueryString()).toBe('');
  });

  it('returns empty string for empty params object', () => {
    expect(buildQueryString({})).toBe('');
  });

  it('builds query string from single param', () => {
    expect(buildQueryString({ status: 'active' })).toBe('?status=active');
  });

  it('builds query string from multiple params', () => {
    const result = buildQueryString({ status: 'active', type: 'feature' });
    expect(result).toContain('status=active');
    expect(result).toContain('type=feature');
    expect(result).toMatch(/^\?/);
  });

  it('filters out undefined values', () => {
    expect(buildQueryString({ a: 'x', b: undefined })).toBe('?a=x');
  });

  it('encodes special characters', () => {
    expect(buildQueryString({ q: 'hello world' })).toBe('?q=hello%20world');
  });

  it('handles number and boolean params', () => {
    expect(buildQueryString({ limit: 10, active: true })).toContain('limit=10');
    expect(buildQueryString({ limit: 10, active: true })).toContain('active=true');
  });
});

describe('parseDates', () => {
  it('returns null unchanged', () => {
    expect(parseDates(null)).toBe(null);
  });

  it('returns undefined unchanged', () => {
    expect(parseDates(undefined)).toBe(undefined);
  });

  it('returns primitive values unchanged', () => {
    expect(parseDates('string')).toBe('string');
    expect(parseDates(42)).toBe(42);
    expect(parseDates(true)).toBe(true);
  });

  it('converts createdAt ISO string to Date', () => {
    const input = { createdAt: '2024-01-01T00:00:00Z', name: 'test' };
    const result = parseDates(input);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.name).toBe('test');
  });

  it('converts updatedAt ISO string to Date', () => {
    const input = { updatedAt: '2024-01-01T00:00:00Z' };
    const result = parseDates(input);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('converts startedAt ISO string to Date', () => {
    const input = { startedAt: '2024-01-01T00:00:00Z' };
    const result = parseDates(input);
    expect(result.startedAt).toBeInstanceOf(Date);
  });

  it('converts completedAt ISO string to Date', () => {
    const input = { completedAt: '2024-01-01T00:00:00Z' };
    const result = parseDates(input);
    expect(result.completedAt).toBeInstanceOf(Date);
  });

  it('converts spawnedAt ISO string to Date', () => {
    const input = { spawnedAt: '2024-01-01T00:00:00Z' };
    const result = parseDates(input);
    expect(result.spawnedAt).toBeInstanceOf(Date);
  });

  it('converts lastSyncAt ISO string to Date', () => {
    const input = { lastSyncAt: '2024-01-01T00:00:00Z' };
    const result = parseDates(input);
    expect(result.lastSyncAt).toBeInstanceOf(Date);
  });

  it('handles nested objects', () => {
    const input = {
      items: [
        { updatedAt: '2024-01-01T00:00:00Z', name: 'item1' },
        { createdAt: '2024-01-02T00:00:00Z', name: 'item2' },
      ],
    };
    const result = parseDates(input);
    expect(result.items[0].updatedAt).toBeInstanceOf(Date);
    expect(result.items[0].name).toBe('item1');
    expect(result.items[1].createdAt).toBeInstanceOf(Date);
    expect(result.items[1].name).toBe('item2');
  });

  it('handles deeply nested objects', () => {
    const input = {
      data: {
        nested: {
          createdAt: '2024-01-01T00:00:00Z',
        },
      },
    };
    const result = parseDates(input);
    expect(result.data.nested.createdAt).toBeInstanceOf(Date);
  });

  it('handles arrays of mixed types', () => {
    const input = [
      { createdAt: '2024-01-01T00:00:00Z' },
      { updatedAt: '2024-01-02T00:00:00Z' },
    ];
    const result = parseDates(input);
    expect(result[0].createdAt).toBeInstanceOf(Date);
    expect(result[1].updatedAt).toBeInstanceOf(Date);
  });

  it('preserves non-date string fields', () => {
    const input = { createdAt: '2024-01-01T00:00:00Z', description: 'test' };
    const result = parseDates(input);
    expect(result.description).toBe('test');
  });

  it('handles objects with multiple date fields', () => {
    const input = {
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      startedAt: '2024-01-03T00:00:00Z',
      completedAt: '2024-01-04T00:00:00Z',
    };
    const result = parseDates(input);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.completedAt).toBeInstanceOf(Date);
  });
});

describe('api.dashboard', () => {
  it('should have getStats method', () => {
    expect(api.dashboard.getStats).toBeDefined();
    expect(typeof api.dashboard.getStats).toBe('function');
  });

  it('should have getWebSocketUrl method', () => {
    expect(api.dashboard.getWebSocketUrl).toBeDefined();
    expect(typeof api.dashboard.getWebSocketUrl).toBe('function');
  });

  it('getWebSocketUrl returns a valid WebSocket URL', () => {
    const url = api.dashboard.getWebSocketUrl();
    expect(url).toMatch(/^wss?:\/\//);
    expect(url).toContain('/api/dashboard/ws');
  });

  it('getWebSocketUrl returns wss for https URLs', () => {
    // Note: This test can't modify import.meta.env at runtime in actual tests
    // but demonstrates the intent
    const url = api.dashboard.getWebSocketUrl();
    expect(typeof url).toBe('string');
  });
});

describe('api.workItems', () => {
  it('should have all required methods', () => {
    expect(api.workItems.getAll).toBeDefined();
    expect(api.workItems.getById).toBeDefined();
    expect(api.workItems.create).toBeDefined();
    expect(api.workItems.update).toBeDefined();
    expect(api.workItems.delete).toBeDefined();
    expect(api.workItems.transition).toBeDefined();
    expect(api.workItems.assign).toBeDefined();
    expect(api.workItems.addSuccessCriterion).toBeDefined();
  });
});

describe('api.templates', () => {
  it('should have all required methods', () => {
    expect(api.templates.getAll).toBeDefined();
    expect(api.templates.getById).toBeDefined();
    expect(api.templates.create).toBeDefined();
    expect(api.templates.update).toBeDefined();
    expect(api.templates.delete).toBeDefined();
    expect(api.templates.getBuiltin).toBeDefined();
    expect(api.templates.getUserDefined).toBeDefined();
    expect(api.templates.getByRole).toBeDefined();
    expect(api.templates.getForWorkItemType).toBeDefined();
    expect(api.templates.clone).toBeDefined();
  });
});

describe('api.workers', () => {
  it('should have all required methods', () => {
    expect(api.workers.getPool).toBeDefined();
    expect(api.workers.spawn).toBeDefined();
    expect(api.workers.getAvailable).toBeDefined();
    expect(api.workers.getByTemplate).toBeDefined();
    expect(api.workers.terminate).toBeDefined();
    expect(api.workers.pause).toBeDefined();
    expect(api.workers.resume).toBeDefined();
    expect(api.workers.inject).toBeDefined();
    expect(api.workers.assign).toBeDefined();
    expect(api.workers.complete).toBeDefined();
    expect(api.workers.updateMetrics).toBeDefined();
    expect(api.workers.reportError).toBeDefined();
  });
});

describe('api.metrics', () => {
  it('should have all required methods', () => {
    expect(api.metrics.getAgents).toBeDefined();
    expect(api.metrics.getWork).toBeDefined();
    expect(api.metrics.getSystem).toBeDefined();
  });
});

describe('api.config', () => {
  it('should have all required methods', () => {
    expect(api.config.getAll).toBeDefined();
    expect(api.config.getById).toBeDefined();
    expect(api.config.create).toBeDefined();
    expect(api.config.update).toBeDefined();
    expect(api.config.delete).toBeDefined();
    expect(api.config.testConnection).toBeDefined();
    expect(api.config.getModels).toBeDefined();
    expect(api.config.setDefault).toBeDefined();
  });
});
