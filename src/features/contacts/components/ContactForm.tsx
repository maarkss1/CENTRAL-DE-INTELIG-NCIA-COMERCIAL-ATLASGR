import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Contact, Company } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { contactSchema } from '../../../lib/zod';
import { companiesDB, contactsDB } from '../../../lib/db';
import { clientLogger } from '../../../lib/clientLogger';
import { toast } from '../../../lib/toast';

interface ContactFormProps {
    contact?: Contact | null;
    onClose: () => void;
    onSave: () => void;
}

const inputClass = "w-full px-4 py-2 bg-surface-2 border border-line rounded-xl text-sm text-ink placeholder-ink-2 focus:ring-2 focus:ring-brand/40 focus:border-brand outline-none transition-colors";
const labelClass = "text-sm font-medium text-ink-2";
const errorClass = "text-xs text-danger mt-1";

// contactSchema.companyId é só `z.string()` (o backend recebe o id já resolvido por outros
// fluxos, ex. promoção de candidato) — aqui o campo vem de um <select>, então precisa da
// mesma obrigatoriedade que o formulário sempre teve via `required` do HTML.
const contactFormSchema = contactSchema.extend({
    companyId: z.string().min(1, 'Selecione uma empresa'),
});

type ContactFormInput = z.input<typeof contactFormSchema>;
type ContactFormOutput = z.output<typeof contactFormSchema>;

const emptyDefaults: ContactFormInput = {
    name: '',
    role: '',
    email: '',
    phone: '',
    whatsapp: '',
    companyId: '',
    status: 'Ativo',
};

export function ContactForm({ contact, onClose, onSave }: ContactFormProps) {
    const [companies, setCompanies] = useState<Company[]>([]);
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<ContactFormInput, unknown, ContactFormOutput>({
        resolver: zodResolver(contactFormSchema),
        defaultValues: emptyDefaults,
    });

    useEffect(() => {
        reset(contact ? { ...emptyDefaults, ...contact } : emptyDefaults);

        companiesDB.list({ limit: 200 })
            .then((res) => setCompanies(res.data))
            .catch((error) => clientLogger.error({ err: error }, 'Error fetching companies for contact form'));
    }, [contact, reset]);

    const onSubmit = async (data: ContactFormOutput) => {
        try {
            if (contact) {
                await contactsDB.update(contact.id, data);
            } else {
                await contactsDB.create(data);
            }
            toast.success(contact ? 'Contato atualizado.' : 'Contato criado.');
            onSave();
        } catch (error) {
            clientLogger.error({ err: error }, 'Error saving contact');
            toast.error(error instanceof Error ? error.message : 'Falha ao salvar o contato.');
        }
    };

    return (
        <Dialog
            isOpen
            onClose={onClose}
            title={contact ? 'Editar Contato' : 'Novo Contato'}
            maxWidth="max-w-2xl"
            preventClose={isSubmitting}
            footer={
                <>
                    <Button type="button" variant="ghost" onClick={onClose} className="text-ink-2">
                        Cancelar
                    </Button>
                    <Button type="submit" form="contact-form" disabled={isSubmitting}>
                        {isSubmitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />}
                        {contact ? 'Salvar Alterações' : 'Criar Contato'}
                    </Button>
                </>
            }
        >
            <form id="contact-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label htmlFor="contact-name" className={labelClass}>Nome *</label>
                        <input id="contact-name" type="text" {...register('name')} className={inputClass} />
                        {errors.name && <p className={errorClass}>{errors.name.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="contact-companyId" className={labelClass}>Empresa *</label>
                        <select id="contact-companyId" {...register('companyId')} className={inputClass}>
                            <option value="" disabled>Selecione uma empresa</option>
                            {companies.map(company => (
                                <option key={company.id} value={company.id}>{company.tradeName || company.legalName}</option>
                            ))}
                        </select>
                        {errors.companyId && <p className={errorClass}>{errors.companyId.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="contact-role" className={labelClass}>Cargo</label>
                        <input id="contact-role" type="text" {...register('role')} className={inputClass} />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="contact-email" className={labelClass}>E-mail</label>
                        {/* type="text" (não "email") de propósito: o input nativo bloquearia o submit
                        antes até do handler do react-hook-form rodar, escondendo nossa própria
                        mensagem de erro atrás do popover de validação nativo do navegador. */}
                        <input id="contact-email" type="text" inputMode="email" {...register('email')} className={inputClass} />
                        {errors.email && <p className={errorClass}>{errors.email.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="contact-phone" className={labelClass}>Telefone</label>
                        <input id="contact-phone" type="text" {...register('phone')} className={inputClass} />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="contact-whatsapp" className={labelClass}>WhatsApp</label>
                        <input id="contact-whatsapp" type="text" {...register('whatsapp')} className={inputClass} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <label htmlFor="contact-observations" className={labelClass}>Observações</label>
                        <textarea id="contact-observations" rows={3} {...register('observations')} className={`${inputClass} resize-none`} />
                    </div>
                </div>
            </form>
        </Dialog>
    );
}
