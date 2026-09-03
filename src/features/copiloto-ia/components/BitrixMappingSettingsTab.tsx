import { useEffect, useState, type FormEvent } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { toast } from '../../../lib/toast';
import {
  copilotoIaApi,
  type CopilotoBitrixFieldMappingDTO,
  type CopilotoCrmEntityType,
} from '../copilotoIa.api';

const ENTITY_TYPES: CopilotoCrmEntityType[] = ['LEAD', 'COMPANY', 'CONTACT'];

/**
 * Onda 4: o writeback no Bitrix24 só grava um campo quando existe uma linha aqui mapeando
 * (entityType, semanticField) -> um `UF_CRM_*` real do portal desta organização. Sem mapeamento,
 * o writeback falha explicitamente (ver `ConversationDetailDrawer`, badge `FAILED` +
 * `writebackError`) — nunca grava no campo errado.
 */
export function BitrixMappingSettingsTab() {
  const [mappings, setMappings] = useState<CopilotoBitrixFieldMappingDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState<CopilotoCrmEntityType>('LEAD');
  const [semanticField, setSemanticField] = useState('');
  const [bitrixFieldCode, setBitrixFieldCode] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    copilotoIaApi
      .listBitrixFieldMappings()
      .then(setMappings)
      .catch(() => toast.error('Não foi possível carregar os mapeamentos.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!semanticField.trim() || !bitrixFieldCode.trim()) return;
    setSaving(true);
    try {
      await copilotoIaApi.upsertBitrixFieldMapping({
        entityType,
        semanticField: semanticField.trim(),
        bitrixFieldCode: bitrixFieldCode.trim(),
      });
      setSemanticField('');
      setBitrixFieldCode('');
      toast.success('Mapeamento salvo.');
      load();
    } catch {
      toast.error('Não foi possível salvar o mapeamento.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await copilotoIaApi.deleteBitrixFieldMapping(id);
      toast.success('Mapeamento removido.');
      load();
    } catch {
      toast.error('Não foi possível remover o mapeamento.');
    }
  };

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <h3 className="text-sm font-bold text-ink mb-1">Novo mapeamento</h3>
        <p className="text-xs text-ink-2 mb-4">
          Associa um campo semântico do Copiloto (ex.: <code>orcamento_confirmado</code>) a um
          código real de campo customizado do Bitrix24 (<code>UF_CRM_...</code>) desta organização.
        </p>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="mapping-entity-type" className="block text-xs text-ink-2 mb-1">
              Entidade
            </label>
            <select
              id="mapping-entity-type"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as CopilotoCrmEntityType)}
              className="rounded-xl border border-line bg-surface-2/75 px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mapping-semantic-field" className="block text-xs text-ink-2 mb-1">
              Campo semântico
            </label>
            <input
              id="mapping-semantic-field"
              value={semanticField}
              onChange={(e) => setSemanticField(e.target.value)}
              placeholder="ex.: orcamento_confirmado"
              className="rounded-xl border border-line bg-surface-2/75 px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="mapping-bitrix-code" className="block text-xs text-ink-2 mb-1">
              Código no Bitrix24
            </label>
            <input
              id="mapping-bitrix-code"
              value={bitrixFieldCode}
              onChange={(e) => setBitrixFieldCode(e.target.value)}
              placeholder="ex.: UF_CRM_1234567890"
              className="rounded-xl border border-line bg-surface-2/75 px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </div>
          <Button type="submit" disabled={saving}>
            <Plus className="w-4 h-4 mr-1.5" /> Salvar
          </Button>
        </form>
      </Card>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : mappings.length === 0 ? (
        <EmptyState
          title="Nenhum mapeamento configurado"
          description="Sem mapeamento, o writeback de sugestões de campo no Bitrix24 falha explicitamente em vez de gravar no campo errado."
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 text-xs uppercase tracking-wide text-ink-2">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Entidade</th>
                <th className="px-4 py-2.5 text-left font-semibold">Campo semântico</th>
                <th className="px-4 py-2.5 text-left font-semibold">Código Bitrix24</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {mappings.map((mapping) => (
                <tr key={mapping.id}>
                  <td className="px-4 py-2.5 text-ink-2">{mapping.entityType}</td>
                  <td className="px-4 py-2.5 text-ink font-mono text-xs">
                    {mapping.semanticField}
                  </td>
                  <td className="px-4 py-2.5 text-ink font-mono text-xs">
                    {mapping.bitrixFieldCode}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover mapeamento ${mapping.semanticField}`}
                      onClick={() => handleDelete(mapping.id)}
                    >
                      <Trash2 className="w-4 h-4 text-danger" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
