import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User, Building, Mail, Phone, Plus, Search, Edit, Trash2,
  Sparkles, Loader2, Linkedin, WifiOff, MessageCircle
} from 'lucide-react';
import { Contact } from '../../../types';
import { ContactForm } from './ContactForm';
import { useContacts } from '../../../hooks/useDatabase';
import { contactsDB } from '../../../lib/db';
import { getWhatsAppLink } from '../../../shared/utils/contact-links';
import { toast } from '../../../lib/toast';
import { clientLogger } from '../../../lib/clientLogger';
import type { PaletteIntent } from '../../../lib/paletteIntent';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Pagination } from '../../../components/ui/Pagination';

const SENIORITY_COLORS: Record<string, string> = {
  'C-Level': 'bg-purple-100 text-purple-700 border-purple-200',
  'Director': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'VP': 'bg-blue-100 text-blue-700 border-blue-200',
  'Manager': 'bg-sky-100 text-sky-700 border-sky-200',
  'Analyst': 'bg-gray-100 text-gray-600 border-gray-200',
};

function SkeletonRow() {
  return (
    <tr className="border-b border-line animate-pulse">
      <td className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-2xl bg-surface-2" /><div className="space-y-2"><div className="h-3 bg-surface-2 rounded-full w-32" /><div className="h-2.5 bg-surface-2 rounded-full w-20" /></div></div></td>
      <td className="p-4 hidden md:table-cell"><div className="h-3 bg-surface-2 rounded-full w-28" /></td>
      <td className="p-4 hidden lg:table-cell"><div className="space-y-1.5"><div className="h-2.5 bg-surface-2 rounded-full w-36" /><div className="h-2.5 bg-surface-2 rounded-full w-24" /></div></td>
      <td className="p-4 hidden xl:table-cell"><div className="h-5 bg-surface-2 rounded-full w-20" /></td>
      <td className="p-4"><div className="flex justify-end gap-2"><div className="w-8 h-8 bg-surface-2 rounded-xl" /><div className="w-8 h-8 bg-surface-2 rounded-xl" /></div></td>
    </tr>
  );
}

export function ContactList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Se o Command Palette navegou aqui com um termo de busca, aplica antes do primeiro fetch.
  // Limpa o state da entrada de histórico logo em seguida (replace) pra um F5 nesta tela não
  // reaplicar a mesma busca de novo — location.state, ao contrário do singleton antigo, sobrevive
  // a reload porque é persistido pelo próprio navegador junto da entrada de histórico.
  useEffect(() => {
    const intent = location.state as PaletteIntent | null;
    if (intent?.type === 'prefill-search') {
      setSearchTerm(intent.value);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { contacts, meta, loading, error, refetch, deleteContact } = useContacts({
    page,
    limit: 20,
    search: searchTerm || undefined,
  });

  const totalPages = meta?.totalPages ?? 1;

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este contato?')) return;
    try {
      await deleteContact(id);
      toast.success('Contato excluído.');
    } catch (error) {
      clientLogger.error({ err: error }, 'Error deleting contact');
      toast.error(error instanceof Error ? error.message : 'Falha ao excluir o contato — confira se você tem permissão.');
    }
  };

  const handleEnrich = async (id: string) => {
    setEnrichingId(id);
    try {
      await contactsDB.enrich(id);
      await refetch();
    } catch (error) {
      clientLogger.error({ err: error }, 'Error enriching contact');
    } finally {
      setEnrichingId(null);
    }
  };

  const handleSave = () => {
    setIsFormOpen(false);
    setSelectedContact(null);
    refetch();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 overflow-y-auto bg-transparent p-6 md:p-8"
    >
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-ink tracking-tight">👤 Contatos & Decisores</h1>
            <p className="text-xs text-ink-2 mt-0.5 font-medium">
              {loading ? 'Carregando...' : `${meta?.total ?? contacts.length} contato${(meta?.total ?? contacts.length) !== 1 ? 's' : ''} no banco de dados`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-ink-2 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                placeholder="Buscar por nome, cargo, e-mail..."
                className="bg-surface/90 backdrop-blur-xl border border-line rounded-2xl pl-10 pr-4 py-2.5 text-xs text-ink font-semibold focus:ring-2 focus:ring-brand focus:outline-none shadow-md w-56"
              />
            </div>
            <button
              onClick={() => { setSelectedContact(null); setIsFormOpen(true); }}
              className="flex items-center gap-2 bg-gradient-to-r from-brand to-amber-500 text-white font-black text-xs px-5 py-2.5 rounded-2xl shadow-lg shadow-brand/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Novo Contato
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-surface/95 backdrop-blur-2xl rounded-[2rem] border border-line shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line bg-surface-2/60">
                  <th className="p-4 text-[11px] font-black text-ink-2 uppercase tracking-wider">Contato</th>
                  <th className="p-4 text-[11px] font-black text-ink-2 uppercase tracking-wider hidden md:table-cell">Empresa</th>
                  <th className="p-4 text-[11px] font-black text-ink-2 uppercase tracking-wider hidden lg:table-cell">Canais</th>
                  <th className="p-4 text-[11px] font-black text-ink-2 uppercase tracking-wider hidden xl:table-cell">Seniority</th>
                  <th className="p-4 text-[11px] font-black text-ink-2 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loading
                  ? [...Array(6)].map((_, i) => <SkeletonRow key={i} />)
                  : error
                  ? (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState
                          icon={<WifiOff className="w-8 h-8 text-brand" />}
                          title="Não foi possível carregar os contatos"
                          description={error}
                          actionLabel="Tentar novamente"
                          onAction={refetch}
                        />
                      </td>
                    </tr>
                  )
                  : contacts.length === 0
                  ? (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState
                          icon={<User className="w-8 h-8 text-brand" />}
                          title="Nenhum contato encontrado"
                          description="Cadastre o primeiro decisor pra começar a acompanhar essa conta."
                          actionLabel="Adicionar Primeiro Contato"
                          onAction={() => { setSelectedContact(null); setIsFormOpen(true); }}
                        />
                      </td>
                    </tr>
                  )
                  : contacts.map((contact, idx) => (
                    <motion.tr
                      key={contact.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.02 }}
                      className="hover:bg-orange-50/30 transition-colors group"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600 font-black text-sm shrink-0 border border-indigo-100 shadow-sm">
                            {contact.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-extrabold text-ink text-sm">{contact.name}</p>
                            <p className="text-xs text-ink-2 font-medium">{contact.role || contact.department || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <div className="flex items-center gap-1.5 text-xs text-ink-2 font-semibold">
                          <Building className="w-3.5 h-3.5 text-ink-2 shrink-0" />
                          <span className="truncate max-w-[150px]">
                            {contact.company?.tradeName || contact.company?.legalName || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <div className="space-y-0.5">
                          {contact.email && (
                            <div className="flex items-center gap-1.5 text-[11px] text-ink-2">
                              <Mail className="w-3 h-3 text-brand shrink-0" />
                              <span className="truncate max-w-[160px] font-medium">{contact.email}</span>
                            </div>
                          )}
                          {contact.phone && (
                            <div className="flex items-center gap-1.5 text-[11px] text-ink-2">
                              <Phone className="w-3 h-3 text-sky-500 shrink-0" />
                              <span className="font-medium">{contact.phone}</span>
                            </div>
                          )}
                          {(contact.whatsapp || contact.phone) && getWhatsAppLink(contact.whatsapp || contact.phone) && (
                            <a
                              href={getWhatsAppLink(contact.whatsapp || contact.phone)}
                              target="_blank"
                              rel="noreferrer"
                              title="Número coletado — a existência de WhatsApp não foi verificada"
                              className="flex items-center gap-1.5 text-[11px] text-emerald-600 hover:underline"
                            >
                              <MessageCircle className="w-3 h-3 shrink-0" />
                              <span className="font-medium">WhatsApp</span>
                            </a>
                          )}
                          {contact.linkedin && (
                            <div className="flex items-center gap-1.5 text-[11px] text-ink-2">
                              <Linkedin className="w-3 h-3 text-blue-600 shrink-0" />
                              <span className="font-medium">LinkedIn</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4 hidden xl:table-cell">
                        {contact.seniority && (
                          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${SENIORITY_COLORS[contact.seniority] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {contact.seniority}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => handleEnrich(contact.id)}
                            disabled={!!enrichingId}
                            className="p-2 rounded-xl bg-orange-50 text-brand border border-orange-100 hover:bg-orange-100 transition-all cursor-pointer disabled:opacity-40"
                            title="Validar e enriquecer contato"
                          >
                            {enrichingId === contact.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Sparkles className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => { setSelectedContact(contact); setIsFormOpen(true); }}
                            className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 transition-all cursor-pointer"
                            title="Editar contato"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(contact.id)}
                            className="p-2 rounded-xl bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 transition-all cursor-pointer"
                            title="Excluir contato"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          {!loading && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={meta?.total}
              itemLabel="contatos"
            />
          )}
        </div>
      </div>

      {isFormOpen && (
        <ContactForm
          contact={selectedContact}
          onClose={() => { setIsFormOpen(false); setSelectedContact(null); }}
          onSave={handleSave}
        />
      )}
    </motion.div>
  );
}
