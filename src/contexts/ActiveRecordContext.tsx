import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface ActiveRecord {
    type: 'company' | 'contact' | 'lead' | 'deal' | 'document';
    id: string;
    label: string;
    /** Linha curta de contexto (segmento/cidade, cargo/canal, status/temperatura ou etapa do negócio). */
    summary?: string;
}

interface ActiveRecordContextValue {
    activeRecord: ActiveRecord | null;
    setActiveRecord: (record: ActiveRecord) => void;
    /** Só limpa se o id ainda for o registro ativo — evita que um unmount atrasado apague um registro mais novo. */
    clearActiveRecord: (id: string) => void;
}

const ActiveRecordContext = createContext<ActiveRecordContextValue | undefined>(undefined);

/**
 * Registro comercial (empresa/negócio) atualmente aberto na tela, para que o copiloto de IA global
 * (FloatingChatbook/useAssistantChat) saiba do que o usuário está falando sem precisar repetir o
 * contexto na pergunta. Telas de detalhe registram-se aqui ao montar e se removem ao desmontar.
 */
export function ActiveRecordProvider({ children }: { children: ReactNode }) {
    const [activeRecord, setActiveRecordState] = useState<ActiveRecord | null>(null);

    const setActiveRecord = useCallback((record: ActiveRecord) => {
        setActiveRecordState(record);
    }, []);

    const clearActiveRecord = useCallback((id: string) => {
        setActiveRecordState((prev) => (prev?.id === id ? null : prev));
    }, []);

    return (
        <ActiveRecordContext.Provider value={{ activeRecord, setActiveRecord, clearActiveRecord }}>
            {children}
        </ActiveRecordContext.Provider>
    );
}

export function useActiveRecord(): ActiveRecordContextValue {
    const ctx = useContext(ActiveRecordContext);
    if (!ctx) throw new Error('useActiveRecord deve ser usado dentro de ActiveRecordProvider');
    return ctx;
}
