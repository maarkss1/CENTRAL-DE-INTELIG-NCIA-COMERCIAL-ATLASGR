import { useEffect, useState } from 'react';
import {
  Building2,
  Briefcase,
  Calendar,
  Mail,
  Phone,
  MessageCircle,
  ShieldCheck,
  ShieldQuestion,
  AlertTriangle,
} from 'lucide-react';
import { LinkedinIcon as Linkedin } from '../../../components/ui/icons/LinkedinIcon';
import { Drawer } from '../../../components/ui/Drawer';
import { Skeleton } from '../../../components/ui/Skeleton';
import { contactsDB } from '../../../lib/db';
import { getWhatsAppLink } from '../../../shared/utils/contact-links';
import { useActiveRecord } from '../../../contexts/ActiveRecordContext';
import { LEAD_STATUS_EMOJI } from '../../../lib/enumMap';
import type { Contact } from '../../../types';

interface ContactDetailProps {
  /** `null` mantém a gaveta fechada — o próprio componente controla o fetch a partir do id. */
  contactId: string | null;
  onClose: () => void;
}

function formatCurrency(amount: number, currency = 'BRL'): string {
  return amount.toLocaleString('pt-BR', { style: 'currency', currency });
}

/**
 * Gaveta real de detalhe do contato — antes era um stub morto (`return <div />`), nunca importado
 * por nenhuma rota (achado do Piloto 013). `GET /api/contacts/:id` já existia e já devolvia
 * `company` completa + `leads[]`; só faltava um consumidor de UI. Reaproveita o primitivo `Drawer`
 * (foco/Escape/backdrop já resolvidos) em vez do padrão bespoke maior de `LeadDetailDrawer.tsx`.
 */
export function ContactDetail({ contactId, onClose }: ContactDetailProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setActiveRecord, clearActiveRecord } = useActiveRecord();

  useEffect(() => {
    if (!contactId) {
      setContact(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    contactsDB
      .get(contactId)
      .then((data) => {
        if (!cancelled) setContact(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar o contato.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  // Mesmo padrão já usado por CompanyDetail/Account360/PropostaDetail/LeadDetailDrawer/ContactForm/
  // DealDrillDownDrawer — o copiloto de IA global (Piloto 010) já lê este contexto.
  useEffect(() => {
    if (!contact) return;
    setActiveRecord({
      type: 'contact',
      id: contact.id,
      label: contact.name,
      summary: contact.role || contact.department || undefined,
    });
    return () => clearActiveRecord(contact.id);
  }, [contact, setActiveRecord, clearActiveRecord]);

  const whatsappLink = contact ? getWhatsAppLink(contact.whatsapp || contact.phone) : '';

  return (
    <Drawer
      isOpen={contactId != null}
      onClose={onClose}
      title={contact?.name ?? 'Contato'}
      subtitle={contact ? contact.role || contact.department || undefined : undefined}
    >
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {error && (
        <div className="p-4 rounded-card border border-danger/30 bg-danger/10 flex items-center gap-2.5 text-sm text-danger-active dark:text-danger">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {contact && !loading && !error && (
        <div className="space-y-6">
          <section>
            <h4 className="text-[11px] font-black text-ink-2 uppercase tracking-wide mb-2">
              Empresa
            </h4>
            <div className="p-4 rounded-card border border-line bg-surface-2 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-brand/10 text-brand-active dark:text-brand-2 shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink truncate">
                  {contact.company?.tradeName || contact.company?.legalName || '—'}
                </p>
                {contact.company?.segment && (
                  <p className="text-xs text-ink-2 truncate">{contact.company.segment}</p>
                )}
              </div>
            </div>
          </section>

          <section>
            <h4 className="text-[11px] font-black text-ink-2 uppercase tracking-wide mb-2">
              Contato
            </h4>
            <div className="space-y-2">
              {contact.email && (
                <div className="flex items-center gap-2 text-sm text-ink">
                  <Mail className="w-3.5 h-3.5 text-ink-2 shrink-0" /> {contact.email}
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-2 text-sm text-ink">
                  <Phone className="w-3.5 h-3.5 text-ink-2 shrink-0" /> {contact.phone}
                </div>
              )}
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-success-active dark:text-success hover:underline"
                >
                  <MessageCircle className="w-3.5 h-3.5 shrink-0" /> WhatsApp
                </a>
              )}
              {contact.linkedin && (
                <a
                  href={contact.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-info-active dark:text-info hover:underline"
                >
                  <Linkedin className="w-3.5 h-3.5 shrink-0" /> LinkedIn
                </a>
              )}
              {contact.department && (
                <div className="flex items-center gap-2 text-sm text-ink-2">
                  <Briefcase className="w-3.5 h-3.5 shrink-0" /> {contact.department}
                </div>
              )}
              {contact.birthDate && (
                <div className="flex items-center gap-2 text-sm text-ink-2">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />{' '}
                  {new Date(contact.birthDate).toLocaleDateString('pt-BR')}
                </div>
              )}
              {contact.source && (
                <p className="text-xs text-ink-2">
                  Origem: {contact.source}
                  {contact.emailStatus ? ` · e-mail ${contact.emailStatus}` : ''}
                </p>
              )}
              {contact.observations && (
                <p className="text-xs text-ink-2 leading-relaxed border-t border-line pt-2 mt-2">
                  {contact.observations}
                </p>
              )}
            </div>
          </section>

          {/* Consentimento de IA (LGPD) — campo real, nunca mostrado em nenhuma tela antes desta
              gaveta (achado do Piloto 013). Nunca tratamos ausência como "não" silenciosamente. */}
          <section>
            <h4 className="text-[11px] font-black text-ink-2 uppercase tracking-wide mb-2">
              Privacidade
            </h4>
            <div
              className={`flex items-center gap-2 text-xs font-semibold px-3 py-2.5 rounded-card border ${
                contact.aiProcessingConsent
                  ? 'bg-success/10 border-success/20 text-success-active dark:text-success'
                  : 'bg-surface-2 border-line text-ink-2'
              }`}
            >
              {contact.aiProcessingConsent ? (
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ShieldQuestion className="w-3.5 h-3.5 shrink-0" />
              )}
              {contact.aiProcessingConsent
                ? 'Consentimento de processamento por IA registrado'
                : 'Sem consentimento de processamento por IA registrado'}
            </div>
          </section>

          <section>
            <h4 className="text-[11px] font-black text-ink-2 uppercase tracking-wide mb-2">
              Negócios vinculados
            </h4>
            {contact.leads && contact.leads.length > 0 ? (
              <div className="space-y-2">
                {contact.leads.map((lead) => (
                  <div
                    key={lead.id}
                    className="p-3 rounded-card border border-line bg-surface-2 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink truncate">
                        {lead.title || 'Negócio sem título'}
                      </p>
                      <p className="text-[11px] text-ink-2">
                        {LEAD_STATUS_EMOJI[lead.status] ?? ''} {lead.status}
                      </p>
                    </div>
                    {lead.amount != null && (
                      <p className="text-sm font-bold text-ink shrink-0">
                        {formatCurrency(lead.amount, lead.currency)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-2">Nenhum negócio vinculado a este contato ainda.</p>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
