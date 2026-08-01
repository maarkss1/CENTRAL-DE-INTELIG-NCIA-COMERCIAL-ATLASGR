const CPF_REGEX = /\d{3}\.\d{3}\.\d{3}-\d{2}/g;

/**
 * Passo de pós-processamento aplicado a toda saída de IA antes de devolvê-la ao usuário: mascara
 * CPFs que a IA eventualmente tenha alucinado ou copiado do contexto (a Atlas lida com dados de
 * contato reais no CRM, e conteúdo gerado nunca deveria expor esse dado em texto livre).
 */
export function redactSensitiveData(text: string): { text: string; redacted: boolean } {
    if (!CPF_REGEX.test(text)) {
        return { text, redacted: false };
    }
    CPF_REGEX.lastIndex = 0;
    return { text: text.replace(CPF_REGEX, '[CPF OCULTADO]'), redacted: true };
}

export interface PiiToken {
    token: string;
    value: string;
}

/**
 * Substitui, no texto que sairá para um provedor de IA externo (Groq/OpenAI/Gemini),
 * valores de PII conhecidos (hoje: nome do contato) por um token estável. Diferente de
 * `redactSensitiveData`, isso não descarta o dado — ele é devolvido para reidratação,
 * porque ferramentas como rascunho de e-mail/WhatsApp legitimamente precisam do nome
 * real do contato no texto final entregue ao usuário humano. O que muda é que o
 * provedor de IA nunca vê o valor real durante a geração do conteúdo.
 */
export function minimizePii(text: string, values: Array<{ token: string; value: string | null | undefined }>): { text: string; applied: PiiToken[] } {
    let minimized = text;
    const applied: PiiToken[] = [];
    for (const { token, value } of values) {
        if (!value) continue;
        const trimmed = value.trim();
        // Evita substituir strings curtas demais (ex.: nome de 1-2 letras), que
        // aumentam o risco de substituição indevida de texto não relacionado à PII.
        if (trimmed.length < 3) continue;
        if (minimized.includes(trimmed)) {
            minimized = minimized.split(trimmed).join(token);
            applied.push({ token, value: trimmed });
        }
    }
    return { text: minimized, applied };
}

/**
 * Restaura, na resposta da IA, os valores reais nos tokens de PII aplicados por `minimizePii`.
 */
export function rehydratePii(text: string, applied: PiiToken[]): string {
    let result = text;
    for (const { token, value } of applied) {
        result = result.split(token).join(value);
    }
    return result;
}

export class GuardrailsService {
    validateOutput(text: string): boolean {
        return !redactSensitiveData(text).redacted;
    }
}
