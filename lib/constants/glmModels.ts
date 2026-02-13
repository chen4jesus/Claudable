export type GLMModelId = 'glm-5';

export interface GLMModelDefinition {
  id: GLMModelId;
  name: string;
  description?: string;
  supportsImages?: boolean;
  aliases: string[];
}

export const GLM_MODEL_DEFINITIONS: GLMModelDefinition[] = [
  {
    id: 'glm-5',
    name: 'GLM 5',
    description: 'Zhipu GLM 5 with Claude Code compatible agent runtime',
    supportsImages: true,
    aliases: [
      'glm5',
      'glm-5',
      'glm_5',
      'glm 5',
      'glm',
      'glm-latest',
    ],
  },
];

export const GLM_DEFAULT_MODEL: GLMModelId = 'glm-5';

const GLM_MODEL_ALIAS_MAP: Record<string, GLMModelId> = GLM_MODEL_DEFINITIONS.reduce(
  (acc, definition) => {
    acc[definition.id.toLowerCase()] = definition.id;
    for (const alias of definition.aliases) {
      acc[alias.toLowerCase()] = definition.id;
    }
    return acc;
  },
  {} as Record<string, GLMModelId>,
);

export function normalizeGLMModelId(model?: string | null): GLMModelId {
  if (!model) {
    return GLM_DEFAULT_MODEL;
  }
  const normalized = model.trim().toLowerCase();
  if (!normalized) {
    return GLM_DEFAULT_MODEL;
  }
  return GLM_MODEL_ALIAS_MAP[normalized] ?? GLM_DEFAULT_MODEL;
}

export function getGLMModelDefinition(id: string): GLMModelDefinition | undefined {
  return (
    GLM_MODEL_DEFINITIONS.find((definition) => definition.id === id) ??
    GLM_MODEL_DEFINITIONS.find((definition) =>
      definition.aliases.some((alias) => alias.toLowerCase() === id.toLowerCase()),
    )
  );
}

export function getGLMModelDisplayName(id?: string | null): string {
  if (!id) {
    return getGLMModelDefinition(GLM_DEFAULT_MODEL)?.name ?? GLM_DEFAULT_MODEL;
  }
  const normalized = normalizeGLMModelId(id);
  return getGLMModelDefinition(normalized)?.name ?? normalized;
}
