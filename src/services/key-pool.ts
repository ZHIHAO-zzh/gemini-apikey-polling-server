import { ApiKeysRepo, SettingsRepo } from '../db/index.js';
import type { ApiKey } from '../types/index.js';

export class KeyPoolService {
  /**
   * 严格持久化状态轮询获取下一个可用 API Key
   * 即使系统重启或经过任意长时间，游标指针依旧从上一次的下一个开始
   * @param excludeKeyIds 本次请求中已尝试失败需要排除的 key IDs (用于同一请求内的重试)
   */
  public static getNextKey(excludeKeyIds: number[] = []): ApiKey | null {
    const availableKeys = ApiKeysRepo.getAvailableKeys();
    
    // 排除本次重试中已失败的 key
    const candidateKeys = availableKeys.filter(k => !excludeKeyIds.includes(k.id));
    if (candidateKeys.length === 0) {
      return null;
    }

    const settings = SettingsRepo.getAll();
    const lastKeyId = settings.last_key_id || 0;
    const usageLimitPerTurn = Math.max(1, settings.key_usage_count_per_turn || 1);
    const currentUsedCount = settings.current_key_used_count || 0;

    let selectedKey: ApiKey;

    if (settings.strict_persistent_cursor) {
      // 检查当前停留的 Key 是否依然可用且本轮成功调用尚未达到设定次数
      const currentActiveKey = candidateKeys.find(k => k.id === lastKeyId);

      if (currentActiveKey && currentUsedCount < usageLimitPerTurn) {
        // 当前 Key 尚未达到正常成功调用次数上限，继续使用当前 Key
        selectedKey = currentActiveKey;
      } else {
        // 达到正常成功使用次数上限，或当前 Key 已不可用，严格轮询切换至下一个 Key
        const nextKey = candidateKeys.find(k => k.id > lastKeyId);
        if (nextKey) {
          selectedKey = nextKey;
        } else {
          // 到了末尾，回绕到第一个候选 Key
          selectedKey = candidateKeys[0];
        }

        // 持久化新选中的 Key ID，并重置本轮成功使用次数为 0
        SettingsRepo.setLastKeyId(selectedKey.id);
        SettingsRepo.set('current_key_used_count', '0');
      }
    } else {
      selectedKey = candidateKeys[0];
    }

    return selectedKey;
  }

  /**
   * 报告 Key 成功调用：累计当前轮次正常成功使用次数
   */
  public static handleSuccess(keyId: number, latency: number): void {
    ApiKeysRepo.recordSuccess(keyId, latency);

    // 只有请求成功后，才将当前 Key 在本轮停留中的正常使用次数 +1
    const settings = SettingsRepo.getAll();
    if (settings.last_key_id === keyId) {
      const currentUsedCount = settings.current_key_used_count || 0;
      SettingsRepo.set('current_key_used_count', String(currentUsedCount + 1));
    }
  }

  /**
   * 报告 Key 失败调用
   */
  public static handleFailure(keyId: number, errorMsg: string, isRateLimit = false): void {
    const settings = SettingsRepo.getAll();
    const key = ApiKeysRepo.getById(keyId);
    const consecutive = ((key?.consecutive_errors) || 0) + 1;

    // 仅当触发 429 限流或连续错误达到熔断阈值导致 Key 进入冷却不可用时，才将轮次计数归零以强制切换到新 Key
    if (isRateLimit || consecutive >= settings.error_threshold) {
      SettingsRepo.set('current_key_used_count', '0');
    }

    ApiKeysRepo.recordFailure(
      keyId, 
      errorMsg, 
      settings.cooldown_duration, 
      settings.error_threshold, 
      isRateLimit
    );
  }
}
