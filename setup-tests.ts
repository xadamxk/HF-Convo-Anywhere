// Jest setup file for global test configuration

/**
 * In-memory chrome.storage.local. Values are deep-copied on the way in and out,
 * like chrome.storage, and answer after a tick. Cleared before each test.
 */
const items: Record<string, unknown> = {};
const copy = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value));
const keyList = (keys?: string | string[] | null) =>
  keys == null ? Object.keys(items) : Array.isArray(keys) ? keys : [keys];
const later = <T>(value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), 0));

const local = {
  items,
  get: jest.fn((keys?: string | string[] | null) => {
    const result: Record<string, unknown> = {};
    for (const key of keyList(keys)) {
      if (key in items) result[key] = copy(items[key]);
    }
    return later(result);
  }),
  set: jest.fn((values: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(values)) {
      items[key] = copy(value);
    }
    return later(undefined);
  }),
  remove: jest.fn((keys: string | string[]) => {
    for (const key of keyList(keys)) delete items[key];
    return later(undefined);
  }),
  clear: jest.fn(() => {
    for (const key of Object.keys(items)) delete items[key];
    return later(undefined);
  }),
};

(global as any).chrome = {
  storage: { local },
  runtime: {
    getURL: jest.fn((path: string) => `chrome-extension://test-id/${path}`),
  },
};

beforeEach(() => {
  for (const key of Object.keys(items)) delete items[key];
});

// Silence routine logging in tests, but let warnings and errors through so
// they show up in the output. They are still mocks, so tests can assert on them.
const { warn, error } = console;
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn((...args: any[]) => warn(...args)),
  error: jest.fn((...args: any[]) => error(...args)),
};
