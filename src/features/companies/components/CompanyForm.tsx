import React from "react";
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Company } from '../../../types';
import { Button } from '../../../components/ui/Button';

interface CompanyFormProps {
    company?: Company | null;
    onClose: () => void;
    onSave: () => void;
}

const inputClass = "w-full px-4 py-2 bg-slate-950/60 border border-white/10 rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-atlas-orange/40 focus:border-atlas-orange outline-none transition-colors";
const labelClass = "text-sm font-medium text-gray-400";

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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900/95 backdrop-blur-xl rounded-card-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] border border-white/10">
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <h2 className="text-xl font-display font-bold text-white">
                        {company ? 'Editar Empresa' : 'Nova Empresa'}
                    </h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <form id="company-form" onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className={labelClass}>Razão Social *</label>
                                <input required type="text" value={formData.legalName || ''} onChange={e => setFormData({...formData, legalName: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className={labelClass}>Nome Fantasia *</label>
                                <input required type="text" value={formData.tradeName || ''} onChange={e => setFormData({...formData, tradeName: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className={labelClass}>CNPJ</label>
                                <input type="text" value={formData.cnpj || ''} onChange={e => setFormData({...formData, cnpj: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className={labelClass}>Segmento</label>
                                <input type="text" value={formData.segment || ''} onChange={e => setFormData({...formData, segment: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className={labelClass}>Cidade</label>
                                <input type="text" value={formData.city || ''} onChange={e => setFormData({...formData, city: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className={labelClass}>Estado (UF)</label>
                                <input type="text" maxLength={2} value={formData.state || ''} onChange={e => setFormData({...formData, state: e.target.value.toUpperCase()})} className={inputClass} />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <label className={labelClass}>Status</label>
                                <select value={formData.status || 'Ativo'} onChange={e => setFormData({...formData, status: e.target.value as Company['status']})} className={inputClass}>
                                    <option value="Ativo">Ativo</option>
                                    <option value="Inativo">Inativo</option>
                                    <option value="Em análise">Em análise</option>
                                </select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <label className={labelClass}>Observações</label>
                                <textarea rows={3} value={formData.observations || ''} onChange={e => setFormData({...formData, observations: e.target.value})} className={`${inputClass} resize-none`} />
                            </div>
                        </div>
                    </form>
                </div>

                <div className="p-6 border-t border-white/10 flex justify-end gap-3">
                    <Button type="button" variant="ghost" onClick={onClose} className="text-gray-300">
                        Cancelar
                    </Button>
                    <Button type="submit" form="company-form" disabled={loading}>
                        {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />}
                        {company ? 'Salvar Alterações' : 'Criar Empresa'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
