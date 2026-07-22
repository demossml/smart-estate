import { decryptToken } from './crypto';
import { query, db } from './db';
import logger from './logger';

// ── AI Call ───────────────────────────────────────────────
interface AICallOptions {
  temperature?: number;
  max_tokens?: number;
  model?: string;
}

/**
 * Вызывает AI-провайдер, помеченный use_in_scenarios=1.
 * Если такого нет — берёт первый доступный.
 * Возвращает текст ответа.
 */
export async function call(prompt: string, options: AICallOptions = {}): Promise<string> {
  const providers = await query(
    `SELECT * FROM ai_providers ORDER BY use_in_scenarios DESC, created_at ASC LIMIT 1`
  );
  if (!providers.length) {
    throw new Error('Нет настроенных AI-провайдеров. Добавьте провайдера в /settings/ai');
  }

  const prov = providers[0];
  const token = decryptToken(prov.token_enc);
  const baseUrl = prov.base_url || 'https://api.openai.com/v1';
  const model = options.model || prov.model || 'gpt-4o-mini';

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 256,
  };

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`AI API error ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json() as any;
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI вернул пустой ответ');
  }

  logger.log("[AI] ", `✨ AI call: ${model} (${prov.provider}) — ${content.slice(0, 60)}...`);
  return content;
}

// ── Device type detection via AI ──────────────────────────
const VALID_TYPES = [
  'light', 'sensor', 'plug', 'gate', 'climate', 'lock',
  'door_sensor', 'window_sensor', 'air_monitor',
  'motion_sensor', 'presence_sensor', 'leak_sensor',
  'smoke_sensor', 'temp_sensor', 'humid_sensor',
  'remote', 'button', 'occupancy_sensor', 'light_sensor',
];

export async function detectDeviceTypeWithAI(
  exposes: any[],
  model: string,
  vendor: string,
  telemetryStats: any
): Promise<string | null> {
  try {
    const prompt = `Ты — эксперт по Zigbee-устройствам. Определи тип устройства максимально точно.

Model: ${model}
Vendor: ${vendor}
Exposes: ${JSON.stringify(exposes.slice(0, 8))}
Телеметрия (min/max/avg по каждому параметру): ${JSON.stringify(telemetryStats)}

Возможные типы: ${VALID_TYPES.join(', ')}.

Правила определения:
- Если есть temperature + humidity БЕЗ co2/voc/pm → temp_sensor
- Если есть temperature + humidity + co2/voc → air_monitor
- Если есть contact + tamper → window_sensor
- Если есть contact БЕЗ tamper → door_sensor
- Если есть presence → presence_sensor
- Если есть occupancy → motion_sensor
- Если есть water_leak → leak_sensor
- Если есть smoke → smoke_sensor

Ответь ТОЛЬКО одним словом из списка возможных типов.`;

    const result = await call(prompt, { temperature: 0.1, max_tokens: 10 });
    const trimmed = result.trim().toLowerCase().replace(/[^a-z_]/g, '');

    if (VALID_TYPES.includes(trimmed)) {
      logger.log("[AI] ", `🧠 Device AI → ${trimmed} (${model})`);
      return trimmed;
    }

    logger.log("[AI] ", `⚠️ AI вернул неизвестный тип: "${trimmed}" для ${model}`);
    return null;
  } catch (e: any) {
    logger.error("[AI] ", `❌ AI detection error: ${e.message}`);
    return null;
  }
}
