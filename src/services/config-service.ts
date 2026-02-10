import path from 'node:path';
import { ArchiverContext } from '../core/context.js';
import type { ArchiverConfig } from '../global.js';

export class ConfigService {
  constructor(private readonly context: ArchiverContext) {}

  async getConfig(): Promise<ArchiverConfig> {
    return this.context.loadConfig();
  }

  async setUpdateCheck(value: 'on' | 'off'): Promise<ArchiverConfig> {
    const config = await this.context.loadConfig();
    config.update_check = value;
    await this.context.saveConfig(config);
    return config;
  }

  async setVaultItemSeparator(separator: string): Promise<ArchiverConfig> {
    const config = await this.context.loadConfig();
    config.vault_item_sep = separator;
    await this.context.saveConfig(config);
    return config;
  }

  async setCurrentVault(vaultId: number): Promise<ArchiverConfig> {
    const config = await this.context.loadConfig();
    config.current_vault_id = vaultId;
    await this.context.saveConfig(config);
    return config;
  }

  async addAlias(alias: string, targetPath: string): Promise<ArchiverConfig> {
    const config = await this.context.loadConfig();
    config.alias_map[alias] = path.resolve(targetPath);
    await this.context.saveConfig(config);
    return config;
  }

  async removeAlias(alias: string): Promise<ArchiverConfig> {
    const config = await this.context.loadConfig();
    delete config.alias_map[alias];
    await this.context.saveConfig(config);
    return config;
  }

  async updateLastCheck(timestampIso: string): Promise<void> {
    const config = await this.context.loadConfig();
    config.last_update_check = timestampIso;
    await this.context.saveConfig(config);
  }

  renderPathWithAlias(rawPath: string, aliasMap: Record<string, string>): string {
    const full = path.resolve(rawPath);
    const entries = Object.entries(aliasMap).sort((a, b) => b[1].length - a[1].length);

    for (const [alias, mappedPath] of entries) {
      const normalized = path.resolve(mappedPath);
      if (full === normalized) {
        return alias;
      }

      const relative = path.relative(normalized, full);
      if (relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)) {
        return path.join(alias, relative);
      }
    }

    return full;
  }
}
