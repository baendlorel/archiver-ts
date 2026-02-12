import { describe, expect, it } from 'vitest';
import {
  applyEditableConfigValues,
  isEditableConfigEqual,
  toEditableConfigValues,
  validateEditableConfigValues,
  type EditableConfigValues,
} from '../../src/commands/config-interactive.js';

function makeConfig() {
  return {
    currentVaultId: 3,
    updateCheck: 'on' as const,
    lastUpdateCheck: '2026-02-12T00:00:00.000Z',
    aliasMap: { docs: '/tmp/docs' },
    vaultItemSeparator: '::',
    style: 'on' as const,
    language: 'zh' as const,
    noCommandAction: 'unknown' as const,
  };
}

describe('config interactive helpers', () => {
  it('extracts editable values from full config', () => {
    const editable = toEditableConfigValues(makeConfig());
    expect(editable).toEqual<EditableConfigValues>({
      updateCheck: 'on',
      vaultItemSeparator: '::',
      style: 'on',
      language: 'zh',
      noCommandAction: 'unknown',
    });
  });

  it('applies editable values and preserves unrelated keys', () => {
    const config = makeConfig();
    const next = applyEditableConfigValues(config, {
      updateCheck: 'off',
      vaultItemSeparator: '--',
      style: 'off',
      language: 'en',
      noCommandAction: 'list',
    });

    expect(next.currentVaultId).toBe(3);
    expect(next.aliasMap).toEqual({ docs: '/tmp/docs' });
    expect(next.lastUpdateCheck).toBe('2026-02-12T00:00:00.000Z');
    expect(next.updateCheck).toBe('off');
    expect(next.vaultItemSeparator).toBe('--');
    expect(next.style).toBe('off');
    expect(next.language).toBe('en');
    expect(next.noCommandAction).toBe('list');
  });

  it('compares editable values', () => {
    const left: EditableConfigValues = {
      updateCheck: 'on',
      vaultItemSeparator: '::',
      style: 'on',
      language: 'zh',
      noCommandAction: 'unknown',
    };
    const right: EditableConfigValues = { ...left };
    expect(isEditableConfigEqual(left, right)).toBe(true);

    right.noCommandAction = 'help';
    expect(isEditableConfigEqual(left, right)).toBe(false);
  });

  it('validates vault item separator', () => {
    expect(
      validateEditableConfigValues({
        updateCheck: 'on',
        vaultItemSeparator: '   ',
        style: 'on',
        language: 'zh',
        noCommandAction: 'list',
      }),
    ).toBe('command.config.vault_item_sep.error.empty');
    expect(
      validateEditableConfigValues({
        updateCheck: 'on',
        vaultItemSeparator: '__',
        style: 'off',
        language: 'en',
        noCommandAction: 'help',
      }),
    ).toBeUndefined();
  });
});
