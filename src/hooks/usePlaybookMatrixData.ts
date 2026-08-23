import { useEffect, useState } from 'react';
import { playbookApi, type ObjectionMatrixItem, type QualificationMatrixItem } from '../features/playbook/playbook.api';
import { clientLogger } from '../lib/clientLogger';

/**
 * Busca as duas matrizes (qualificação + objeções) da marca ativa uma única vez — usado pelo
 * Chatbook flutuante (FloatingChatbook.tsx, que antes importava BRAND_OBJECTIONS/
 * BRAND_QUALIFICATIONS de um arquivo estático em 3 hooks distintos) e pelo Chatbook principal
 * (ChatbookHub.tsx). Sem isso, cada um dos 3 hooks buscaria a mesma coisa separadamente.
 */
export function usePlaybookMatrixData(brand: 'atlasgr' | 'totaltrac') {
    const [objections, setObjections] = useState<ObjectionMatrixItem[]>([]);
    const [qualifications, setQualifications] = useState<QualificationMatrixItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all([
            playbookApi.listObjections(brand),
            playbookApi.listQualifications(brand),
        ])
            .then(([objs, quals]) => {
                if (cancelled) return;
                setObjections(objs);
                setQualifications(quals);
            })
            .catch((err) => {
                if (cancelled) return;
                clientLogger.error({ err }, 'Falha ao carregar matrizes de qualificação/objeções');
                setObjections([]);
                setQualifications([]);
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [brand]);

    return { objections, qualifications, loading };
}
