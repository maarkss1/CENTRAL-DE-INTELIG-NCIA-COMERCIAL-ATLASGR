import { useState, useCallback, useEffect } from 'react';
import { api } from '../lib/api';
import { clientLogger } from '../lib/clientLogger';
import { toast } from '../lib/toast';
import { Lead } from '../types';

export function useCrmBoardController(funnel: 'Lead' | 'Negocio') {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLeads = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const url = `/api/leads?limit=1000&funnel=${funnel}`;
            const response = await api.get<{data: Lead[], meta?: { total: number, page: number, limit: number, totalPages: number }}>(url);


            if (Array.isArray(response)) {
                setLeads(response);
            } else if (response && response.data) {
                setLeads(response.data);
            }
        } catch (err) {
            clientLogger.error({ err }, 'Error fetching leads');
            setError(err instanceof Error ? err.message : 'N�o foi possivel carregar o pipeline comercial.');
        } finally {
            setLoading(false);
        }
    }, [funnel]);

    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    const handleConvert = useCallback(async (leadId: string) => {
        try {
            await api.post(`/api/crm/leads/${leadId}/convert`);
            toast.success('Lead convertido em neg�cio e enviado ao pipeline comercial.');
            await fetchLeads();
        } catch (error) {
            clientLogger.error({ err: error }, 'Error converting lead to deal');
            toast.error(error instanceof Error ? error.message : 'Falha ao converter o lead.');
        }
    }, [fetchLeads]);


    const handleImportBitrix = async () => {
        setLoading(true);
        try {
            const response = await api.post<{ data: { imported: number, skipped: number } }>('/api/leads/import/bitrix24');
            const data = response.data;
            if (data.imported > 0) {
                toast.success(`${data.imported} novos leads importados do Bitrix24! `);
                await fetchLeads();
            } else if (data.skipped > 0) {
                toast.info(`${data.skipped} leads recentes j� estavam no sistema.`);
            } else {
                toast.info('Nenhum lead novo encontrado no Bitrix24.');
            }
        } catch (err) {
            clientLogger.error({ err }, 'Error importing from Bitrix24');
            toast.error(err instanceof Error ? err.message : 'Falha ao importar do Bitrix24.');
        } finally {
            setLoading(false);
        }
    };


    const handleCardEnrich = useCallback(async (leadId: string) => {
        try {
            await api.post(`/api/leads/${leadId}/enrich`, undefined, { timeoutMs: 60_000 });
            await fetchLeads();
            toast.success('Lead enriquecido com sucesso.');
        } catch (error) {
            clientLogger.error({ err: error }, 'Error enriching lead');
            toast.error(error instanceof Error ? error.message : 'Falha ao enriquecer o lead.');
        }
    }, [fetchLeads]);

    return {
        leads,
        setLeads,
        loading,
        error,
        fetchLeads,
        handleConvert,
        handleImportBitrix,
        handleCardEnrich
    };
}
