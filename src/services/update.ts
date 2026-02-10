import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { UpdateInfo } from '../global.js';
import { Update } from '../consts/update.js';

const execFileAsync = promisify(execFile);

function cleanVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function parseVersion(version: string): number[] {
  return cleanVersion(version)
    .split('.')
    .map((part) => Number(part.replace(/[^0-9].*$/, '')))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function isVersionNewer(current: string, latest: string): boolean {
  const a = parseVersion(current);
  const b = parseVersion(latest);
  const len = Math.max(a.length, b.length);

  for (let i = 0; i < len; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (right > left) {
      return true;
    }
    if (right < left) {
      return false;
    }
  }

  return false;
}

interface GitHubRelease {
  tag_name: string;
  html_url?: string;
  published_at?: string;
  assets?: Array<{ name: string; browser_download_url: string }>;
}

export class UpdateService {
  private readonly currentVersion: string;

  constructor(currentVersion: string) {
    this.currentVersion = cleanVersion(currentVersion);
  }

  async checkLatest(repo: string = Update.Repo): Promise<UpdateInfo> {
    const release = await this.fetchLatestRelease(repo);
    const latestVersion = cleanVersion(release.tag_name);

    return {
      currentVersion: this.currentVersion,
      latestVersion,
      hasUpdate: isVersionNewer(this.currentVersion, latestVersion),
      htmlUrl: release.html_url,
      publishedAt: release.published_at,
    };
  }

  async installLatest(repo: string = Update.Repo): Promise<string> {
    const release = await this.fetchLatestRelease(repo);
    const installAsset = release.assets?.find((asset) => /install.*\.sh$/i.test(asset.name));

    if (!installAsset) {
      throw new Error('No install script asset (*.sh) found in the latest release.');
    }

    const response = await fetch(installAsset.browser_download_url, {
      headers: {
        'user-agent': 'archiver-ts',
      },
      signal: AbortSignal.timeout(Update.Timeout),
    });

    if (!response.ok) {
      throw new Error(`Failed to download install script: HTTP ${response.status}`);
    }

    const script = await response.text();
    const tempPath = path.join(os.tmpdir(), `archiver-update-${Date.now()}.sh`);
    await fs.writeFile(tempPath, script, { encoding: 'utf8', mode: 0o755 });

    try {
      const output = await execFileAsync('bash', [tempPath], { maxBuffer: 1024 * 1024 * 4 });
      return [output.stdout, output.stderr].filter(Boolean).join('\n').trim();
    } finally {
      await fs.rm(tempPath, { force: true });
    }
  }

  private async fetchLatestRelease(repo: string): Promise<GitHubRelease> {
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    const response = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'archiver-ts',
      },
      signal: AbortSignal.timeout(Update.Timeout),
    });

    if (!response.ok) {
      throw new Error(`Failed to query latest release from ${repo}: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as GitHubRelease;
    if (!payload.tag_name) {
      throw new Error(`Latest release response from ${repo} does not include tag_name.`);
    }

    return payload;
  }
}
