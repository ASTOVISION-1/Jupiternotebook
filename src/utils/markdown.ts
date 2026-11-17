import { slugifyHeading } from './notebookLogic';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(raw: string): string {
  const escaped = escapeHtml(raw);
  // Protect inline code spans first
  const codeSpans: string[] = [];
  let text = escaped.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = codeSpans.length;
    codeSpans.push(`<code>${code}</code>`);
    return `\u0000CODE${idx}\u0000`;
  });

  // Links [label](url) - allow only http(s) or relative/hash links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const cleanHref = href.trim();
    const isSafe =
      cleanHref.startsWith('https://') ||
      cleanHref.startsWith('http://') ||
      cleanHref.startsWith('#') ||
      cleanHref.startsWith('/');
    if (!isSafe) return label;
    return `<a href="${cleanHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Bold & italic
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Restore inline code
  text = text.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx) => codeSpans[Number(idx)] ?? '');
  return text;
}

export function renderMarkdownToHtml(source: string, cellId = ''): string {
  if (!source.trim()) {
    return '<p class="text-[#6E7681] italic">Empty markdown cell. Double-click or click Edit to write.</p>';
  }

  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const lang = escapeHtml(trimmed.slice(3).trim());
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]));
        i += 1;
      }
      i += 1; // skip closing fence
      const langAttr = lang ? ` data-lang="${lang}"` : '';
      html.push(`<pre${langAttr}><code>${codeLines.join('\n')}</code></pre>`);
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const rawText = headingMatch[2];
      const plain = rawText.replace(/[*_`]/g, '').trim();
      const id = cellId ? `${cellId}-${slugifyHeading(plain)}` : slugifyHeading(plain);
      html.push(`<h${level} id="${escapeHtml(id)}">${renderInline(rawText)}</h${level}>`);
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      html.push('<hr class="my-4 border-white/10" />');
      i += 1;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(renderInline(lines[i].trim().replace(/^>\s?/, '')));
        i += 1;
      }
      html.push(`<blockquote><p>${quoteLines.join('<br />')}</p></blockquote>`);
      continue;
    }

    // Markdown table (header + separator)
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])
    ) {
      const splitRow = (row: string) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());

      const headers = splitRow(lines[i]);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|')) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      const thHtml = headers.map((h) => `<th>${renderInline(h)}</th>`).join('');
      const bodyHtml = rows
        .map(
          (r) =>
            `<tr>${headers.map((_h, idx) => `<td>${renderInline(r[idx] ?? '')}</td>`).join('')}</tr>`
        )
        .join('');
      html.push(`<table><thead><tr>${thHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(`<li>${renderInline(lines[i].trim().replace(/^[-*+]\s+/, ''))}</li>`);
        i += 1;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(`<li>${renderInline(lines[i].trim().replace(/^\d+\.\s+/, ''))}</li>`);
        i += 1;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Paragraph (consume until blank line or block starter)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('>')
    ) {
      paraLines.push(renderInline(lines[i].trim()));
      i += 1;
    }
    html.push(`<p>${paraLines.join(' ')}</p>`);
  }

  return html.join('\n');
}
