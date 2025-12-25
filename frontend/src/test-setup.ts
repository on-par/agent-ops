/**
 * Vitest test setup file
 *
 * This file is run before all tests to set up the testing environment.
 * It imports jest-dom matchers and configures the testing environment.
 */

import '@testing-library/jest-dom/vitest';

// Mock scrollIntoView which is not implemented in jsdom
Element.prototype.scrollIntoView = () => {};

// Mock window.confirm for testing
window.confirm = () => true;
