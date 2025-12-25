/**
 * Vitest test setup file
 *
 * This file is run before all tests to set up the testing environment.
 * It imports jest-dom matchers and configures the testing environment.
 */

import '@testing-library/jest-dom/vitest';
import { server } from './mocks/server';
import { beforeAll, afterEach, afterAll } from 'vitest';

// Mock scrollIntoView which is not implemented in jsdom
Element.prototype.scrollIntoView = () => {};

// Mock window.confirm for testing
window.confirm = () => true;

// MSW setup
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
