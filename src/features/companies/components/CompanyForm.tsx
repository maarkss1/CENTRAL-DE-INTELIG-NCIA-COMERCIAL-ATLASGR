import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { Company } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { companySchema, COMPANY_STATUS } from '../../../lib/zod';
import { companiesDB } from '../../../lib/db';
import { clientLogger } from '../../../lib/clientLogger';

interface CompanyFormProps {
    company?: Company | null;
    onClose: () => void;
    onSave: () => void;
}

const inputClass = "w-full px-4 py-2 bg-surface-2 border border-line rounded-xl text-sm text-ink placeholder-ink-2 focus:ring-2 focus:ring-atlas-orange/40 focus:border-atlas-orange outline-none transition-colors";
const labelClass = "text-sm font-medium text-ink-2";
const errorClass = "text-xs text-danger mt-1";

// Validação do dígito verificador oficial do CNPJ (mesma regra usada em
// src/features/prospecting/services/cnpj.util.ts) — reimplementada aqui, em vez de
// importada, pra não acoplar o formulário de Empresas ao módulo de Prospecção.
function isValidCnpjFormat(raw: string): boolean {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(digits)) return false;

    const calcCheckDigit = (base: string): number => {
        const weights = base.length === 12
            ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
            : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const sum = base.split('').reduce((acc, digit, idx) => acc + Number(digit) * weights[idx], 0);
        const remainder = sum % 11;
        return remainder < 2 ? 0 : 11 - remainder;
    };

    const base = digits.slice(0, 12);
    const firstCheck = calcCheckDigit(base);
    const secondCheck = calcCheckDigit(base + firstCheck);
    return digits === base + String(firstCheck) + String(secondCheck);
}

const companyFormSchema = companySchema.extend({
    cnpj: companySchema.shape.cnpj.refine(
        (v) => !v || isValidCnpjFormat(v),
        'CNPJ inválido — confira os dígitos.'
    ),
});

// A entrada do formulário (pré-parse) e a saída (pós-parse) diferem porque o schema tem campos
// com `.default(...)` (phones/emails/tags/status) — status é opcional na entrada mas sempre
// presente na saída. useForm usa a entrada; o handler de submit recebe a saída já resolvida.
type CompanyFormInput = z.input<typeof companyFormSchema>;
type CompanyFormOutput = z.output<typeof companyFormSchema>;

const emptyDefaults: CompanyFormInput = {
    legalName: '',
    tradeName: '',
    cnpj: '',
    segment: '',
    city: '',
    state: '',
    status: 'Ativo',
    phones: [],
    emails: [],
    tags: [],
};

export function CompanyForm({ company, onClose, onSave }: CompanyFormProps) {
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<CompanyFormInput, unknown, CompanyFormOutput>({
        resolver: zodResolver(companyFormSchema),
        defaultValues: emptyDefaults,
    });

    useEffect(() => {
        reset(company ? { ...emptyDefaults, ...company } : emptyDefaults);
    }, [company, reset]);

    const { onChange: onStateChange, ...stateField } = register('state');

    const onSubmit = async (data: CompanyFormOutput) => {
        try {
            if (company) {
                await companiesDB.update(company.id, data);
            } else {
                await companiesDB.create(data);
            }
            onSave();
        } catch (error) {
            clientLogger.error({ err: error }, 'Error saving company');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-surface/95 backdrop-blur-xl rounded-card-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] border border-line">
                <div className="p-6 border-b border-line flex justify-between items-center">
                    <h2 className="text-xl font-display font-bold text-ink">
                        {company ? 'Editar Empresa' : 'Nova Empresa'}
                    </h2>
                    <button onClick={onClose} className="p-2 text-ink-2 hover:text-ink hover:bg-surface-2 rounded-xl transition-colors cursor-pointer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <form id="company-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label htmlFor="company-legalName" className={labelClass}>Razão Social *</label>
                                <input id="company-legalName" type="text" {...register('legalName')} className={inputClass} />
                                {errors.legalName && <p className={errorClass}>{errors.legalName.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="company-tradeName" className={labelClass}>Nome Fantasia *</label>
                                <input id="company-tradeName" type="text" {...register('tradeName')} className={inputClass} />
                                {errors.tradeName && <p className={errorClass}>{errors.tradeName.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="company-cnpj" className={labelClass}>CNPJ</label>
                                <input id="company-cnpj" type="text" placeholder="00.000.000/0000-00" {...register('cnpj')} className={inputClass} />
                                {errors.cnpj && <p className={errorClass}>{errors.cnpj.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="company-segment" className={labelClass}>Segmento</label>
                                <input id="company-segment" type="text" {...register('segment')} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="company-city" className={labelClass}>Cidade</label>
                                <input id="company-city" type="text" {...register('city')} className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="company-state" className={labelClass}>Estado (UF)</label>
                                <input
                                    id="company-state"
                                    type="text"
                                    maxLength={2}
                                    {...stateField}
                                    onChange={(e) => {
                                        e.target.value = e.target.value.toUpperCase();
                                        onStateChange(e);
                                    }}
                                    className={inputClass}
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <label htmlFor="company-status" className={labelClass}>Status</label>
                                <select id="company-status" {...register('status')} className={inputClass}>
                                    {COMPANY_STATUS.map((status) => (
                                        <option key={status} value={status}>{status}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <label htmlFor="company-observations" className={labelClass}>Observações</label>
                                <textarea id="company-observations" rows={3} {...register('observations')} className={`${inputClass} resize-none`} />
                            </div>
                        </div>
                    </form>
                </div>

                <div className="p-6 border-t border-line flex justify-end gap-3">
                    <Button type="button" variant="ghost" onClick={onClose} className="text-ink-2">
                        Cancelar
                    </Button>
                    <Button type="submit" form="company-form" disabled={isSubmitting}>
                        {isSubmitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />}
                        {company ? 'Salvar Alterações' : 'Criar Empresa'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
