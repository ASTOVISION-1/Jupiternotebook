import path from 'node:path';

export type MagicCommand =
  | { kind: 'code'; code: string }
  | { kind: 'bash_cell'; script: string }
  | { kind: 'bash_line'; command: string; remainingCode: string }
  | { kind: 'who' }
  | { kind: 'reset' }
  | { kind: 'pwd' }
  | { kind: 'cd'; target: string }
  | { kind: 'ls'; args: string }
  | { kind: 'env'; assignment?: { key: string; value: string } }
  | { kind: 'pip'; args: string }
  | { kind: 'npm'; args: string }
  | { kind: 'npx'; args: string }
  | { kind: 'writefile'; filename: string; content: string }
  | { kind: 'time_cell'; code: string }
  | { kind: 'time_line'; code: string };

export function buildUnrestrictedShellPrelude(): string {
  return `if ! command -v sudo >/dev/null 2>&1; then
  sudo() {
    while [ $# -gt 0 ]; do
      case "$1" in
        -E|-H|-n|-s|-i|-k|-K|-b|-P|-S|-v) shift ;;
        -u|-g|-p|-C|-D|-r|-t|-U) shift 2 ;;
        --) shift; break ;;
        -*) shift ;;
        *) break ;;
      esac
    done
    "$@"
  }
fi`;
}

export function parseCellMagic(rawCode: string): MagicCommand {
  const trimmed = rawCode.trim();
  if (!trimmed) {
    return { kind: 'code', code: rawCode };
  }

  const lines = rawCode.replace(/\r\n/g, '\n').split('\n');
  const firstLine = lines[0].trim();

  if (
    firstLine === '%%bash' ||
    firstLine === '%%sh' ||
    firstLine === '%%shell' ||
    firstLine === '%%cmd'
  ) {
    return { kind: 'bash_cell', script: lines.slice(1).join('\n') };
  }

  for (const prefix of [
    '%bash ',
    '%sh ',
    '%shell ',
    '%cmd ',
    '%sudo ',
    '%su ',
    '%apt ',
    '%apt-get ',
    '%dpkg ',
  ]) {
    if (firstLine.startsWith(prefix)) {
      const stripPercent =
        prefix === '%sudo ' ||
        prefix === '%su ' ||
        prefix === '%apt ' ||
        prefix === '%apt-get ' ||
        prefix === '%dpkg ';
      const cmd = stripPercent
        ? firstLine.slice(1).trim()
        : firstLine.slice(prefix.length).trim();
      return {
        kind: 'bash_line',
        command: cmd,
        remainingCode: lines.slice(1).join('\n'),
      };
    }
  }

  if (firstLine.startsWith('%%writefile ')) {
    const filename = firstLine.slice('%%writefile '.length).trim();
    return {
      kind: 'writefile',
      filename,
      content: lines.slice(1).join('\n'),
    };
  }

  if (firstLine === '%%time') {
    return { kind: 'time_cell', code: lines.slice(1).join('\n') };
  }

  if (firstLine.startsWith('%time ')) {
    const restOfFirst = firstLine.slice('%time '.length).trim();
    const restLines = lines.slice(1).join('\n');
    const combined = [restOfFirst, restLines].filter(Boolean).join('\n');
    return { kind: 'time_line', code: combined };
  }

  if (trimmed === '%who' || trimmed === '%whos') {
    return { kind: 'who' };
  }

  if (trimmed === '%reset') {
    return { kind: 'reset' };
  }

  if (trimmed === '%pwd') {
    return { kind: 'pwd' };
  }

  if (trimmed === '%cd' || trimmed.startsWith('%cd ')) {
    return { kind: 'cd', target: trimmed.slice(3).trim() };
  }

  if (trimmed === '%ls' || trimmed.startsWith('%ls ')) {
    return { kind: 'ls', args: trimmed.slice(3).trim() };
  }

  if (trimmed === '%env' || trimmed.startsWith('%env ') || trimmed.startsWith('%set_env ')) {
    const body = trimmed.startsWith('%set_env ')
      ? trimmed.slice('%set_env '.length).trim()
      : trimmed.slice('%env'.length).trim();
    if (!body) {
      return { kind: 'env' };
    }
    const eqIdx = body.indexOf('=');
    if (eqIdx !== -1) {
      return {
        kind: 'env',
        assignment: {
          key: body.slice(0, eqIdx).trim(),
          value: body.slice(eqIdx + 1).trim(),
        },
      };
    }
    const spaceParts = body.split(/\s+/);
    if (spaceParts.length >= 2) {
      return {
        kind: 'env',
        assignment: {
          key: spaceParts[0],
          value: spaceParts.slice(1).join(' '),
        },
      };
    }
    return { kind: 'env' };
  }

  if (trimmed === '%pip' || trimmed.startsWith('%pip ')) {
    return { kind: 'pip', args: trimmed.slice(4).trim() };
  }

  if (trimmed === '%npm' || trimmed.startsWith('%npm ')) {
    return { kind: 'npm', args: trimmed.slice(4).trim() };
  }

  if (trimmed === '%npx' || trimmed.startsWith('%npx ')) {
    return { kind: 'npx', args: trimmed.slice(4).trim() };
  }

  if (firstLine.startsWith('!')) {
    return {
      kind: 'bash_line',
      command: firstLine.slice(1).trim(),
      remainingCode: lines.slice(1).join('\n'),
    };
  }

  return { kind: 'code', code: rawCode };
}

export function resolveSafeWorkspacePath(workspaceRoot: string, targetPath: string): string {
  const resolvedRoot = path.resolve(workspaceRoot);
  const cleaned = targetPath.replace(/^\/+/, '');
  const candidate = path.resolve(resolvedRoot, cleaned);
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) {
    throw new Error('Path escapes workspace directory.');
  }
  return candidate;
}

export function resolveCommandTargetPath(
  currentCwd: string,
  targetPath: string,
  unrestricted: boolean,
  workspaceRoot: string
): string {
  const expanded = targetPath.startsWith('~')
    ? path.join(process.env.HOME || '/', targetPath.slice(1))
    : targetPath;
  const resolved = path.resolve(currentCwd, expanded);
  if (unrestricted) {
    return resolved;
  }
  const root = path.resolve(workspaceRoot);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('Restricted mode: path escapes workspace directory.');
  }
  return resolved;
}
