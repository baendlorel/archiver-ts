import type { ArchiverConfig } from '../global.js';
import type { ArchiverContext } from '../core/context.js';

export class ConfigService {
  constructor(private readonly context: ArchiverContext) {}

  async getConfig(): Promise<ArchiverConfig> {
    return this.context.loadConfig();
  }

  async setUpdateCheck(value: 'on' | 'off'): Promise<ArchiverConfig> {
    const config = await this.context.loadConfig();
    config.updateCheck = value;
    await this.context.saveConfig(config);
    return config;
  }

  async setVaultItemSeparator(separator: string): Promise<ArchiverConfig> {
    const config = await this.context.loadConfig();
    config.vaultItemSeparator = separator;
    await this.context.saveConfig(config);
    return config;
  }

  async setStyle(value: 'on' | 'off'): Promise<ArchiverConfig> {
    const config = await this.context.loadConfig();
    config.style = value;
    await this.context.saveConfig(config);
    return config;
  }

  async setLanguage(value: 'zh' | 'en'): Promise<ArchiverConfig> {
    const config = await this.context.loadConfig();
    config.language = value;
    await this.context.saveConfig(config);
    return config;
  }

  async setNoCommandAction(value: 'help' | 'list' | 'unknown'): Promise<ArchiverConfig> {
    const config = await this.context.loadConfig();
    config.noCommandAction = value;
    await this.context.saveConfig(config);
    return config;
  }

  async setCurrentVault(vaultId: number): Promise<ArchiverConfig> {
    const config = await this.context.loadConfig();
    config.currentVaultId = vaultId;
    await this.context.saveConfig(config);
    return config;
  }

  async updateLastCheck(timestampIso: string): Promise<void> {
    const config = await this.context.loadConfig();
    config.lastUpdateCheck = timestampIso;
    await this.context.saveConfig(config);
  }
}
