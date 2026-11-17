export interface CommandDefinition {
  id: string;
  title: string;
  category: 'Cell' | 'Kernel' | 'Terminal' | 'File' | 'View';
  shortcut?: string;
  keywords: string;
}

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  {
    id: 'cell.run_and_advance',
    title: 'Run Active Cell and Advance',
    category: 'Cell',
    shortcut: 'Shift+Enter',
    keywords: 'execute play next',
  },
  {
    id: 'cell.run_in_place',
    title: 'Run Active Cell in Place',
    category: 'Cell',
    shortcut: 'Ctrl+Enter',
    keywords: 'execute stay',
  },
  {
    id: 'cell.run_all',
    title: 'Run All Cells in Notebook',
    category: 'Cell',
    shortcut: 'Ctrl+Shift+Enter',
    keywords: 'execute all notebook',
  },
  {
    id: 'cell.insert_code_below',
    title: 'Insert Code Cell Below',
    category: 'Cell',
    shortcut: 'B',
    keywords: 'add new code cell below',
  },
  {
    id: 'cell.insert_code_above',
    title: 'Insert Code Cell Above',
    category: 'Cell',
    shortcut: 'A',
    keywords: 'add new code cell above',
  },
  {
    id: 'cell.insert_markdown_below',
    title: 'Insert Markdown Cell Below',
    category: 'Cell',
    keywords: 'add text note heading documentation',
  },
  {
    id: 'cell.toggle_type',
    title: 'Toggle Cell Type (Code / Markdown)',
    category: 'Cell',
    shortcut: 'M / Y',
    keywords: 'convert switch markdown code',
  },
  {
    id: 'cell.move_up',
    title: 'Move Active Cell Up',
    category: 'Cell',
    keywords: 'reorder up',
  },
  {
    id: 'cell.move_down',
    title: 'Move Active Cell Down',
    category: 'Cell',
    keywords: 'reorder down',
  },
  {
    id: 'cell.send_to_terminal',
    title: 'Run Active Cell in Integrated Terminal',
    category: 'Terminal',
    keywords: 'bash shell execute terminal',
  },
  {
    id: 'cell.clear_all_outputs',
    title: 'Clear All Cell Outputs',
    category: 'Cell',
    keywords: 'clean reset output',
  },
  {
    id: 'cell.delete',
    title: 'Delete Active Cell',
    category: 'Cell',
    shortcut: 'D D',
    keywords: 'remove trash',
  },
  {
    id: 'kernel.restart',
    title: 'Restart Active Kernel',
    category: 'Kernel',
    keywords: 'reboot clear variables python node',
  },
  {
    id: 'kernel.interrupt',
    title: 'Interrupt Kernel Execution',
    category: 'Kernel',
    keywords: 'stop kill cancel',
  },
  {
    id: 'kernel.switch_python',
    title: 'Switch Kernel to Python 3.10',
    category: 'Kernel',
    keywords: 'python3 runtime',
  },
  {
    id: 'kernel.switch_node',
    title: 'Switch Kernel to Node.js 22',
    category: 'Kernel',
    keywords: 'javascript js node runtime',
  },
  {
    id: 'terminal.toggle',
    title: 'Toggle Integrated Terminal',
    category: 'Terminal',
    shortcut: 'Ctrl+`',
    keywords: 'bash shell console drawer',
  },
  {
    id: 'terminal.new_session',
    title: 'Open New Terminal Session',
    category: 'Terminal',
    keywords: 'tab bash shell',
  },
  {
    id: 'terminal.clear',
    title: 'Clear Active Terminal Output',
    category: 'Terminal',
    shortcut: 'Ctrl+L',
    keywords: 'clean terminal log',
  },
  {
    id: 'terminal.toggle_permissions',
    title: 'Toggle Command Permissions (All Allowed / Restricted)',
    category: 'Terminal',
    keywords: 'allow all permissions unrestricted sandbox bash shell',
  },
  {
    id: 'file.new_notebook',
    title: 'Create New Notebook',
    category: 'File',
    keywords: 'ipynb new file',
  },
  {
    id: 'file.save',
    title: 'Save Notebook',
    category: 'File',
    shortcut: 'Ctrl+S',
    keywords: 'write disk ipynb',
  },
  {
    id: 'file.export',
    title: 'Export Notebook (.ipynb)',
    category: 'File',
    keywords: 'download json ipynb',
  },
  {
    id: 'view.toggle_sidebar',
    title: 'Toggle Explorer Sidebar',
    category: 'View',
    shortcut: 'Ctrl+B',
    keywords: 'files outline variables panel',
  },
  {
    id: 'view.show_variables',
    title: 'Inspect Kernel Variables',
    category: 'View',
    keywords: 'memory state inspector who',
  },
  {
    id: 'view.show_outline',
    title: 'Show Notebook Outline',
    category: 'View',
    keywords: 'toc headings navigation',
  },
];

export function filterCommands(
  commands: CommandDefinition[],
  query: string
): CommandDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  return commands.filter(
    (cmd) =>
      cmd.title.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      cmd.keywords.toLowerCase().includes(q)
  );
}
