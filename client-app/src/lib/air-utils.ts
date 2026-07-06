/**
 * air-utils.ts — единый модуль для работы с показателями качества воздуха
 *
 * Tuya-датчики шлют индексы 0-5 вместо реальных единиц.
 * Дорогие датчики (Aqara, Sensirion и др.) шлют реальные ppm, ppb, мкг/м³.
 * Автоопределение: если value целое 0-5 → Tuya-индекс, иначе → реальные единицы.
 */

// ── Tuya-метки для качества ──
export const TUYA_LABELS: Record<string, Record<number, string>> = {
  co2:           { 0: '—', 1: 'Чистый', 2: 'Норма', 3: 'Средний', 4: 'Плохой', 5: 'Опасно' },
  voc:           { 0: '—', 1: 'Чистый', 2: 'Норма', 3: 'Средний', 4: 'Плохой', 5: 'Опасно' },
  formaldehyde:  { 0: '—', 1: 'Норма', 2: 'Слабый', 3: 'Средний', 4: 'Высокий', 5: 'Опасно' },
};

// ── Статус по Tuya-индексу ──
export const TUYA_STATUS: Record<string, Record<number, 'good' | 'warn' | 'danger'>> = {
  co2:           { 0: 'good', 1: 'good', 2: 'good', 3: 'warn', 4: 'danger', 5: 'danger' },
  voc:           { 0: 'good', 1: 'good', 2: 'good', 3: 'warn', 4: 'danger', 5: 'danger' },
  formaldehyde:  { 0: 'good', 1: 'good', 2: 'warn', 3: 'warn', 4: 'danger', 5: 'danger' },
};

// ── Цвета для каждого статуса ──
export const STATUS_COLORS = {
  good:   { hex: '#30d588', tailwind: 'text-green border-green/30 bg-green/5', css: '#30d588' },
  warn:   { hex: '#ff9f0a', tailwind: 'text-yellow border-yellow/30 bg-yellow/5', css: '#ff9f0a' },
  danger: { hex: '#ff453a', tailwind: 'text-red border-red/30 bg-red/5', css: '#ff453a' },
} as const;

export type AirStatus = keyof typeof STATUS_COLORS;

// ── Эмодзи-индикаторы ──
export const STATUS_EMOJI: Record<AirStatus, string> = {
  good:   '🟢',
  warn:   '🟡',
  danger: '🔴',
};

// ── Человеческие названия полей ──
export const AIR_LABELS: Record<string, string> = {
  temperature:   'Температура',
  humidity:      'Влажность',
  co2:           'CO₂',
  voc:           'Летучие соединения (VOC)',
  formaldehyde:  'Формальдегид',
  pm25:          'PM2.5',
  pressure:      'Давление',
  battery:       'Батарея',
};

// ── Единицы для реальных значений ──
export const AIR_UNITS: Record<string, string> = {
  temperature:  '°',
  humidity:     '%',
  pm25:         'мкг/м³',
  pressure:     'мм рт.ст.',
  battery:      '%',
};

// ── Допустимые поля для отображения в UI ──
export const AIR_FIELDS = ['temperature', 'humidity', 'co2', 'voc', 'formaldehyde', 'pm25', 'pressure'];

/**
 * Определяет, является ли значение Tuya-индексом (0-5) — а не реальной величиной
 */
export function isTuyaIndex(property: string, value: number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  // Tuya-индексы: целое число от 0 до 5
  // Для co2 и voc — да, Tuya-индексы
  // Для formaldehyde — Tuya-датчик может показывать реальные µg/m³ (1-5), но дискретно
  if (property === 'co2' || property === 'voc') {
    return Number.isInteger(value) && value >= 0 && value <= 5;
  }
  // Для formaldehyde — если целое 0-5 считаем Tuya-индексом
  // (настоящие датчики дают дробные 0.001-0.080 мг/м³)
  if (property === 'formaldehyde') {
    return Number.isInteger(value) && value >= 0 && value <= 5;
  }
  return false;
}

/**
 * Получить статус поля (good/warn/danger) — для Tuya-индекса или реального значения
 */
export function getAirStatus(property: string, value: number | null | undefined): AirStatus {
  if (value === null || value === undefined) return 'good';

  if (isTuyaIndex(property, value)) {
    return TUYA_STATUS[property]?.[value] ?? 'good';
  }

  // Реальные значения — градация
  switch (property) {
    case 'temperature':
      if (value > 28 || value < 10) return 'danger';
      if (value > 24 || value < 18) return 'warn';
      return 'good';
    case 'humidity':
      if (value > 70 || value < 20) return 'danger';
      if (value > 60 || value < 30) return 'warn';
      return 'good';
    case 'co2':
      if (value > 2000) return 'danger';
      if (value > 1000) return 'warn';
      return 'good';
    case 'voc':
      if (value > 220) return 'danger';
      if (value > 65) return 'warn';
      return 'good';
    case 'formaldehyde':
      if (value > 0.08) return 'danger';
      if (value > 0.03) return 'warn';
      return 'good';
    case 'pm25':
      if (value > 35) return 'danger';
      if (value > 15) return 'warn';
      return 'good';
    default:
      return 'good';
  }
}

/**
 * Отформатировать значение для отображения
 * Tuya: "2 🟢 Норма"
 * Реальные: "26.2°", "54%", "420 ppm"
 */
export function formatAirValue(property: string, value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';

  if (isTuyaIndex(property, value)) {
    const label = TUYA_LABELS[property]?.[value] ?? `${value}`;
    const status = getAirStatus(property, value);
    return `${value} ${STATUS_EMOJI[status]} ${label}`;
  }

  // Реальные значения
  switch (property) {
    case 'temperature':
      return `${value.toFixed(1)}°`;
    case 'humidity':
      return `${Math.round(value)}%`;
    case 'co2':
      return `${Math.round(value)} ppm`;
    case 'voc':
      return `${Math.round(value)} ppb`;
    case 'formaldehyde':
      // Может быть Tuya-индекс (1-5) → уже обработано выше
      // или реальные единицы
      return `${value.toFixed(1)} мкг/м³`;
    case 'pm25':
      return `${value.toFixed(0)} мкг/м³`;
    case 'pressure':
      return `${Math.round(value)} мм рт.ст.`;
    case 'battery':
      return `${Math.round(value)}%`;
    default:
      return `${value}`;
  }
}

/**
 * Получить CSS-цвет для значения (по статусу)
 */
export function getAirColor(property: string, value: number | null | undefined): string {
  const status = getAirStatus(property, value);
  return STATUS_COLORS[status].css;
}

/**
 * Получить hex-цвет для значения
 */
export function getAirHexColor(property: string, value: number | null | undefined): string {
  const status = getAirStatus(property, value);
  return STATUS_COLORS[status].hex;
}

/**
 * Получить единицу для поля (если не Tuya)
 */
export function getAirUnit(property: string, value: number | null | undefined): string {
  if (isTuyaIndex(property, value)) return '';
  return AIR_UNITS[property] ?? '';
}

/**
 * Собрать поля для отображения — ТОЛЬКО те, что реально есть в данных устройства
 */
export function getActiveAirFields(device: any): { key: string; label: string }[] {
  const telemetry = device.latest_telemetry ?? [];
  const telProps = new Set(telemetry.map((t: any) => t.property));

  return AIR_FIELDS
    .filter(key => key in device || telProps.has(key))
    .map(key => ({ key, label: AIR_LABELS[key] ?? key }));
}
