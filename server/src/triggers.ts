// ── Trigger types (новый массивовый формат) ────────────────
export interface TriggerCondition {
  type?: string;              // "device" | "numeric_device" | "time" | "sunrise" | "sunset" | "cron" | "mqtt" | "webhook" | "timer" | "presence_zone"
  device: string;
  property: string;
  operator: '>' | '<' | '>=' | '<=' | '=' | '!=';
  value: number;
  duration?: number;          // Время удержания состояния (мс)
  id?: string;                // Опциональный ID для timer trigger
  topic?: string;             // Для MQTT trigger
  payload?: string;           // Для MQTT trigger
  time?: string;              // Для time trigger
  days?: string[];            // Дни недели для time trigger
  offset_minutes?: number;    // Для sunrise/sunset trigger
  cron?: string;              // Для cron trigger
  webhook_id?: string;        // Для webhook trigger
  after_event?: string;       // Для timer trigger (ссылка на id другого триггера)
  duration_ms?: number;       // Для timer trigger
}

// ── Parse Helpers ────────────────────────────────────────

/**
 * Парсит triggers_json.
 * Поддерживает два формата:
 *   НОВЫЙ (массив): [{"type":"device","device":"0x...","property":"presence","operator":"=","value":1}]
 *   СТАРЫЙ (объект): {"logic":"ANY","conditions":[{"device":"0x...","property":"presence","operator":"=","value":1}]}
 * возвращает массив TriggerCondition в любом случае.
 */
export function parseTriggers(json: string): TriggerCondition[] | null {
  try {
    const parsed = JSON.parse(json);

    // Новый формат — массив
    if (Array.isArray(parsed)) {
      // Пустой массив — нормально (сценарий может быть только по расписанию)
      if (parsed.length === 0) return [];
      for (const item of parsed) {
        // У device-триггера (без type) проверяем device
        if (item.type === 'device' && !item.device) return null;
        // У schedule-триггера может не быть device
        if (item.type === 'schedule' && !item.kind) return null;
        // У триггеров без type — считаем device-триггерами
        if (!item.type && !item.device) return null;
      }
      return parsed as TriggerCondition[];
    }

    // Старый формат — объект с logic/conditions
    if (parsed && parsed.conditions && Array.isArray(parsed.conditions)) {
      if (!['ANY', 'ALL'].includes(parsed.logic)) return null;
      // Конвертируем старые поля в новые
      return parsed.conditions.map((c: any) => ({
        type: 'device',
        device: c.device,
        property: c.property,
        operator: c.operator || '=',
        value: c.value,
      })) as TriggerCondition[];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Определяет, какие device:property ключи нужны для проверки триггеров.
 */
export function getTriggerKeys(triggers: TriggerCondition[]): string[] {
  return triggers.map(t => `${t.device}:${t.property}`);
}
