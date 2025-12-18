export type GeminiModelId =
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'
  | 'gemini-2.0-flash';

export interface GeminiModelDefinition {
  id: GeminiModelId;
  /** Human friendly display name */
  name: string;
  /** Optional longer description */
  description?: string;
  /** Whether the model can accept images */
  supportsImages?: boolean;
  /** Acceptable alias strings that should resolve to this model id */
  aliases: string[];
}

export const GEMINI_MODEL_DEFINITIONS: GeminiModelDefinition[] = [
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Most capable Gemini model for complex reasoning and code generation',
    supportsImages: true,
    aliases: [
      'gemini-2.5-pro',
      'gemini-2-5-pro',
      'gemini-pro-2.5',
      'gemini-pro-2-5',
      'gemini-pro',
      '2.5-pro',
      '2-5-pro',
      'gemini-2.5-pro-latest',
      'gemini-2.5-pro-preview-06-05',
    ],
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Fast and efficient with strong reasoning capabilities',
    supportsImages: true,
    aliases: [
      'gemini-2.5-flash',
      'gemini-2-5-flash',
      'gemini-flash-2.5',
      'gemini-flash-2-5',
      'gemini-flash',
      '2.5-flash',
      '2-5-flash',
      'gemini-2.5-flash-latest',
      'gemini-2.5-flash-preview-05-20',
    ],
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: 'Previous generation flash model, fast and reliable',
    supportsImages: true,
    aliases: [
      'gemini-2.0-flash',
      'gemini-2-0-flash',
      'gemini-flash-2.0',
      'gemini-flash-2-0',
      '2.0-flash',
      '2-0-flash',
      'gemini-2.0-flash-exp',
    ],
  },
];

export const GEMINI_DEFAULT_MODEL: GeminiModelId = 'gemini-2.5-flash';

const GEMINI_MODEL_ALIAS_MAP: Record<string, GeminiModelId> = GEMINI_MODEL_DEFINITIONS.reduce(
  (map, definition) => {
    definition.aliases.forEach(alias => {
      const key = alias.trim().toLowerCase().replace(/[\s_]+/g, '-');
      map[key] = definition.id;
    });
    map[definition.id.toLowerCase()] = definition.id;
    return map;
  },
  {} as Record<string, GeminiModelId>
);

export function normalizeGeminiModelId(model?: string | null): GeminiModelId {
  if (!model) return GEMINI_DEFAULT_MODEL;
  const normalized = model.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return GEMINI_MODEL_ALIAS_MAP[normalized] ?? GEMINI_DEFAULT_MODEL;
}

export function getGeminiModelDefinition(id: string): GeminiModelDefinition | undefined {
  return (
    GEMINI_MODEL_DEFINITIONS.find(def => def.id === id) ??
    GEMINI_MODEL_DEFINITIONS.find(def =>
      def.aliases.some(alias => alias.toLowerCase() === id.toLowerCase())
    )
  );
}

export function getGeminiModelDisplayName(id?: string | null): string {
  if (!id) return GEMINI_DEFAULT_MODEL;
  return getGeminiModelDefinition(id)?.name ?? id;
}
