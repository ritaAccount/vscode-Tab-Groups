import * as vscode from 'vscode';
import {
  DEFAULT_DISPLAY_SETTINGS,
  DisplaySettings,
  MarkerJumpHintMode,
} from './types';

const CONFIG_KEY = 'display';
const SECTION = 'tabGroups';

function normalizeMode(value: unknown): MarkerJumpHintMode {
  if (value === 'always' || value === 'timed' || value === 'off') {
    return value;
  }
  return DEFAULT_DISPLAY_SETTINGS.markerJumpHintMode;
}

function normalizeSeconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.min(60, Math.max(0.5, Math.round(value * 10) / 10));
  }
  return DEFAULT_DISPLAY_SETTINGS.markerJumpHintSeconds;
}

export function getDisplaySettings(): DisplaySettings {
  const partial = vscode.workspace.getConfiguration(SECTION).get<Partial<DisplaySettings>>(CONFIG_KEY);
  return {
    markerJumpHintMode: normalizeMode(partial?.markerJumpHintMode),
    markerJumpHintSeconds: normalizeSeconds(partial?.markerJumpHintSeconds),
  };
}

export async function saveDisplaySettings(settings: DisplaySettings): Promise<DisplaySettings> {
  const next: DisplaySettings = {
    markerJumpHintMode: normalizeMode(settings.markerJumpHintMode),
    markerJumpHintSeconds: normalizeSeconds(settings.markerJumpHintSeconds),
  };

  await vscode.workspace
    .getConfiguration(SECTION)
    .update(CONFIG_KEY, next, vscode.ConfigurationTarget.Workspace);

  return next;
}

export async function ensureWorkspaceDisplaySettings(): Promise<void> {
  if (!vscode.workspace.workspaceFolders?.length) {
    return;
  }

  const config = vscode.workspace.getConfiguration(SECTION);
  const inspected = config.inspect<Partial<DisplaySettings>>(CONFIG_KEY);
  if (inspected?.workspaceValue !== undefined) {
    return;
  }

  await config.update(CONFIG_KEY, { ...DEFAULT_DISPLAY_SETTINGS }, vscode.ConfigurationTarget.Workspace);
}
