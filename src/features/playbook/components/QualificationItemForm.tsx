import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { Label } from '../../../components/ui/Label';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import {
  qualificationMatrixItemSchema,
  type QualificationMatrixItemInput,
} from '../playbook.schema';
import { playbookApi, type QualificationMatrixItem } from '../playbook.api';
import { clientLogger } from '../../../lib/clientLogger';
import { toast } from '../../../lib/toast';

const FRAMEWORKS = ['SPIN', 'BANT', 'MEDDPICC', 'SNAP', 'CHALLENGER'] as const;
const CATEGORIES = ['Situação', 'Problema', 'Implicação/Custo', 'Necessidade/ROI'] as const;

const emptyDefaults: QualificationMatrixItemInput = {
  brand: 'atlasgr',
  segment: '',
  persona: '',
  framework: 'SPIN',
  questionCategory: 'Situação',
  questionText: '',
  idealAnswer: '',
};

interface QualificationItemFormProps {
  item?: QualificationMatrixItem | null;
  defaultBrand: 'atlasgr' | 'totaltrac';
  onClose: () => void;
  onSave: () => void;
}

export function QualificationItemForm({
  item,
  defaultBrand,
  onClose,
  onSave,
}: QualificationItemFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QualificationMatrixItemInput>({
    resolver: zodResolver(qualificationMatrixItemSchema),
    defaultValues: { ...emptyDefaults, brand: defaultBrand },
  });

  useEffect(() => {
    reset(
      item
        ? {
            brand: item.brand,
            segment: item.segment,
            persona: item.persona,
            framework: item.framework,
            questionCategory: item.questionCategory,
            questionText: item.questionText,
            idealAnswer: item.idealAnswer,
          }
        : { ...emptyDefaults, brand: defaultBrand },
    );
  }, [item, defaultBrand, reset]);

  const onSubmit = async (data: QualificationMatrixItemInput) => {
    try {
      if (item) {
        await playbookApi.updateQualification(item.id, data);
        toast.success('Pergunta atualizada.');
      } else {
        await playbookApi.createQualification(data);
        toast.success('Pergunta criada.');
      }
      onSave();
    } catch (error) {
      clientLogger.error({ err: error }, 'Error saving qualification matrix item');
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar a pergunta.');
    }
  };

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={item ? 'Editar Pergunta de Qualificação' : 'Nova Pergunta de Qualificação'}
      maxWidth="max-w-2xl"
      preventClose={isSubmitting}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} className="text-ink-2">
            Cancelar
          </Button>
          <Button type="submit" form="qualification-item-form" disabled={isSubmitting}>
            {isSubmitting && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
            )}
            {item ? 'Salvar Alterações' : 'Criar Pergunta'}
          </Button>
        </>
      }
    >
      <form id="qualification-item-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="qi-brand">Marca *</Label>
            <Select id="qi-brand" {...register('brand')}>
              <option value="atlasgr">AtlasGR</option>
              <option value="totaltrac">Total Trac</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="qi-framework">Framework *</Label>
            <Select id="qi-framework" {...register('framework')}>
              {FRAMEWORKS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="qi-segment">Segmento *</Label>
            <Input id="qi-segment" type="text" {...register('segment')} />
            {errors.segment && (
              <p className="text-xs text-danger-active dark:text-danger mt-1">
                {errors.segment.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="qi-persona">Persona *</Label>
            <Input id="qi-persona" type="text" {...register('persona')} />
            {errors.persona && (
              <p className="text-xs text-danger-active dark:text-danger mt-1">
                {errors.persona.message}
              </p>
            )}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="qi-category">Categoria da pergunta *</Label>
            <Select id="qi-category" {...register('questionCategory')}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="qi-question">Pergunta de diagnóstico *</Label>
            <Textarea
              id="qi-question"
              rows={3}
              {...register('questionText')}
              className="resize-none"
            />
            {errors.questionText && (
              <p className="text-xs text-danger-active dark:text-danger mt-1">
                {errors.questionText.message}
              </p>
            )}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="qi-answer">Resposta ideal / sinal de fit *</Label>
            <Textarea
              id="qi-answer"
              rows={3}
              {...register('idealAnswer')}
              className="resize-none"
            />
            {errors.idealAnswer && (
              <p className="text-xs text-danger-active dark:text-danger mt-1">
                {errors.idealAnswer.message}
              </p>
            )}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
