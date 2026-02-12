import readline from 'node:readline';
import chalk from 'chalk';
import type { ArchiverConfig } from '../global.js';
import { t } from '../i18n/index.js';
import type { I18nKey } from '../i18n/zh.js';
import { applyInputKeypress, createInputState, renderInput, type InputState } from '../ui/input.js';
import { layoutFullscreenHintStatusLines } from '../ui/screen.js';
import {
  createSelectState,
  getSelectedOption,
  moveSelect,
  renderKeyHint,
  renderSelect,
  type SelectState,
} from '../ui/select.js';

interface Keypress {
  ctrl?: boolean;
  name?: string;
}

const EDITABLE_CONFIG_KEYS = ['updateCheck', 'vaultItemSeparator', 'style', 'language', 'noCommandAction'] as const;

type EditableConfigKey = (typeof EDITABLE_CONFIG_KEYS)[number];
type SelectFieldKey = 'updateCheck' | 'style' | 'language' | 'noCommandAction';
type SelectFieldValue = EditableConfigValues[SelectFieldKey];
type EditorAction = 'save' | 'cancel';

interface EditorFieldBase<K extends EditableConfigKey> {
  key: K;
  label: string;
}

interface EditorSelectField extends EditorFieldBase<SelectFieldKey> {
  kind: 'select';
  state: SelectState<SelectFieldValue>;
}

interface EditorInputField extends EditorFieldBase<'vaultItemSeparator'> {
  kind: 'input';
  state: InputState;
}

type EditorField = EditorSelectField | EditorInputField;

export interface EditableConfigValues {
  updateCheck: ArchiverConfig['updateCheck'];
  vaultItemSeparator: ArchiverConfig['vaultItemSeparator'];
  style: ArchiverConfig['style'];
  language: ArchiverConfig['language'];
  noCommandAction: ArchiverConfig['noCommandAction'];
}

export function toEditableConfigValues(config: ArchiverConfig): EditableConfigValues {
  return {
    updateCheck: config.updateCheck,
    vaultItemSeparator: config.vaultItemSeparator,
    style: config.style,
    language: config.language,
    noCommandAction: config.noCommandAction,
  };
}

export function applyEditableConfigValues(config: ArchiverConfig, values: EditableConfigValues): ArchiverConfig {
  return {
    ...config,
    updateCheck: values.updateCheck,
    vaultItemSeparator: values.vaultItemSeparator,
    style: values.style,
    language: values.language,
    noCommandAction: values.noCommandAction,
  };
}

export function isEditableConfigEqual(a: EditableConfigValues, b: EditableConfigValues): boolean {
  return EDITABLE_CONFIG_KEYS.every((key) => a[key] === b[key]);
}

export function validateEditableConfigValues(values: EditableConfigValues): I18nKey | undefined {
  if (!values.vaultItemSeparator.trim()) {
    return 'command.config.vault_item_sep.error.empty';
  }
  return undefined;
}

function canRunEditor(): boolean {
  return typeof process.stdin.setRawMode === 'function';
}

function createEditorFields(values: EditableConfigValues): EditorField[] {
  return [
    {
      kind: 'select',
      key: 'updateCheck',
      label: t('command.config.edit.field.update_check'),
      state: createSelectState(
        [
          { value: 'on', label: t('common.state.on') },
          { value: 'off', label: t('common.state.off') },
        ],
        values.updateCheck,
      ),
    },
    {
      kind: 'input',
      key: 'vaultItemSeparator',
      label: t('command.config.edit.field.vault_item_sep'),
      state: createInputState(values.vaultItemSeparator),
    },
    {
      kind: 'select',
      key: 'style',
      label: t('command.config.edit.field.style'),
      state: createSelectState(
        [
          { value: 'on', label: t('common.state.on') },
          { value: 'off', label: t('common.state.off') },
        ],
        values.style,
      ),
    },
    {
      kind: 'select',
      key: 'language',
      label: t('command.config.edit.field.language'),
      state: createSelectState(
        [
          { value: 'zh', label: 'zh' },
          { value: 'en', label: 'en' },
        ],
        values.language,
      ),
    },
    {
      kind: 'select',
      key: 'noCommandAction',
      label: t('command.config.edit.field.no_command_action'),
      state: createSelectState(
        [
          { value: 'list', label: t('common.action.list') },
          { value: 'help', label: t('common.action.help') },
          { value: 'unknown', label: 'unknown' },
        ],
        values.noCommandAction,
      ),
    },
  ];
}

function moveActiveIndex(current: number, direction: 'up' | 'down', total: number): number {
  if (total <= 0) {
    return 0;
  }
  if (direction === 'up') {
    return (current - 1 + total) % total;
  }
  return (current + 1) % total;
}

function readValues(fields: EditorField[], fallback: EditableConfigValues): EditableConfigValues {
  const values: EditableConfigValues = { ...fallback };
  for (const field of fields) {
    if (field.kind === 'input') {
      values.vaultItemSeparator = field.state.value;
      continue;
    }

    const selected = getSelectedOption(field.state)?.value;
    if (!selected) {
      continue;
    }

    if (field.key === 'updateCheck') {
      values.updateCheck = selected as EditableConfigValues['updateCheck'];
      continue;
    }
    if (field.key === 'style') {
      values.style = selected as EditableConfigValues['style'];
      continue;
    }
    if (field.key === 'language') {
      values.language = selected as EditableConfigValues['language'];
      continue;
    }
    values.noCommandAction = selected as EditableConfigValues['noCommandAction'];
  }
  return values;
}

function getLabelWidth(fields: EditorField[]): number {
  return Math.max(...fields.map((field) => field.label.length), 1);
}

function renderScreen(
  fields: EditorField[],
  activeIndex: number,
  initialValues: EditableConfigValues,
  actionState: SelectState<EditorAction>,
  note: string,
): void {
  const currentValues = readValues(fields, initialValues);
  const dirty = !isEditableConfigEqual(currentValues, initialValues);
  const labelWidth = getLabelWidth(fields);
  const actionsIndex = fields.length;
  const actionActive = activeIndex === actionsIndex;
  const hint = t('command.config.edit.hint', {
    upDown: renderKeyHint(t('command.config.edit.key.up_down')),
    leftRight: renderKeyHint(t('command.config.edit.key.left_right')),
    type: renderKeyHint(t('command.config.edit.key.type')),
    enter: renderKeyHint(t('command.config.edit.key.enter')),
    cancel: renderKeyHint(t('command.config.edit.key.cancel')),
  });

  const lines: string[] = [];
  lines.push(chalk.bold(t('command.config.edit.title')));
  lines.push('');

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) {
      continue;
    }
    const active = index === activeIndex;
    const pointer = active ? chalk.cyan('>') : ' ';
    const label = active ? chalk.bold(field.label.padEnd(labelWidth, ' ')) : field.label.padEnd(labelWidth, ' ');
    const renderedValue =
      field.kind === 'select'
        ? renderSelect(field.state, active)
        : renderInput(field.state, active, t('command.config.edit.input.placeholder'));
    lines.push(`${pointer} ${label}  ${renderedValue}`);
  }

  lines.push('');
  lines.push(`${t('command.config.edit.action_prefix')} ${renderSelect(actionState, actionActive)}`);
  lines.push('');
  const statusLine = note
    ? chalk.yellow(note)
    : chalk.dim(dirty ? t('command.config.edit.state.dirty') : t('command.config.edit.state.clean'));
  const renderedLines = layoutFullscreenHintStatusLines({
    contentLines: lines,
    hintLine: hint,
    statusLine,
    rows: process.stdout.rows,
  });

  process.stdout.write('\x1B[2J\x1B[H\x1B[?25l');
  process.stdout.write(renderedLines.join('\n'));
}

export async function promptConfigEditor(initialValues: EditableConfigValues): Promise<EditableConfigValues | null> {
  if (!canRunEditor()) {
    throw new Error(t('command.config.edit.error.no_tty'));
  }

  const input = process.stdin;
  const fields = createEditorFields(initialValues);
  let actionState = createSelectState<EditorAction>([
    { value: 'save', label: t('command.config.edit.action.save') },
    { value: 'cancel', label: t('command.config.edit.action.cancel') },
  ]);
  let activeIndex = 0;
  let note = '';

  readline.emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();

  return new Promise<EditableConfigValues | null>((resolve) => {
    const finalize = (values: EditableConfigValues | null): void => {
      input.off('keypress', onKeypress);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\x1B[2J\x1B[H\x1B[?25h\n');
      resolve(values);
    };

    const submit = (): void => {
      const values = readValues(fields, initialValues);
      const errorKey = validateEditableConfigValues(values);
      if (errorKey) {
        note = t(errorKey);
        renderScreen(fields, activeIndex, initialValues, actionState, note);
        return;
      }
      finalize(values);
    };

    const onKeypress = (value: string, key: Keypress): void => {
      if (key.ctrl && key.name === 'c') {
        finalize(null);
        return;
      }
      if (key.name === 'escape') {
        finalize(null);
        return;
      }
      if (key.name === 'up') {
        activeIndex = moveActiveIndex(activeIndex, 'up', fields.length + 1);
        note = '';
        renderScreen(fields, activeIndex, initialValues, actionState, note);
        return;
      }
      if (key.name === 'down') {
        activeIndex = moveActiveIndex(activeIndex, 'down', fields.length + 1);
        note = '';
        renderScreen(fields, activeIndex, initialValues, actionState, note);
        return;
      }

      if (activeIndex === fields.length) {
        if (key.name === 'q') {
          finalize(null);
          return;
        }
        if (key.name === 'left' || key.name === 'right') {
          actionState = moveSelect(actionState, key.name);
          note = '';
          renderScreen(fields, activeIndex, initialValues, actionState, note);
          return;
        }
        if (key.name === 'return' || key.name === 'enter') {
          const selectedAction = getSelectedOption(actionState)?.value ?? 'save';
          if (selectedAction === 'cancel') {
            finalize(null);
            return;
          }
          submit();
        }
        return;
      }

      const activeField = fields[activeIndex];
      if (!activeField) {
        finalize(null);
        return;
      }
      if (key.name === 'q' && activeField.kind !== 'input') {
        finalize(null);
        return;
      }

      if (key.name === 'left' || key.name === 'right') {
        if (activeField.kind === 'select') {
          activeField.state = moveSelect(activeField.state, key.name);
        } else {
          activeField.state = applyInputKeypress(activeField.state, value, key).state;
        }
        note = '';
        renderScreen(fields, activeIndex, initialValues, actionState, note);
        return;
      }

      if (activeField.kind === 'input') {
        const update = applyInputKeypress(activeField.state, value, key);
        activeField.state = update.state;
        if (update.action === 'cancel') {
          finalize(null);
          return;
        }
        if (update.action === 'submit') {
          submit();
          return;
        }
        note = '';
        renderScreen(fields, activeIndex, initialValues, actionState, note);
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        submit();
      }
    };

    input.on('keypress', onKeypress);
    renderScreen(fields, activeIndex, initialValues, actionState, note);
  });
}
