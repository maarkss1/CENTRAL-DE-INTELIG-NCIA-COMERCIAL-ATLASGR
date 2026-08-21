import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Contact, Company } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { Label } from '../../../components/ui/Label';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { contactSchema } from '../../../lib/zod';
import { companiesDB, contactsDB } from '../../../lib/db';
import { clientLogger } from '../../../lib/clientLogger';
import { toast } from '../../../lib/toast';
import { useActiveRecord } from '../../../contexts/ActiveRecordContext';

interface ContactFormProps {
    contact?: Contact | null;
    onClose: () => void;
    onSave: () => void;
}

const errorClass = "text-xs text-danger mt-1";

// contactSchema.companyId é só `z.string()` (o backend recebe o id já resolvido por outros
// fluxos, ex. promoção de candidato) - aqui o campo vem de um <select>, então precisa da
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

    // Torna o copiloto de IA global ciente de qual contato está sendo editado - mesmo padrão de
    // CompanyDetail.tsx/LeadDetailDrawer.tsx. Contatos não têm uma tela de detalhe própria (só
    // lista + este formulário), então este é o único momento em que um contato específico está
    // "aberto" na tela.
    const { setActiveRecord, clearActiveRecord } = useActiveRecord();
    useEffect(() => {
        if (!contact) return;
        setActiveRecord({
            type: 'contact',
            id: contact.id,
            label: contact.name,
            summary: [contact.role, contact.company?.tradeName || contact.company?.legalName].filter(Boolean).join(' - ') || undefined,
        });
        return () => clearActiveRecord(contact.id);
    }, [contact, setActiveRecord, clearActiveRecord]);

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
                        <Label htmlFor="contact-name">Nome *</Label>
                        <Input id="contact-name" type="text" {...register('name')} />
                        {errors.name && <p className={errorClass}>{errors.name.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="contact-companyId">Empresa *</Label>
                        <Select id="contact-companyId" {...register('companyId')}>
                            <option value="" disabled>Selecione uma empresa</option>
                            {companies.map(company => (
                                <option key={company.id} value={company.id}>{company.tradeName || company.legalName}</option>
                            ))}
                        </Select>
                        {errors.companyId && <p className={errorClass}>{errors.companyId.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="contact-role">Cargo</Label>
                        <Input id="contact-role" type="text" {...register('role')} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="contact-email">E-mail</Label>
                        {/* type="text" (não "email") de propósito: o input nativo bloquearia o submit
                        antes até do handler do react-hook-form rodar, escondendo nossa própria
                        mensagem de erro atrás do popover de validação nativo do navegador. */}
                        <Input id="contact-email" type="text" inputMode="email" {...register('email')} />
                        {errors.email && <p className={errorClass}>{errors.email.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="contact-phone">Telefone</Label>
                        <Input id="contact-phone" type="text" {...register('phone')} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="contact-whatsapp">WhatsApp</Label>
                        <Input id="contact-whatsapp" type="text" {...register('whatsapp')} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="contact-observations">Observações</Label>
                        <Textarea id="contact-observations" rows={3} {...register('observations')} className="resize-none" />
                    </div>
                </div>
            </form>
        </Dialog>
    );
}
