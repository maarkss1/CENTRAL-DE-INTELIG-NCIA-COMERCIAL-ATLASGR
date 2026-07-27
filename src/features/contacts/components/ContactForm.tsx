import React from "react";
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Contact, Company } from '../../../types';
import { Button } from '../../../components/ui/Button';

interface ContactFormProps {
    contact?: Contact | null;
    onClose: () => void;
    onSave: () => void;
}

const inputClass = "w-full px-4 py-2 bg-slate-950/60 border border-white/10 rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-atlas-orange/40 focus:border-atlas-orange outline-none transition-colors";
const labelClass = "text-sm font-medium text-gray-400";

export function ContactForm({ contact, onClose, onSave }: ContactFormProps) {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [formData, setFormData] = useState<Partial<Contact>>({
        name: '',
        role: '',
        email: '',
        phone: '',
        whatsapp: '',
        companyId: '',
        status: 'Ativo'
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (contact) {
            setFormData(contact);
        }
        const fetchCompanies = async () => {
            try {
                const res = await fetch('/api/companies');
                if (res.ok) {
                    const data = await res.json();
                    setCompanies(data);
                }
            } catch (error) {
                console.error('Error fetching companies for contact form:', error);
            }
        };
        fetchCompanies();
    }, [contact]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const method = contact ? 'PUT' : 'POST';
            const url = contact ? `/api/contacts/${contact.id}` : '/api/contacts';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                onSave();
            }
        } catch (error) {
            console.error('Error saving contact:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900/95 backdrop-blur-xl rounded-card-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] border border-white/10">
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <h2 className="text-xl font-display font-bold text-white">
                        {contact ? 'Editar Contato' : 'Novo Contato'}
                    </h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <form id="contact-form" onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className={labelClass}>Nome *</label>
                                <input required type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className={labelClass}>Empresa *</label>
                                <select required value={formData.companyId || ''} onChange={e => setFormData({...formData, companyId: e.target.value})} className={inputClass}>
                                    <option value="" disabled>Selecione uma empresa</option>
                                    {companies.map(company => (
                                        <option key={company.id} value={company.id}>{company.tradeName || company.legalName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className={labelClass}>Cargo</label>
                                <input type="text" value={formData.role || ''} onChange={e => setFormData({...formData, role: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className={labelClass}>E-mail</label>
                                <input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className={labelClass}>Telefone</label>
                                <input type="text" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className={labelClass}>WhatsApp</label>
                                <input type="text" value={formData.whatsapp || ''} onChange={e => setFormData({...formData, whatsapp: e.target.value})} className={inputClass} />
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
                    <Button type="submit" form="contact-form" disabled={loading}>
                        {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />}
                        {contact ? 'Salvar Alterações' : 'Criar Contato'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
