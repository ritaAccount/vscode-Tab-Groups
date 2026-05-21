import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  DEFAULT_SHORTCUTS,
  MANAGED_SHORTCUT_COMMANDS,
  SHORTCUT_COMMANDS,
  SHORTCUT_WHEN,
  ShortcutSettings,
} from './types';
import { getWorkspaceFolder } from './workspaceUtils';

interface KeybindingEntry {
  key: string;
  command: string;
  when?: string;
}

const SHORTCUT_PATTERN =
  /^(?:(?:ctrl|cmd|shift|alt|opt|win)\+)+(?:[a-z0-9]+|space|enter|tab|escape|backspace|delete|home|end|pageup|pagedown|left|right|up|down|f[1-9]|f1[0-2])$/i;

const SHORTCUT_ENTRIES: Array<{
  settingKey: keyof ShortcutSettings;
  command: string;
  when: string;
}> = [
  { settingKey: 'addToGroup', command: SHORTCUT_COMMANDS.addToGroup, when: SHORTCUT_WHEN.file },
  { settingKey: 'removeFromGroup', command: SHORTCUT_COMMANDS.removeFromGroup, when: SHORTCUT_WHEN.file },
  { settingKey: 'createGroup', command: SHORTCUT_COMMANDS.createGroup, when: SHORTCUT_WHEN.workspace },
  { settingKey: 'deleteGroup', command: SHORTCUT_COMMANDS.deleteGroup, when: SHORTCUT_WHEN.workspace },
];

const SHORTCUT_KEYS = Object.keys(DEFAULT_SHORTCUTS) as Array<keyof ShortcutSettings>;

export function validateShortcut(value: string): boolean {
  return SHORTCUT_PATTERN.test(value.trim());
}

function validateAllShortcuts(shortcuts: ShortcutSettings): boolean {
  return SHORTCUT_KEYS.every((key) => validateShortcut(shortcuts[key]));
}

function mergeShortcutSettings(partial?: Partial<ShortcutSettings>): ShortcutSettings {
  return {
    addToGroup: partial?.addToGroup?.trim() || DEFAULT_SHORTCUTS.addToGroup,
    removeFromGroup: partial?.removeFromGroup?.trim() || DEFAULT_SHORTCUTS.removeFromGroup,
    createGroup: partial?.createGroup?.trim() || DEFAULT_SHORTCUTS.createGroup,
    deleteGroup: partial?.deleteGroup?.trim() || DEFAULT_SHORTCUTS.deleteGroup,
  };
}

export function getShortcuts(): ShortcutSettings {
  const folder = getWorkspaceFolder();
  const config = vscode.workspace.getConfiguration('tabGroups', folder?.uri);
  return mergeShortcutSettings(config.get<Partial<ShortcutSettings>>('shortcuts'));
}

export async function ensureWorkspaceShortcutSettings(): Promise<void> {
  const folder = getWorkspaceFolder();
  if (!folder) {
    return;
  }

  const config = vscode.workspace.getConfiguration('tabGroups', folder.uri);
  const workspaceValue = config.inspect<Partial<ShortcutSettings>>('shortcuts')?.workspaceValue;
  const merged = mergeShortcutSettings(workspaceValue);
  const isComplete = SHORTCUT_KEYS.every((key) => workspaceValue?.[key]);

  if (!workspaceValue || !isComplete) {
    await config.update('shortcuts', merged, vscode.ConfigurationTarget.Workspace);
  }
}

export async function saveShortcuts(shortcuts: ShortcutSettings): Promise<void> {
  const folder = getWorkspaceFolder();
  if (!folder) {
    throw new Error('NO_WORKSPACE');
  }

  if (!validateAllShortcuts(shortcuts)) {
    throw new Error('INVALID_FORMAT');
  }

  const config = vscode.workspace.getConfiguration('tabGroups', folder.uri);
  await config.update('shortcuts', shortcuts, vscode.ConfigurationTarget.Workspace);
  await syncKeybindingsFromSettings();
}

export async function syncKeybindingsFromSettings(): Promise<void> {
  const shortcuts = getShortcuts();
  const keybindingsPath = getUserKeybindingsPath();
  const entries: KeybindingEntry[] = SHORTCUT_ENTRIES.map(({ settingKey, command, when }) => ({
    key: shortcuts[settingKey],
    command,
    when,
  }));

  let bindings: KeybindingEntry[] = [];
  try {
    const content = await fs.readFile(keybindingsPath, 'utf8');
    bindings = parseJsoncArray(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  bindings = bindings.filter((entry) => !MANAGED_SHORTCUT_COMMANDS.includes(entry.command as typeof MANAGED_SHORTCUT_COMMANDS[number]));
  bindings.push(...entries);

  await fs.mkdir(path.dirname(keybindingsPath), { recursive: true });
  await fs.writeFile(keybindingsPath, `${JSON.stringify(bindings, null, 2)}\n`, 'utf8');
}

export function getUserKeybindingsPath(): string {
  const home = os.homedir();
  const productFolder = resolveProductFolder(vscode.env.appName);

  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', productFolder, 'User', 'keybindings.json');
  }
  if (process.platform === 'win32') {
    return path.join(home, 'AppData', 'Roaming', productFolder, 'User', 'keybindings.json');
  }
  return path.join(home, '.config', productFolder, 'User', 'keybindings.json');
}

function resolveProductFolder(appName: string): string {
  const normalized = appName.toLowerCase();
  if (normalized.includes('cursor')) {
    return 'Cursor';
  }
  if (normalized.includes('insiders')) {
    return 'Code - Insiders';
  }
  if (normalized.includes('oss')) {
    return 'Code - OSS';
  }
  return 'Code';
}

function parseJsoncArray(text: string): KeybindingEntry[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const withoutBlockComments = trimmed.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, '');
  const parsed = JSON.parse(withoutLineComments.trim() || '[]');
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(isKeybindingEntry);
}

function isKeybindingEntry(value: unknown): value is KeybindingEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as KeybindingEntry).key === 'string' &&
    typeof (value as KeybindingEntry).command === 'string'
  );
}
