/**
 * 测试夹具 - Page Snapshot
 * 提供模拟的页面快照用于测试
 */

import type { PageSnapshot, InteractiveElement } from '@/types/crawler.types.js';

/**
 * 创建 Mock 页面快照
 */
export function createMockPageSnapshot(options: {
  url?: string;
  title?: string;
  interactiveElements?: InteractiveElement[];
} = {}): PageSnapshot {
  const defaultUrl = 'https://example.com';
  const defaultTitle = 'Test Page';

  const defaultElements: InteractiveElement[] = [
    {
      selector: '#login-btn',
      tag: 'button',
      text: '登录',
      visible: true,
      clickable: true,
      attributes: { id: 'login-btn', type: 'submit' },
    },
    {
      selector: '#username',
      tag: 'input',
      text: '',
      visible: true,
      clickable: false,
      attributes: { id: 'username', type: 'text', placeholder: '用户名' },
    },
    {
      selector: '#password',
      tag: 'input',
      text: '',
      visible: true,
      clickable: false,
      attributes: { id: 'password', type: 'password', placeholder: '密码' },
    },
    {
      selector: 'a[href="/about"]',
      tag: 'a',
      text: '关于我们',
      visible: true,
      clickable: true,
      attributes: { href: '/about' },
    },
  ];

  return {
    url: options.url ?? defaultUrl,
    title: options.title ?? defaultTitle,
    html: '<html><body><h1>Test Page</h1></body></html>',
    interactiveElements: options.interactiveElements ?? defaultElements,
    forms: [],
    screenshot: Buffer.from('mock-screenshot'),
    timestamp: new Date().toISOString(),
    metadata: {
      loadTime: 1000,
      resources: [],
      consoleErrors: [],
    },
  };
}

/**
 * 创建登录页面快照
 */
export function createLoginPageSnapshot(): PageSnapshot {
  return createMockPageSnapshot({
    url: 'https://example.com/login',
    title: '登录',
    interactiveElements: [
      {
        selector: '#username',
        tag: 'input',
        text: '',
        visible: true,
        clickable: false,
        attributes: { id: 'username', type: 'text', name: 'username' },
      },
      {
        selector: '#password',
        tag: 'input',
        text: '',
        visible: true,
        clickable: false,
        attributes: { id: 'password', type: 'password', name: 'password' },
      },
      {
        selector: 'button[type="submit"]',
        tag: 'button',
        text: '登录',
        visible: true,
        clickable: true,
        attributes: { type: 'submit' },
      },
      {
        selector: 'a[href="/register"]',
        tag: 'a',
        text: '注册账号',
        visible: true,
        clickable: true,
        attributes: { href: '/register' },
      },
    ],
  });
}

/**
 * 创建商品列表页面快照
 */
export function createProductListPageSnapshot(): PageSnapshot {
  return createMockPageSnapshot({
    url: 'https://example.com/products',
    title: '商品列表',
    interactiveElements: [
      {
        selector: '#search-input',
        tag: 'input',
        text: '',
        visible: true,
        clickable: false,
        attributes: { id: 'search-input', type: 'search', placeholder: '搜索商品' },
      },
      {
        selector: 'button.search-btn',
        tag: 'button',
        text: '搜索',
        visible: true,
        clickable: true,
        attributes: { class: 'search-btn' },
      },
      {
        selector: '.product-item:first-child',
        tag: 'div',
        text: '商品1',
        visible: true,
        clickable: true,
        attributes: { class: 'product-item', 'data-id': '1' },
      },
      {
        selector: '.add-to-cart',
        tag: 'button',
        text: '加入购物车',
        visible: true,
        clickable: true,
        attributes: { class: 'add-to-cart' },
      },
    ],
  });
}