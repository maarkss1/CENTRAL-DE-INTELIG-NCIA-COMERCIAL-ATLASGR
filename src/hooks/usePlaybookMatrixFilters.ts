import { useState } from 'react';
import { BRAND_OBJECTIONS, BRAND_QUALIFICATIONS } from '../features/chatbook/constants/brandMatrices';

/**
 * Estado/ações do filtro de matrizes de objeções/qualificação (aba "Matrizes & Objeções") do
 * FloatingChatbook — extraído em FRONT-006. `selectedBrand` vem do componente (compartilhado com
 * o assistente e o simulador de roleplay).
 */
export function usePlaybookMatrixFilters(selectedBrand: 'atlasgr' | 'totaltrac') {
    const [selectedSegment, setSelectedSegment] = useState<string>('todos');
    const [selectedPersona, setSelectedPersona] = useState<string>('todos');
    const [playbookView, setPlaybookView] = useState<'objections' | 'qualifications'>('objections');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const handleCopy = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const filteredObjections = BRAND_OBJECTIONS.filter((item) => {
        if (item.brand !== selectedBrand) return false;
        if (selectedSegment !== 'todos' && !item.segment.toLowerCase().includes(selectedSegment.toLowerCase())) return false;
        if (selectedPersona !== 'todos' && !item.persona.toLowerCase().includes(selectedPersona.toLowerCase())) return false;
        return true;
    });

    const filteredQualifications = BRAND_QUALIFICATIONS.filter((item) => {
        if (item.brand !== selectedBrand) return false;
        if (selectedSegment !== 'todos' && !item.segment.toLowerCase().includes(selectedSegment.toLowerCase())) return false;
        if (selectedPersona !== 'todos' && !item.persona.toLowerCase().includes(selectedPersona.toLowerCase())) return false;
        return true;
    });

    return {
        selectedSegment, setSelectedSegment,
        selectedPersona, setSelectedPersona,
        playbookView, setPlaybookView,
        copiedKey, handleCopy,
        filteredObjections, filteredQualifications,
    };
}
