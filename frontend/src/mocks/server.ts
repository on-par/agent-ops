/**
 * MSW Server setup for testing environment
 * This configures MSW to intercept network requests during tests
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
