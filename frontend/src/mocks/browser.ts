/**
 * MSW Browser setup for development environment
 * This configures MSW to intercept network requests in the browser
 */

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
