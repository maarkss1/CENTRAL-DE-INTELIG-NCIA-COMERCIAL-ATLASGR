import React from 'react';
import { ClockCalendarWidget } from '../../../components/ui/ClockCalendarWidget';
import { LiveStatsWidget } from '../../../components/ui/LiveStatsWidget';
import { useBrand } from '../../../contexts/BrandContext';
import { useAuth } from '../../../contexts/AuthContext';
import { motion } from 'framer-motion';

export function SinglePageDashboard({ onSelectModule }: { onSelectModule?: (tab: string) => void }) {
    const { activeBrand } = useBrand();
    const { currentUser } = useAuth();
    const isAtlas = activeBrand === 'atlasgr';

    return (
        <div className="flex-1 overflow-y-auto bg-transparent flex flex-col items-center relative min-h-screen font-sans p-4 md:p-8 space-y-8">
            <div className="w-full max-w-7xl space-y-8">
                
                {/* Header Simples do Painel */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black">Olá, {currentUser?.name || 'Usuário'}</h1>
                        <p className="text-sm opacity-70">Resumo da operação {isAtlas ? 'AtlasGR' : 'TotalTrac'} de hoje.</p>
                    </div>
                </div>

                <ClockCalendarWidget />
                
                <LiveStatsWidget />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <motion.div 
                        whileHover={{ scale: 1.02 }}
                        onClick={() => onSelectModule && onSelectModule('prospect')}
                        className={`p-8 rounded-3xl cursor-pointer shadow-lg border ${isAtlas ? 'bg-orange-500 text-white border-orange-400' : 'bg-blue-600 text-white border-blue-500'}`}
                    >
                        <h2 className="text-xl font-black mb-2">Prospecção Ativa</h2>
                        <p className="text-sm opacity-90">Ir para a área de mapeamento e varredura de mercado.</p>
                    </motion.div>

                    <motion.div 
                        whileHover={{ scale: 1.02 }}
                        onClick={() => onSelectModule && onSelectModule('crm')}
                        className={`p-8 rounded-3xl cursor-pointer shadow-lg border ${isAtlas ? 'bg-white text-slate-900 border-orange-100' : 'bg-slate-800 text-white border-slate-700'}`}
                    >
                        <h2 className="text-xl font-black mb-2">Pipeline de Vendas</h2>
                        <p className="text-sm opacity-90">Acessar os quadros Kanban do CRM.</p>
                    </motion.div>
                </div>

            </div>
        </div>
    );
}
