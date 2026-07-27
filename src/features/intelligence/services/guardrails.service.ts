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

export class GuardrailsService {
    validateOutput(text: string): boolean {
        return !redactSensitiveData(text).redacted;
    }
}
