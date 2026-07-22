import React from "react";
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Contact, Company } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { IconClose, IconSpinner, IconSave } from '../../../components/icons';

interface ContactFormProps {
    contact?: Contact | null;
    onClose: () => void;
    onSave: () => void;
}

const inputClass = "w-full px-4 py-2 bg-black/[0.02] border border-black/5 rounded-xl focus:ring-2 focus:ring-atlas-orange/15 focus:border-atlas-orange/40 outline-none transition-all";

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
        <div className="fixed inset-0 bg-atlas-dark/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                className="glass-panel-strong elevation-4 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
                <div className="p-6 border-b border-black/5 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-atlas-dark">
                        {contact ? 'Editar Contato' : 'Novo Contato'}
                    </h2>
                    <button onClick={onClose} className="p-2 text-atlas-dark/35 hover:text-atlas-dark hover:bg-black/5 rounded-xl transition-colors">
                        <IconClose className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <form id="contact-form" onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-atlas-dark/70">Nome *</label>
                                <input required type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-atlas-dark/70">Empresa *</label>
                                <select required value={formData.companyId || ''} onChange={e => setFormData({...formData, companyId: e.target.value})} className={inputClass}>
                                    <option value="" disabled>Selecione uma empresa</option>
                                    {companies.map(company => (
                                        <option key={company.id} value={company.id}>{company.tradeName || company.legalName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-atlas-dark/70">Cargo</label>
                                <input type="text" value={formData.role || ''} onChange={e => setFormData({...formData, role: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-atlas-dark/70">E-mail</label>
                                <input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-atlas-dark/70">Telefone</label>
                                <input type="text" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-atlas-dark/70">WhatsApp</label>
                                <input type="text" value={formData.whatsapp || ''} onChange={e => setFormData({...formData, whatsapp: e.target.value})} className={inputClass} />
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
                    <Button type="submit" form="contact-form" variant="premium" disabled={loading}>
                        {loading ? <IconSpinner className="w-4 h-4 mr-2 animate-spin" /> : <IconSave className="w-4 h-4 mr-2" />}
                        {contact ? 'Salvar Alterações' : 'Criar Contato'}
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}
