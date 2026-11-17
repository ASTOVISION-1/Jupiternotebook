import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdownToHtml } from './markdown';

test('renderMarkdownToHtml escapes raw HTML tags to prevent XSS', () => {
  const html = renderMarkdownToHtml('<script>alert("xss")</script>');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('renderMarkdownToHtml renders headings with cell anchor IDs, bold, and code', () => {
  const html = renderMarkdownToHtml('# Hello **World**\n\nRun `x = 1`.', 'c1');
  assert.ok(html.includes('<h1 id="c1-hello-world">Hello <strong>World</strong></h1>'));
  assert.ok(html.includes('<code>x = 1</code>'));
});

test('renderMarkdownToHtml renders fenced code blocks and tables', () => {
  const md = [
    '```python',
    'print("hi")',
    '```',
    '',
    '| Key | Value |',
    '| --- | --- |',
    '| alpha | 10 |',
  ].join('\n');
  const html = renderMarkdownToHtml(md);
  assert.ok(html.includes('<pre data-lang="python"><code>print(&quot;hi&quot;)</code></pre>'));
  assert.ok(html.includes('<table><thead><tr><th>Key</th><th>Value</th></tr></thead>'));
  assert.ok(html.includes('<td>alpha</td><td>10</td>'));
});
