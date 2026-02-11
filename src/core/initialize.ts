import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureDir, ensureFile, pathAccessible } from '../utils/fs.js';

type SupportedShell = 'bash' | 'zsh' | 'fish' | 'powershell';

interface ShellWrapperTemplate {
  readonly startMarker: string;
  readonly endMarker: string;
  readonly functionPattern: RegExp;
  readonly body: string;
}

export interface InitializeOptions {
  homeDir?: string;
  shellPath?: string;
  stdinIsTTY?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface InitializeResult {
  installed: boolean;
  shell?: SupportedShell;
  profilePath?: string;
  reloadCommand?: string;
}

const POSIX_TEMPLATE: ShellWrapperTemplate = {
  startMarker: '# >>> archiver arv wrapper >>>',
  endMarker: '# <<< archiver arv wrapper <<<',
  functionPattern: /(^|\n)\s*(function\s+)?arv\s*(\(\))?\s*\{/m,
  body: `arv() {
  local line target status go_back
  while IFS= read -r line; do
    if [[ "$line" == *__ARCHIVER_CD__:* ]]; then
      target="\${line##*__ARCHIVER_CD__:}"
    elif [[ "$line" == __ARCHIVER_CD_BACK__ ]]; then
      go_back="1"
    elif [[ "$line" == __ARCHIVER_STATUS__:* ]]; then
      status="\${line#__ARCHIVER_STATUS__:}"
    else
      printf '%s\\n' "$line"
    fi
  done < <(
    ARV_FORCE_INTERACTIVE=1 command arv "$@"
    printf '__ARCHIVER_STATUS__:%s\\n' "$?"
  )

  status="\${status:-1}"
  if [[ -n "$target" ]]; then
    export ARV_PREV_CWD="$PWD"
    cd -- "$target" || return $?
  elif [[ "$go_back" == "1" ]]; then
    if [[ -z "\${ARV_PREV_CWD:-}" ]]; then
      printf '%s\\n' 'No previous arv cd directory.'
      return 1
    fi
    local previous="$ARV_PREV_CWD"
    export ARV_PREV_CWD="$PWD"
    cd -- "$previous" || return $?
  fi
  return $status
}`,
};

const FISH_TEMPLATE: ShellWrapperTemplate = {
  startMarker: '# >>> archiver arv wrapper >>>',
  endMarker: '# <<< archiver arv wrapper <<<',
  functionPattern: /(^|\n)\s*function\s+arv\b/m,
  body: `function arv
    set -l target_tmp (mktemp)
    set -l back_tmp (mktemp)
    ARV_FORCE_INTERACTIVE=1 command arv $argv | while read -l line
        if string match -q "__ARCHIVER_CD__:*" -- $line
            echo (string replace "__ARCHIVER_CD__:" "" -- $line) > $target_tmp
        else if test "$line" = "__ARCHIVER_CD_BACK__"
            echo "1" > $back_tmp
        else
            echo $line
        end
    end
    set -l status $pipestatus[1]

    if test -s $target_tmp
        set -l target (cat $target_tmp)
        set -gx ARV_PREV_CWD $PWD
        cd -- $target; or begin
            rm -f $target_tmp $back_tmp
            return $status
        end
    else if test -s $back_tmp
        if not set -q ARV_PREV_CWD
            echo "No previous arv cd directory."
            rm -f $target_tmp $back_tmp
            return 1
        end
        set -l previous $ARV_PREV_CWD
        set -gx ARV_PREV_CWD $PWD
        cd -- $previous; or begin
            rm -f $target_tmp $back_tmp
            return $status
        end
    end

    rm -f $target_tmp $back_tmp
    return $status
end`,
};

const POWERSHELL_TEMPLATE: ShellWrapperTemplate = {
  startMarker: '# >>> archiver arv wrapper >>>',
  endMarker: '# <<< archiver arv wrapper <<<',
  functionPattern: /(^|\r?\n)\s*function\s+arv\b/im,
  body: `function arv {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$argv
    )

    $target = $null
    $goBack = $false
    $status = 1
    $oldForce = $env:ARV_FORCE_INTERACTIVE
    $env:ARV_FORCE_INTERACTIVE = "1"

    try {
        $app = Get-Command arv -CommandType Application -ErrorAction Stop | Select-Object -First 1
        & $app.Source @argv | ForEach-Object {
            if ($_ -like "__ARCHIVER_CD__:*") {
                $target = $_.Substring("__ARCHIVER_CD__:".Length)
            } elseif ($_ -eq "__ARCHIVER_CD_BACK__") {
                $goBack = $true
            } else {
                Write-Output $_
            }
        }
        $status = $LASTEXITCODE
    } finally {
        if ($null -eq $oldForce) {
            Remove-Item Env:ARV_FORCE_INTERACTIVE -ErrorAction SilentlyContinue
        } else {
            $env:ARV_FORCE_INTERACTIVE = $oldForce
        }
    }

    if ($target) {
        $env:ARV_PREV_CWD = (Get-Location).Path
        Set-Location -Path $target
    } elseif ($goBack) {
        if (-not $env:ARV_PREV_CWD) {
            Write-Output "No previous arv cd directory."
            $global:LASTEXITCODE = 1
            return
        }
        $previous = $env:ARV_PREV_CWD
        $env:ARV_PREV_CWD = (Get-Location).Path
        Set-Location -Path $previous
    }

    $global:LASTEXITCODE = $status
}`,
};

function detectShell(shellPath: string): SupportedShell | undefined {
  const name = path.basename(shellPath).toLowerCase();
  if (name.includes('bash')) {
    return 'bash';
  }
  if (name.includes('zsh')) {
    return 'zsh';
  }
  if (name.includes('fish')) {
    return 'fish';
  }
  if (name.includes('pwsh') || name.includes('powershell')) {
    return 'powershell';
  }
  return undefined;
}

function withTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

function renderManagedBlock(template: ShellWrapperTemplate): string {
  return `${template.startMarker}\n${template.body}\n${template.endMarker}`;
}

function findManagedBlockRange(
  content: string,
  template: ShellWrapperTemplate,
): { start: number; end: number } | undefined {
  const start = content.indexOf(template.startMarker);
  if (start === -1) {
    return undefined;
  }
  const endStart = content.indexOf(template.endMarker, start + template.startMarker.length);
  if (endStart === -1 || endStart <= start) {
    return undefined;
  }
  return {
    start,
    end: endStart + template.endMarker.length,
  };
}

function appendManagedBlock(content: string, template: ShellWrapperTemplate): string {
  const block = renderManagedBlock(template);
  if (content.trim().length === 0) {
    return `${block}\n`;
  }

  const suffix = content.endsWith('\n') ? '\n' : '\n\n';
  return `${content}${suffix}${block}\n`;
}

async function chooseRcFile(homeDir: string, candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    const rcPath = path.join(homeDir, candidate);
    if (await pathAccessible(rcPath)) {
      return rcPath;
    }
  }
  return path.join(homeDir, candidates[0] ?? '.bashrc');
}

async function ensureManagedFunction(filePath: string, template: ShellWrapperTemplate): Promise<boolean> {
  await ensureFile(filePath);
  const content = await fs.readFile(filePath, 'utf8');

  const managedRange = findManagedBlockRange(content, template);
  if (managedRange) {
    const currentBlock = content.slice(managedRange.start, managedRange.end);
    const latestBlock = renderManagedBlock(template);
    if (currentBlock === latestBlock) {
      return false;
    }

    const updated = `${content.slice(0, managedRange.start)}${latestBlock}${content.slice(managedRange.end)}`;
    await fs.writeFile(filePath, withTrailingNewline(updated), 'utf8');
    return true;
  }

  if (template.functionPattern.test(content)) {
    return false;
  }

  const next = withTrailingNewline(appendManagedBlock(content, template));
  await fs.writeFile(filePath, next, 'utf8');
  return true;
}

function toHomeRelativePath(targetPath: string, homeDir: string): string {
  const normalizedHome = path.resolve(homeDir);
  const normalizedTarget = path.resolve(targetPath);
  if (normalizedTarget === normalizedHome) {
    return '~';
  }

  const prefix = `${normalizedHome}${path.sep}`;
  if (normalizedTarget.startsWith(prefix)) {
    return `~${normalizedTarget.slice(normalizedHome.length)}`;
  }
  return targetPath;
}

function quoteShellPath(targetPath: string): string {
  return `'${targetPath.replaceAll("'", "'\\''")}'`;
}

function quotePowerShellPath(targetPath: string): string {
  return `'${targetPath.replaceAll("'", "''")}'`;
}

async function resolvePowerShellProfilePath(homeDir: string): Promise<string> {
  if (process.platform === 'win32') {
    const candidates = [
      path.join(homeDir, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
      path.join(homeDir, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
    ];
    for (const candidate of candidates) {
      if (await pathAccessible(candidate)) {
        return candidate;
      }
    }
    return candidates[0];
  }

  return path.join(homeDir, '.config', 'powershell', 'Microsoft.PowerShell_profile.ps1');
}

function buildResult(shell: SupportedShell, profilePath: string, homeDir: string, installed: boolean): InitializeResult {
  const displayPath = toHomeRelativePath(profilePath, homeDir);

  if (shell === 'powershell') {
    return {
      installed,
      shell,
      profilePath: displayPath,
      reloadCommand: `. ${quotePowerShellPath(profilePath)}`,
    };
  }

  return {
    installed,
    shell,
    profilePath: displayPath,
    reloadCommand: `source ${quoteShellPath(profilePath)}`,
  };
}

export async function ensureArvShellWrapper(options: InitializeOptions = {}): Promise<InitializeResult> {
  const env = options.env ?? process.env;
  if (env.ARV_DISABLE_SHELL_INIT === '1') {
    return { installed: false };
  }

  const stdinIsTTY = options.stdinIsTTY ?? Boolean(process.stdin.isTTY);
  if (!stdinIsTTY) {
    return { installed: false };
  }

  const homeDir = options.homeDir ?? env.HOME ?? env.USERPROFILE ?? os.homedir();
  if (!homeDir) {
    return { installed: false };
  }

  const shellPath = options.shellPath ?? env.SHELL ?? '';
  const shell = detectShell(shellPath);
  if (!shell) {
    return { installed: false };
  }

  try {
    if (shell === 'bash') {
      const rcPath = await chooseRcFile(homeDir, ['.bashrc', '.bash_profile', '.profile']);
      const installed = await ensureManagedFunction(rcPath, POSIX_TEMPLATE);
      return buildResult(shell, rcPath, homeDir, installed);
    }

    if (shell === 'zsh') {
      const rcPath = path.join(homeDir, '.zshrc');
      const installed = await ensureManagedFunction(rcPath, POSIX_TEMPLATE);
      return buildResult(shell, rcPath, homeDir, installed);
    }

    if (shell === 'fish') {
      const functionFile = path.join(homeDir, '.config', 'fish', 'functions', 'arv.fish');
      await ensureDir(path.dirname(functionFile));
      const installed = await ensureManagedFunction(functionFile, FISH_TEMPLATE);
      return buildResult(shell, functionFile, homeDir, installed);
    }

    const profilePath = await resolvePowerShellProfilePath(homeDir);
    await ensureDir(path.dirname(profilePath));
    const installed = await ensureManagedFunction(profilePath, POWERSHELL_TEMPLATE);
    return buildResult(shell, profilePath, homeDir, installed);
  } catch {
    // Shell integration is best-effort and should never block command execution.
    return { installed: false };
  }
}
