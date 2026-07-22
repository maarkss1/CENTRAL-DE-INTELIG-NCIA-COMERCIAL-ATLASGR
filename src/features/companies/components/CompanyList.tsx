import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Company } from '../../../types';
import { CompanyForm } from './CompanyForm';
import { CompanyDetail } from './CompanyDetail';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { staggerContainer, staggerItem, fadeInUp } from '../../../lib/motion';
import {
    IconSearch,
    IconPlus,
    IconBuilding,
    IconMapPin,
    IconEdit,
    IconTrash,
    IconSparkle,
    IconSpinner,
    IconCheck,
    IconClose,
} from '../../../components/icons';

export function CompanyList() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
    const [enrichingId, setEnrichingId] = useState<string | null>(null);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchCompanies = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page: page.toString(),
                limit: '20'
            });
            if (searchTerm) {
                queryParams.append('q', searchTerm);
            }

            const url = `/api/companies?${queryParams.toString()}`;
            // Because our api wrapper returns { data, meta } if meta exists
            const response = await api.get<{data: Company[], meta: { totalPages: number }}>(url);

            // Handle both legacy array response and new paginated response during transition
            if (Array.isArray(response)) {
                setCompanies(response);
            } else if (response && response.data) {
                setCompanies(response.data);
                if (response.meta) {
                    setTotalPages(response.meta.totalPages);
                }
            }
        } catch (error) {
            console.error('Error fetching companies:', error);
        } finally {
            setLoading(false);
        }
    }, [searchTerm, page]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchCompanies();
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [fetchCompanies]);

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir esta empresa?')) return;
        try {
            await api.delete(`/api/companies/${id}`);
            setCompanies(prev => prev.filter(c => c.id !== id));
        } catch (error) {
            console.error('Error deleting company:', error);
        }
    };

    const handleSave = () => {
        setIsFormOpen(false);
        fetchCompanies();
    };

    const handleEnrich = async (id: string) => {
        setEnrichingId(id);
        try {
            const result = await api.post<{ company: Company }>(`/api/companies/${id}/enrich`);
            setCompanies(prev => prev.map(c => c.id === id ? result.company : c));
        } catch (error) {
            console.error('Error enriching company:', error);
        } finally {
            setEnrichingId(null);
        }
    };

    if (viewMode === 'detail' && selectedCompany) {
        return <CompanyDetail companyId={selectedCompany.id} onBack={() => { setViewMode('list'); setSelectedCompany(null); }} />;
    }

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
                            <IconBuilding className="w-6 h-6 text-atlas-orange" />
                            Empresas
                        </h1>
                        <p className="text-atlas-dark/50 mt-1">Gerencie a carteira de clientes e prospects</p>
                    </div>
                    <Button variant="premium" onClick={() => { setSelectedCompany(null); setIsFormOpen(true); }}>
                        <IconPlus className="w-4 h-4 mr-2" />
                        Nova Empresa
                    </Button>
                </motion.div>

                <Card className="p-4 flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <IconSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-atlas-dark/30" />
                        <input
                            type="text"
                            placeholder="Buscar por nome, CNPJ, cidade, segmento…"
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
                                    <th className="p-4 text-xs font-bold uppercase tracking-wide text-atlas-dark/40">Empresa</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wide text-atlas-dark/40 hidden md:table-cell">Segmento</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wide text-atlas-dark/40 hidden lg:table-cell">Localização</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wide text-atlas-dark/40">Status</th>
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
                                        <td colSpan={5} className="p-10 text-center text-atlas-dark/40">
                                            <div className="flex justify-center items-center gap-2">
                                                <IconSpinner className="w-5 h-5 text-atlas-orange animate-spin" />
                                                Carregando empresas…
                                            </div>
                                        </td>
                                    </tr>
                                ) : companies.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-10 text-center text-atlas-dark/40">
                                            <div className="flex flex-col items-center gap-2">
                                                <IconSearch className="w-6 h-6 text-atlas-dark/20" />
                                                Nenhuma empresa encontrada.
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                            companies.map((company) => (
                                                <motion.tr key={company.id} variants={staggerItem} className="hover:bg-black/[0.015] transition-colors group">
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setSelectedCompany(company); setViewMode('detail'); }}>
                                                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                                                                <IconBuilding className="w-5 h-5" />
                                                            </div>
                                                            <div>
                                                                <p className="font-semibold text-atlas-dark">{company.tradeName || company.legalName}</p>
                                                                <p className="text-sm text-atlas-dark/40">{company.cnpj || 'Sem CNPJ'}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 hidden md:table-cell">
                                                        <div className="flex items-center gap-2 text-atlas-dark/60 text-sm">
                                                            <IconBuilding className="w-4 h-4 text-atlas-dark/25" />
                                                            {company.segment || '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 hidden lg:table-cell">
                                                        <div className="flex items-center gap-2 text-atlas-dark/60 text-sm">
                                                            <IconMapPin className="w-4 h-4 text-atlas-dark/25" />
                                                            {company.city ? `${company.city}, ${company.state}` : '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <Badge variant={company.status === 'Ativo' ? 'success' : 'default'}>
                                                            {company.status === 'Ativo' ? <IconCheck className="w-3 h-3" /> : <IconClose className="w-3 h-3" />}
                                                            {company.status}
                                                        </Badge>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => handleEnrich(company.id)}
                                                                disabled={enrichingId === company.id}
                                                                className="p-2 text-atlas-dark/35 hover:text-atlas-orange hover:bg-atlas-orange/10 rounded-lg transition-colors disabled:opacity-50"
                                                                title="Enriquecer com IA"
                                                            >
                                                                <IconSparkle className={`w-4 h-4 ${enrichingId === company.id ? 'animate-spin' : ''}`} />
                                                            </button>
                                                            <button
                                                                onClick={() => { setSelectedCompany(company); setIsFormOpen(true); }}
                                                                className="p-2 text-atlas-dark/35 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                                title="Editar"
                                                            >
                                                                <IconEdit className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(company.id)}
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
                <CompanyForm
                    company={selectedCompany}
                    onClose={() => { setIsFormOpen(false); setSelectedCompany(null); }}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}
