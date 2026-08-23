import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { Label } from '../../../components/ui/Label';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { objectionMatrixItemSchema, type ObjectionMatrixItemInput } from '../playbook.schema';
import { playbookApi, type ObjectionMatrixItem } from '../playbook.api';
import { clientLogger } from '../../../lib/clientLogger';
import { toast } from '../../../lib/toast';

const emptyDefaults: ObjectionMatrixItemInput = {
    brand: 'atlasgr',
    segment: '',
    persona: '',
    objectionTitle: '',
    objectionText: '',
    responseScript: '',
    keyDifferentiator: '',
};

interface ObjectionItemFormProps {
    item?: ObjectionMatrixItem | null;
    defaultBrand: 'atlasgr' | 'totaltrac';
    onClose: () => void;
    onSave: () => void;
}

export function ObjectionItemForm({ item, defaultBrand, onClose, onSave }: ObjectionItemFormProps) {
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<ObjectionMatrixItemInput>({
        resolver: zodResolver(objectionMatrixItemSchema),
        defaultValues: { ...emptyDefaults, brand: defaultBrand },
    });

    useEffect(() => {
        reset(item ? {
            brand: item.brand,
            segment: item.segment,
            persona: item.persona,
            objectionTitle: item.objectionTitle,
            objectionText: item.objectionText,
            responseScript: item.responseScript,
            keyDifferentiator: item.keyDifferentiator,
        } : { ...emptyDefaults, brand: defaultBrand });
    }, [item, defaultBrand, reset]);

    const onSubmit = async (data: ObjectionMatrixItemInput) => {
        try {
            if (item) {
                await playbookApi.updateObjection(item.id, data);
                toast.success('Objeção atualizada.');
            } else {
                await playbookApi.createObjection(data);
                toast.success('Objeção criada.');
            }
            onSave();
        } catch (error) {
            clientLogger.error({ err: error }, 'Error saving objection matrix item');
            toast.error(error instanceof Error ? error.message : 'Falha ao salvar a objeção.');
        }
    };

    return (
        <Dialog
            isOpen
            onClose={onClose}
            title={item ? 'Editar Objeção' : 'Nova Objeção'}
            maxWidth="max-w-2xl"
            preventClose={isSubmitting}
            footer={
                <>
                    <Button type="button" variant="ghost" onClick={onClose} className="text-ink-2">Cancelar</Button>
                    <Button type="submit" form="objection-item-form" disabled={isSubmitting}>
                        {isSubmitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />}
                        {item ? 'Salvar Alterações' : 'Criar Objeção'}
                    </Button>
                </>
            }
        >
            <form id="objection-item-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="oi-brand">Marca *</Label>
                        <Select id="oi-brand" {...register('brand')}>
                            <option value="atlasgr">AtlasGR</option>
                            <option value="totaltrac">Total Trac</option>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="oi-title">Título da objeção *</Label>
                        <Input id="oi-title" type="text" {...register('objectionTitle')} />
                        {errors.objectionTitle && <p className="text-xs text-danger mt-1">{errors.objectionTitle.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="oi-segment">Segmento *</Label>
                        <Input id="oi-segment" type="text" {...register('segment')} />
                        {errors.segment && <p className="text-xs text-danger mt-1">{errors.segment.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="oi-persona">Persona *</Label>
                        <Input id="oi-persona" type="text" {...register('persona')} />
                        {errors.persona && <p className="text-xs text-danger mt-1">{errors.persona.message}</p>}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="oi-objection">Objeção (fala do cliente) *</Label>
                        <Textarea id="oi-objection" rows={3} {...register('objectionText')} className="resize-none" />
                        {errors.objectionText && <p className="text-xs text-danger mt-1">{errors.objectionText.message}</p>}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="oi-script">Script de contorno recomendado *</Label>
                        <Textarea id="oi-script" rows={3} {...register('responseScript')} className="resize-none" />
                        {errors.responseScript && <p className="text-xs text-danger mt-1">{errors.responseScript.message}</p>}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="oi-diff">Diferencial-chave *</Label>
                        <Textarea id="oi-diff" rows={2} {...register('keyDifferentiator')} className="resize-none" />
                        {errors.keyDifferentiator && <p className="text-xs text-danger mt-1">{errors.keyDifferentiator.message}</p>}
                    </div>
                </div>
            </form>
        </Dialog>
    );
}
