export interface PromptSkill { id: string; meta: Record<string, string>; body: string }
export const BASE_PROMPT: string;
export const KNOWLEDGE_RULES: string;
export function formatSkill(skill: PromptSkill, limit?: number): string;
export function composeSystem(args?: { instructions?: string; skills?: PromptSkill[]; memory?: string; knowledge?: string[]; notes?: string[]; hostRules?: string; skillLimit?: number }): string;
