import React from "react";
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Company } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { IconClose, IconSpinner, IconSave } from '../../../components/icons';

interface CompanyFormProps {
    company?: Company | null;
    onClose: () => void;
    onSave: () => void;
}

const inputClass = "w-full px-4 py-2 bg-black/[0.02] border border-black/5 rounded-xl focus:ring-2 focus:ring-atlas-orange/15 focus:border-atlas-orange/40 outline-none transition-all";

export function CompanyForm({ company, onClose, onSave }: CompanyFormProps) {
    const [formData, setFormData] = useState<Partial<Company>>({
        legalName: '',
        tradeName: '',
        cnpj: '',
        segment: '',
        city: '',
        state: '',
        status: 'Ativo'
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (company) {
            setFormData(company);
        }
    }, [company]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const method = company ? 'PUT' : 'POST';
            const url = company ? `/api/companies/${company.id}` : '/api/companies';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                onSave();
            }
        } catch (error) {
            console.error('Error saving company:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-atlas-dark/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                className="glass-panel-strong elevation-4 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
                <div className="p-6 border-b border-black/5 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-atlas-dark">
                        {company ? 'Editar Empresa' : 'Nova Empresa'}
                    </h2>
                    <button onClick={onClose} className="p-2 text-atlas-dark/35 hover:text-atlas-dark hover:bg-black/5 rounded-xl transition-colors">
                        <IconClose className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <form id="company-form" onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-atlas-dark/70">Razão Social *</label>
                                <input required type="text" value={formData.legalName || ''} onChange={e => setFormData({...formData, legalName: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-atlas-dark/70">Nome Fantasia *</label>
                                <input required type="text" value={formData.tradeName || ''} onChange={e => setFormData({...formData, tradeName: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-atlas-dark/70">CNPJ</label>
                                <input type="text" value={formData.cnpj || ''} onChange={e => setFormData({...formData, cnpj: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-atlas-dark/70">Segmento</label>
                                <input type="text" value={formData.segment || ''} onChange={e => setFormData({...formData, segment: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-atlas-dark/70">Cidade</label>
                                <input type="text" value={formData.city || ''} onChange={e => setFormData({...formData, city: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-atlas-dark/70">Estado (UF)</label>
                                <input type="text" maxLength={2} value={formData.state || ''} onChange={e => setFormData({...formData, state: e.target.value.toUpperCase()})} className={inputClass} />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-semibold text-atlas-dark/70">Status</label>
                                <select value={formData.status || 'Ativo'} onChange={e => setFormData({...formData, status: e.target.value as Company['status']})} className={inputClass}>
                                    <option value="Ativo">Ativo</option>
                                    <option value="Inativo">Inativo</option>
                                    <option value="Em análise">Em análise</option>
                                </select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-semibold text-atlas-dark/70">Observações</label>
                                <textarea rows={3} value={formData.observations || ''} onChange={e => setFormData({...formData, observations: e.target.value})} className={`${inputClass} resize-none`} />
                            </div>
                        </div>
                    </form>
                </div>

                <div className="p-6 border-t border-black/5 flex justify-end gap-3">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button type="submit" form="company-form" variant="premium" disabled={loading}>
                        {loading ? <IconSpinner className="w-4 h-4 mr-2 animate-spin" /> : <IconSave className="w-4 h-4 mr-2" />}
                        {company ? 'Salvar Alterações' : 'Criar Empresa'}
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}
