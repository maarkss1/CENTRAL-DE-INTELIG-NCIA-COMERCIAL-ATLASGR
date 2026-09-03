import { useEffect, useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Search, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { Label } from '../../../components/ui/Label';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { clientLogger } from '../../../lib/clientLogger';
import { companiesDB } from '../../../lib/db';
import { toast } from '../../../lib/toast';
import { crm360Api } from '../crm360.api';
import type { CrmCommercialDocument, CrmProduct } from '../crm360.types';
import type { Company } from '../../../types';

const DOCUMENT_TYPES = ['Orcamento', 'Proposta', 'Fatura', 'Contrato'] as const;

const lineItemFormSchema = z.object({
  productId: z.string().optional().nullable(),
  name: z.string().trim().min(1, 'Nome do item é obrigatório').max(180),
  sku: z.string().trim().max(80).optional(),
  quantity: z.coerce.number().positive('Quantidade deve ser maior que zero'),
  unitPrice: z.coerce.number().min(0, 'Preço não pode ser negativo'),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
});

const propostaFormSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  title: z.string().trim().min(1, 'Título é obrigatório').max(180),
  currency: z.string().trim().length(3, 'Use 3 letras (ex.: BRL)').default('BRL'),
  validUntil: z.string().optional(),
  dueDate: z.string().optional(),
  discount: z.coerce.number().min(0).default(0),
  lineItems: z.array(lineItemFormSchema).min(1, 'Adicione pelo menos um item'),
  notes: z.string().optional(),
  terms: z.string().optional(),
  changeReason: z.string().optional(),
});

type PropostaFormInput = z.input<typeof propostaFormSchema>;
type PropostaFormOutput = z.output<typeof propostaFormSchema>;

const emptyItem: PropostaFormInput['lineItems'][number] = {
  productId: null,
  name: '',
  sku: '',
  quantity: 1,
  unitPrice: 0,
  discountPercent: 0,
  taxPercent: 0,
};

const emptyDefaults: PropostaFormInput = {
  type: 'Proposta',
  title: '',
  currency: 'BRL',
  validUntil: '',
  dueDate: '',
  discount: 0,
  lineItems: [emptyItem],
  notes: '',
  terms: '',
  changeReason: '',
};

/** Mesma fórmula usada no server (PrismaCrm360Repository.calculateItem) — só para o preview ao
    vivo aqui; o total que realmente vale é sempre o recalculado pelo backend ao salvar. */
function computeItemTotal(item: {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
}): number {
  const gross = item.quantity * item.unitPrice;
  const afterDiscount = gross * (1 - (item.discountPercent || 0) / 100);
  const afterTax = afterDiscount * (1 + (item.taxPercent || 0) / 100);
  return Math.round(afterTax * 100) / 100;
}

function toIsoOrUndefined(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isoToDateInput(value?: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

interface PropostaFormProps {
  document?: CrmCommercialDocument | null;
  onClose: () => void;
  onSave: () => void;
}

export function PropostaForm({ document, onClose, onSave }: PropostaFormProps) {
  const isEdit = !!document;
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PropostaFormInput, unknown, PropostaFormOutput>({
    resolver: zodResolver(propostaFormSchema),
    defaultValues: emptyDefaults,
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' });
  const watchedItems = useWatch({ control, name: 'lineItems' });
  const watchedDiscount = useWatch({ control, name: 'discount' });

  const [products, setProducts] = useState<CrmProduct[]>([]);

  useEffect(() => {
    crm360Api
      .listProducts()
      .then(setProducts)
      .catch((err) => {
        clientLogger.error({ err }, 'Falha ao carregar catálogo de produtos');
      });
  }, []);

  // Achado real (auditoria desta sessão): CrmCommercialDocument.leadId/companyId/contactId já são
  // modelados de ponta a ponta (schema, API, painel "Registro vinculado" em PropostaDetail.tsx,
  // coluna "Vinculado" em PropostasList.tsx) mas este formulário nunca enviava nenhum dos três —
  // todo documento criado ficava com "Vinculado: —" pra sempre. Corrigido aqui só pro vínculo com
  // EMPRESA, e só na criação: `CrmDocumentUpdateInput` (usado no PUT de edição, crm360.api.ts) não
  // aceita `companyId`/`leadId`/`contactId` — mudar o vínculo de um documento já existente exigiria
  // uma rota de backend nova, fora do escopo desta correção pontual. `contactId` também ficou de
  // fora: a busca abaixo é por empresa (mesmo padrão de combobox com debounce já usado em
  // src/features/lgpd/components/DataSubjectRights.tsx), e a maioria dos documentos comerciais se
  // vincula a uma empresa, não a um contato específico — vincular contato exigiria uma segunda
  // busca encadeada (contatos da empresa escolhida), escopo maior que este ajuste.
  const [companySearch, setCompanySearch] = useState('');
  const [companyResults, setCompanyResults] = useState<Company[]>([]);
  const [searchingCompany, setSearchingCompany] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  useEffect(() => {
    if (isEdit || selectedCompany || companySearch.trim().length < 2) {
      setCompanyResults([]);
      return;
    }
    let cancelled = false;
    setSearchingCompany(true);
    const timer = window.setTimeout(() => {
      companiesDB
        .list({ search: companySearch, limit: 6 })
        .then((res) => {
          if (!cancelled) setCompanyResults(res.data);
        })
        .catch(() => {
          if (!cancelled) setCompanyResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchingCompany(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [companySearch, selectedCompany, isEdit]);

  useEffect(() => {
    reset(
      document
        ? {
            type: document.type,
            title: document.title,
            currency: document.currency,
            validUntil: isoToDateInput(document.validUntil),
            dueDate: isoToDateInput(document.dueDate),
            discount: document.discount,
            lineItems:
              document.lineItems.length > 0
                ? document.lineItems.map((item) => ({
                    productId: item.productId ?? null,
                    name: item.name,
                    sku: item.sku ?? '',
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    discountPercent: item.discountPercent,
                    taxPercent: item.taxPercent,
                  }))
                : [emptyItem],
            notes: document.notes ?? '',
            terms: document.terms ?? '',
            changeReason: '',
          }
        : emptyDefaults,
    );
  }, [document, reset]);

  const subtotal = (watchedItems || []).reduce(
    (sum, item) => sum + (Number(item?.quantity) || 0) * (Number(item?.unitPrice) || 0),
    0,
  );
  const total = Math.max(
    0,
    (watchedItems || []).reduce(
      (sum, item) =>
        sum +
        computeItemTotal({
          quantity: Number(item?.quantity) || 0,
          unitPrice: Number(item?.unitPrice) || 0,
          discountPercent: Number(item?.discountPercent) || 0,
          taxPercent: Number(item?.taxPercent) || 0,
        }),
      0,
    ) - (Number(watchedDiscount) || 0),
  );

  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  const applyProduct = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setValue(`lineItems.${index}.productId`, product.id);
    setValue(`lineItems.${index}.name`, product.name);
    setValue(`lineItems.${index}.sku`, product.sku ?? '');
    setValue(`lineItems.${index}.unitPrice`, product.price);
    setValue(`lineItems.${index}.taxPercent`, product.taxPercent);
  };

  const onSubmit = async (data: PropostaFormOutput) => {
    try {
      const lineItems = data.lineItems.map((item) => ({
        productId: item.productId || undefined,
        name: item.name,
        sku: item.sku || undefined,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        taxPercent: item.taxPercent,
      }));

      if (isEdit && document) {
        await crm360Api.updateDocument(document.id, {
          title: data.title,
          currency: data.currency,
          validUntil: toIsoOrUndefined(data.validUntil) ?? null,
          dueDate: toIsoOrUndefined(data.dueDate) ?? null,
          discount: data.discount,
          lineItems,
          notes: data.notes || null,
          terms: data.terms || null,
          changeReason: data.changeReason || null,
        });
        toast.success('Documento atualizado — nova versão registrada.');
      } else {
        await crm360Api.createDocument({
          type: data.type,
          title: data.title,
          currency: data.currency,
          validUntil: toIsoOrUndefined(data.validUntil) ?? null,
          dueDate: toIsoOrUndefined(data.dueDate) ?? null,
          discount: data.discount,
          lineItems,
          notes: data.notes || null,
          terms: data.terms || null,
          companyId: selectedCompany?.id ?? undefined,
        });
        toast.success('Documento criado.');
      }
      onSave();
    } catch (error) {
      clientLogger.error({ err: error }, 'Error saving commercial document');
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar o documento.');
    }
  };

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={isEdit ? `Editar ${document?.number}` : 'Novo Documento Comercial'}
      maxWidth="max-w-3xl"
      preventClose={isSubmitting}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} className="text-ink-2">
            Cancelar
          </Button>
          <Button type="submit" form="proposta-form" disabled={isSubmitting}>
            {isSubmitting && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
            )}
            {isEdit ? 'Salvar (nova versão)' : 'Criar Documento'}
          </Button>
        </>
      }
    >
      <form id="proposta-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="doc-type">Tipo *</Label>
            <Select id="doc-type" disabled={isEdit} {...register('type')}>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            {isEdit && (
              <p className="text-xs text-ink-2">Tipo não pode ser alterado após a criação.</p>
            )}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="doc-title">Título *</Label>
            <Input id="doc-title" type="text" {...register('title')} />
            {errors.title && (
              <p className="text-xs text-danger-active dark:text-danger mt-1">
                {errors.title.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-validUntil">Válido até</Label>
            <Input id="doc-validUntil" type="date" {...register('validUntil')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-dueDate">Vencimento</Label>
            <Input id="doc-dueDate" type="date" {...register('dueDate')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-discount">Desconto do documento (R$)</Label>
            <Input id="doc-discount" type="number" step="0.01" min="0" {...register('discount')} />
          </div>
        </div>

        {!isEdit && (
          <div className="space-y-2 relative">
            <Label htmlFor="doc-company-search">Vincular a uma empresa (opcional)</Label>
            {selectedCompany ? (
              <div className="flex items-center justify-between gap-2 bg-surface-2 border border-brand/30 rounded-xl px-3 py-2.5">
                <span className="text-sm font-bold text-ink truncate">
                  {selectedCompany.tradeName || selectedCompany.legalName}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCompany(null)}
                  className="text-xs font-semibold text-ink-2 hover:text-ink shrink-0"
                >
                  Trocar
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-2" />
                  <input
                    id="doc-company-search"
                    type="text"
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                    placeholder="Buscar empresa por nome..."
                    autoComplete="off"
                    className="w-full pl-9 pr-3 py-2.5 bg-surface-2 border border-line rounded-xl text-sm text-ink placeholder-ink-2 outline-none focus:ring-1 focus:ring-brand"
                  />
                  {searchingCompany && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-ink-2" />
                  )}
                </div>
                {companyResults.length > 0 && (
                  <div className="mt-1 bg-surface border border-line rounded-xl shadow-xl max-h-48 overflow-y-auto absolute z-10 w-full">
                    {companyResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCompany(c);
                          setCompanyResults([]);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-ink hover:bg-surface-2 transition-colors border-b border-line last:border-b-0"
                      >
                        {c.tradeName || c.legalName}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            {/* Rotula um grupo de campos (useFieldArray), não um único controle — <Label>
                            com htmlFor não se aplica aqui (jsx-a11y/label-has-associated-control).
                            role="group" + aria-labelledby no container abaixo é o padrão correto para
                            "nome de um grupo de campos". */}
            <span
              id="proposta-itens-heading"
              className="text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1.5 block"
            >
              Itens *
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => append(emptyItem)}
              className="text-xs h-8"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar item
            </Button>
          </div>
          {errors.lineItems?.root && (
            <p className="text-xs text-danger-active dark:text-danger">
              {errors.lineItems.root.message}
            </p>
          )}
          <div className="space-y-3" role="group" aria-labelledby="proposta-itens-heading">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-xl border border-line bg-surface-2 p-3 space-y-2"
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                  <div className="md:col-span-3">
                    <select
                      className="w-full h-9 rounded-lg border border-line bg-surface px-2 text-xs text-ink"
                      defaultValue=""
                      onChange={(e) => e.target.value && applyProduct(index, e.target.value)}
                    >
                      <option value="">Item avulso (ou escolha do catálogo)</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-4">
                    <Input placeholder="Nome do item" {...register(`lineItems.${index}.name`)} />
                    {errors.lineItems?.[index]?.name && (
                      <p className="text-xs text-danger-active dark:text-danger mt-1">
                        {errors.lineItems[index]?.name?.message}
                      </p>
                    )}
                  </div>
                  <div className="md:col-span-1">
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      placeholder="Qtd"
                      {...register(`lineItems.${index}.quantity`)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Preço unit."
                      {...register(`lineItems.${index}.unitPrice`)}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      placeholder="Desc %"
                      {...register(`lineItems.${index}.discountPercent`)}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <button
                      type="button"
                      onClick={() => fields.length > 1 && remove(index)}
                      disabled={fields.length <= 1}
                      className="h-9 w-9 flex items-center justify-center rounded-lg text-danger-active dark:text-danger hover:bg-danger/10 disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Remover item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-6 text-sm">
          <span className="text-ink-2">
            Subtotal: <strong className="text-ink">{money.format(subtotal)}</strong>
          </span>
          <span className="text-ink-2">
            Total estimado:{' '}
            <strong className="text-brand-active dark:text-brand-2">{money.format(total)}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="doc-notes">Notas internas</Label>
            <Textarea id="doc-notes" rows={3} {...register('notes')} className="resize-none" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-terms">Termos e condições</Label>
            <Textarea id="doc-terms" rows={3} {...register('terms')} className="resize-none" />
          </div>
        </div>

        {isEdit && (
          <div className="space-y-2">
            <Label htmlFor="doc-changeReason">
              Motivo da alteração (fica registrado no histórico de versões)
            </Label>
            <Input id="doc-changeReason" type="text" {...register('changeReason')} />
          </div>
        )}
      </form>
    </Dialog>
  );
}
