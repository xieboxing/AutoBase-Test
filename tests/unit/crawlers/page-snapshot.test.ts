import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PageSnapshotter, takePageSnapshot } from '../../../src/crawlers/page-snapshot';
import type { PageSnapshot, InteractiveElement, FormInfo } from '../../../src/types/crawler.types';

// Mock Page
const createMockPage = (): any => ({
  title: vi.fn(async () => 'Test Page Title'),
  waitForLoadState: vi.fn(async () => {}),
  waitForTimeout: vi.fn(async () => {}),
  waitForFunction: vi.fn(async () => {}),
  screenshot: vi.fn(async () => Buffer.from('mock-screenshot')),
  evaluate: vi.fn(async (fn: Function) => {
    // 根据 evaluate 调用的内容返回模拟数据
    const mockInteractiveElements: InteractiveElement[] = [
      {
        tag: 'button',
        text: 'Submit',
        selector: '#submit-btn',
        alternativeSelectors: ['button:has-text("Submit")'],
        position: { x: 100, y: 100, width: 80, height: 40 },
        visible: true,
        clickable: true,
        disabled: false,
        attributes: { id: 'submit-btn', type: 'submit' },
        type: 'submit',
      },
      {
        tag: 'a',
        text: 'Home',
        selector: '#home-link',
        alternativeSelectors: ['a:has-text("Home")'],
        position: { x: 50, y: 20, width: 60, height: 30 },
        visible: true,
        clickable: true,
        disabled: false,
        attributes: { id: 'home-link', href: '/' },
        type: 'a',
      },
    ];

    const mockForms: FormInfo[] = [
      {
        selector: '#login-form',
        action: '/login',
        method: 'POST',
        fields: [
          {
            selector: '#email',
            type: 'email',
            name: 'email',
            label: 'Email Address',
            required: true,
            placeholder: 'Enter your email',
          },
          {
            selector: '#password',
            type: 'password',
            name: 'password',
            label: 'Password',
            required: true,
            placeholder: 'Enter your password',
          },
        ],
      },
    ];

    const mockMetadata = {
      domNodes: 150,
      scripts: 5,
      stylesheets: 3,
    };

    // 根据调用返回相应数据
    const fnStr = fn.toString();
    if (fnStr.includes('interactiveSelectors') || fnStr.includes('interactiveElements')) {
      return mockInteractiveElements;
    }
    if (fnStr.includes('forms') || fnStr.includes('form')) {
      return mockForms;
    }
    if (fnStr.includes('domNodes') || fnStr.includes('metadata')) {
      return mockMetadata;
    }
    if (fnStr.includes('simplifyNode') || fnStr.includes('clone')) {
      return '<div><button>Submit</button></div>';
    }

    return mockInteractiveElements;
  }),
  on: vi.fn(),
  goto: vi.fn(async () => ({ ok: () => true })),
  setDefaultTimeout: vi.fn(),
});

describe('PageSnapshotter', () => {
  let snapshotter: PageSnapshotter;
  let mockPage: any;

  beforeEach(() => {
    snapshotter = new PageSnapshotter();
    mockPage = createMockPage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create snapshotter with default config', () => {
    expect(snapshotter).toBeDefined();
  });

  it('should create snapshotter with custom config', () => {
    const customSnapshotter = new PageSnapshotter({
      fullPageScreenshot: false,
      viewportScreenshot: true,
      timeout: 10000,
    });
    expect(customSnapshotter).toBeDefined();
  });

  it('should take a complete page snapshot', async () => {
    const snapshot = await snapshotter.takeSnapshot(mockPage, 'https://example.com');

    expect(snapshot).toBeDefined();
    expect(snapshot.url).toBe('https://example.com');
    expect(snapshot.title).toBe('Test Page Title');
    expect(snapshot.timestamp).toBeDefined();
    expect(snapshot.interactiveElements).toBeDefined();
    expect(snapshot.forms).toBeDefined();
    expect(snapshot.networkRequests).toBeDefined();
    expect(snapshot.metadata).toBeDefined();
  });

  it('should capture screenshots', async () => {
    const snapshot = await snapshotter.takeSnapshot(mockPage, 'https://example.com');

    expect(snapshot.screenshot).toBeDefined();
    expect(snapshot.screenshot.fullPage).toBeDefined();
    expect(snapshot.screenshot.viewport).toBeDefined();
  });

  it('should extract interactive elements', async () => {
    const snapshot = await snapshotter.takeSnapshot(mockPage, 'https://example.com');

    expect(snapshot.interactiveElements.length).toBeGreaterThan(0);
    const firstElement = snapshot.interactiveElements[0];
    expect(firstElement.tag).toBeDefined();
    expect(firstElement.selector).toBeDefined();
    expect(firstElement.position).toBeDefined();
    expect(firstElement.visible).toBeDefined();
    expect(firstElement.clickable).toBeDefined();
  });

  it('should extract forms and fields', async () => {
    const snapshot = await snapshotter.takeSnapshot(mockPage, 'https://example.com');

    expect(snapshot.forms.length).toBeGreaterThan(0);
    const firstForm = snapshot.forms[0];
    expect(firstForm.selector).toBeDefined();
    expect(firstForm.fields.length).toBeGreaterThan(0);
    expect(firstForm.fields[0].type).toBeDefined();
    expect(firstForm.fields[0].required).toBeDefined();
  });

  it('should capture page metadata', async () => {
    const snapshot = await snapshotter.takeSnapshot(mockPage, 'https://example.com');

    expect(snapshot.metadata.domNodes).toBeGreaterThanOrEqual(0);
    expect(snapshot.metadata.scripts).toBeGreaterThanOrEqual(0);
    expect(snapshot.metadata.stylesheets).toBeGreaterThanOrEqual(0);
    expect(snapshot.metadata.loadTime).toBeGreaterThanOrEqual(0);
  });

  it('should capture DOM structure', async () => {
    const snapshot = await snapshotter.takeSnapshot(mockPage, 'https://example.com');

    expect(snapshot.html).toBeDefined();
    expect(snapshot.html.length).toBeGreaterThan(0);
  });

  it('should respect config to skip DOM capture', async () => {
    const noDomSnapshotter = new PageSnapshotter({
      captureDom: false,
    });

    const snapshot = await noDomSnapshotter.takeSnapshot(mockPage, 'https://example.com');
    expect(snapshot.html).toBe('');
  });

  it('should handle screenshot errors gracefully', async () => {
    mockPage.screenshot.mockRejectedValue(new Error('Screenshot failed'));

    const snapshot = await snapshotter.takeSnapshot(mockPage, 'https://example.com');

    // Should still return snapshot even if screenshot fails
    expect(snapshot).toBeDefined();
    expect(snapshot.screenshot.fullPage).toBe('');
    expect(snapshot.screenshot.viewport).toBe('');
  });
});

describe('takePageSnapshot helper function', () => {
  it('should provide quick snapshot functionality', async () => {
    const mockPage = createMockPage();
    const snapshot = await takePageSnapshot(mockPage, 'https://example.com');

    expect(snapshot).toBeDefined();
    expect(snapshot.url).toBe('https://example.com');
  });

  it('should accept custom config', async () => {
    const mockPage = createMockPage();
    const snapshot = await takePageSnapshot(mockPage, 'https://example.com', {
      fullPageScreenshot: false,
    });

    expect(snapshot).toBeDefined();
  });
});

describe('InteractiveElement extraction', () => {
  it('should have correct element attributes', async () => {
    const snapshotter = new PageSnapshotter();
    const mockPage = createMockPage();

    const snapshot = await snapshotter.takeSnapshot(mockPage, 'https://example.com');

    const button = snapshot.interactiveElements.find(el => el.tag === 'button');
    expect(button).toBeDefined();
    expect(button?.text).toBeDefined();
    expect(button?.selector).toBeDefined();
    expect(button?.alternativeSelectors).toBeDefined();
    expect(button?.attributes).toBeDefined();
  });

  it('should detect disabled elements', async () => {
    // Mock page with disabled button
    const mockPage = createMockPage();

    // The order of page.evaluate calls is:
    // 1. getSimplifiedDom (returns string)
    // 2. extractInteractiveElements (returns InteractiveElement[])
    // 3. extractForms (returns FormInfo[])
    // 4. getPageMetadata (returns metadata object)

    let callCount = 0;
    mockPage.evaluate.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return '<html></html>'; // DOM
      if (callCount === 2) return [ // Interactive elements
        {
          tag: 'button',
          text: 'Disabled Button',
          selector: '#disabled-btn',
          alternativeSelectors: [],
          position: { x: 100, y: 100, width: 80, height: 40 },
          visible: true,
          clickable: false,
          disabled: true,
          attributes: { id: 'disabled-btn', disabled: 'true' },
          type: 'button',
        },
      ];
      if (callCount === 3) return []; // Forms
      return { domNodes: 0, scripts: 0, stylesheets: 0 }; // Metadata
    });

    const snapshotter = new PageSnapshotter();
    const snapshot = await snapshotter.takeSnapshot(mockPage, 'https://example.com');

    const disabledBtn = snapshot.interactiveElements.find(el => el.disabled);
    expect(disabledBtn).toBeDefined();
    expect(disabledBtn?.clickable).toBe(false);
  });
});

describe('Form extraction', () => {
  it('should extract form fields with validation', async () => {
    const mockPage = createMockPage();

    let callCount = 0;
    mockPage.evaluate.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return '<html></html>'; // DOM
      if (callCount === 2) return []; // Interactive elements
      if (callCount === 3) return [ // Forms
        {
          selector: '#signup-form',
          action: '/signup',
          method: 'POST',
          fields: [
            {
              selector: '#username',
              type: 'text',
              name: 'username',
              label: 'Username',
              required: true,
              placeholder: 'Enter username',
              validation: {
                minLength: 3,
                maxLength: 20,
              },
            },
            {
              selector: '#email',
              type: 'email',
              name: 'email',
              label: 'Email',
              required: true,
              placeholder: 'Enter email',
              validation: {
                pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
              },
            },
          ],
        },
      ];
      return { domNodes: 0, scripts: 0, stylesheets: 0 }; // Metadata
    });

    const snapshotter = new PageSnapshotter();
    const snapshot = await snapshotter.takeSnapshot(mockPage, 'https://example.com');

    expect(snapshot.forms[0].fields.length).toBe(2);
    expect(snapshot.forms[0].fields[0].validation).toBeDefined();
  });

  it('should detect required fields', async () => {
    const mockPage = createMockPage();
    const snapshotter = new PageSnapshotter();
    const snapshot = await snapshotter.takeSnapshot(mockPage, 'https://example.com');

    const requiredField = snapshot.forms[0].fields.find(f => f.required);
    expect(requiredField).toBeDefined();
  });
});

describe('Network request tracking', () => {
  it('should capture network requests', async () => {
    // Setup request listener mock
    const mockPage = createMockPage();
    mockPage.on.mockImplementation((event: string, callback: Function) => {
      if (event === 'request') {
        // Simulate a request
        const mockRequest = {
          url: () => 'https://api.example.com/data',
          method: () => 'GET',
          resourceType: () => 'xhr',
          headers: () => ({ 'content-type': 'application/json' }),
          postData: () => null,
          response: vi.fn(async () => ({
            status: () => 200,
            headers: () => ({ 'content-type': 'application/json' }),
          })),
        };
        callback(mockRequest);
      }
    });

    const snapshotter = new PageSnapshotter();
    const snapshot = await snapshotter.takeSnapshot(mockPage, 'https://example.com');

    expect(snapshot.networkRequests).toBeDefined();
  });
});