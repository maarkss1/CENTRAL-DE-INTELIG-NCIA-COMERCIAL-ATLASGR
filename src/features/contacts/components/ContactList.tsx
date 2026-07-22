import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Contact } from '../../../types';
import { ContactForm } from './ContactForm';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { staggerContainer, staggerItem, fadeInUp } from '../../../lib/motion';
import {
    IconSearch,
    IconPlus,
    IconBuilding,
    IconMail,
    IconPhone,
    IconUser,
    IconEdit,
    IconTrash,
    IconSparkle,
    IconSpinner,
    IconContacts,
} from '../../../components/icons';

export function ContactList() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
    const [enrichingId, setEnrichingId] = useState<string | null>(null);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchContacts = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page: page.toString(),
                limit: '20'
            });
            if (searchTerm) {
                queryParams.append('q', searchTerm);
            }

            const url = `/api/contacts?${queryParams.toString()}`;
            // Because our api wrapper returns { data, meta } if meta exists
            const response = await api.get<{data: Contact[], meta: { totalPages: number }}>(url);

            if (Array.isArray(response)) {
                setContacts(response);
            } else if (response && response.data) {
                setContacts(response.data);
                if (response.meta) {
                    setTotalPages(response.meta.totalPages);
                }
            }
        } catch (error) {
            console.error('Error fetching contacts:', error);
        } finally {
            setLoading(false);
        }
    }, [searchTerm, page]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchContacts();
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [fetchContacts]);

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este contato?')) return;
        try {
            await api.delete(`/api/contacts/${id}`);
            setContacts(prev => prev.filter(c => c.id !== id));
        } catch (error) {
            console.error('Error deleting contact:', error);
        }
    };

    const handleSave = () => {
        setIsFormOpen(false);
        fetchContacts();
    };

    const handleEnrich = async (id: string) => {
        setEnrichingId(id);
        try {
            const result = await api.post<{ contact: Contact }>(`/api/contacts/${id}/enrich`);
            setContacts(prev => prev.map(c => c.id === id ? result.contact : c));
        } catch (error) {
            console.error('Error enriching contact:', error);
        } finally {
            setEnrichingId(null);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <motion.div
                    variants={fadeInUp}
                    initial="hidden"
                    animate="show"
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                >
                    <div>
                        <h1 className="text-2xl font-bold text-atlas-dark flex items-center gap-2.5">
                            <IconContacts className="w-6 h-6 text-atlas-orange" />
                            Contatos
                        </h1>
                        <p className="text-atlas-dark/50 mt-1">Gerencie pessoas e pontos de contato</p>
                    </div>
                    <Button variant="premium" onClick={() => { setSelectedContact(null); setIsFormOpen(true); }}>
                        <IconPlus className="w-4 h-4 mr-2" />
                        Novo Contato
                    </Button>
                </motion.div>

                <Card className="p-4 flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <IconSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-atlas-dark/30" />
                        <input
                            type="text"
                            placeholder="Buscar por nome, e-mail, telefone, cargo, empresa…"
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                            className="w-full pl-10 pr-4 py-2.5 bg-black/[0.02] border border-black/5 rounded-xl focus:ring-2 focus:ring-atlas-orange/20 focus:border-atlas-orange/40 transition-all outline-none text-sm"
                        />
                    </div>
                </Card>

                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-black/5 bg-black/[0.015]">
                                    <th className="p-4 text-xs font-bold uppercase tracking-wide text-atlas-dark/40">Contato</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wide text-atlas-dark/40 hidden md:table-cell">Empresa</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wide text-atlas-dark/40 hidden lg:table-cell">Canais</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wide text-atlas-dark/40 text-right">Ações</th>
                                </tr>
                            </thead>
                            <motion.tbody
                                variants={staggerContainer(0.03)}
                                initial="hidden"
                                animate="show"
                                className="divide-y divide-black/5"
                            >
                                {loading ? (
                                    <tr>
                                        <td colSpan={4} className="p-10 text-center text-atlas-dark/40">
                                            <div className="flex justify-center items-center gap-2">
                                                <IconSpinner className="w-5 h-5 text-atlas-orange animate-spin" />
                                                Carregando contatos…
                                            </div>
                                        </td>
                                    </tr>
                                ) : contacts.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="p-10 text-center text-atlas-dark/40">
                                            <div className="flex flex-col items-center gap-2">
                                                <IconSearch className="w-6 h-6 text-atlas-dark/20" />
                                                Nenhum contato encontrado.
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    contacts.map((contact) => (
                                        <motion.tr key={contact.id} variants={staggerItem} className="hover:bg-black/[0.015] transition-colors group">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                                                        <IconUser className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-atlas-dark">{contact.name}</p>
                                                        <p className="text-sm text-atlas-dark/40">{contact.role || '-'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 hidden md:table-cell">
                                                <div className="flex items-center gap-2 text-atlas-dark/60 text-sm">
                                                    <IconBuilding className="w-4 h-4 text-atlas-dark/25" />
                                                    {contact.company?.tradeName || contact.company?.legalName || '-'}
                                                </div>
                                            </td>
                                            <td className="p-4 hidden lg:table-cell">
                                                <div className="flex flex-col gap-1 text-sm text-atlas-dark/60">
                                                    {contact.email && <div className="flex items-center gap-1.5"><IconMail className="w-3.5 h-3.5 text-atlas-dark/25" /> {contact.email}</div>}
                                                    {contact.phone && <div className="flex items-center gap-1.5"><IconPhone className="w-3.5 h-3.5 text-atlas-dark/25" /> {contact.phone}</div>}
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleEnrich(contact.id)}
                                                        disabled={enrichingId === contact.id || !contact.companyId}
                                                        className="p-2 text-atlas-dark/35 hover:text-atlas-orange hover:bg-atlas-orange/10 rounded-lg transition-colors disabled:opacity-50"
                                                        title={contact.companyId ? 'Enriquecer empresa com IA' : 'Contato sem empresa vinculada'}
                                                    >
                                                        <IconSparkle className={`w-4 h-4 ${enrichingId === contact.id ? 'animate-spin' : ''}`} />
                                                    </button>
                                                    <button
                                                        onClick={() => { setSelectedContact(contact); setIsFormOpen(true); }}
                                                        className="p-2 text-atlas-dark/35 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        title="Editar"
                                                    >
                                                        <IconEdit className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(contact.id)}
                                                        className="p-2 text-atlas-dark/35 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Excluir"
                                                    >
                                                        <IconTrash className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))
                                )}
                            </motion.tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="p-4 border-t border-black/5 bg-black/[0.015] flex justify-between items-center">
                            <span className="text-sm text-atlas-dark/50">
                                Página {page} de {totalPages}
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page === 1}
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                >
                                    Anterior
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page === totalPages}
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                >
                                    Próxima
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            </div>

            {isFormOpen && (
                <ContactForm
                    contact={selectedContact}
                    onClose={() => { setIsFormOpen(false); setSelectedContact(null); }}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}
