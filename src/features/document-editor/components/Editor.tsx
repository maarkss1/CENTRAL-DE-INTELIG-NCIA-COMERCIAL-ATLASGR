import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Save, Loader2, AlertTriangle, RotateCcw, Search } from 'lucide-react';

import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { useAuth } from '../../../contexts/AuthContext';
import { hasRequiredRole } from '../../../lib/auth/authorization';
import { toast } from '../../../lib/toast';
import {
  knowledgeApi,
  type KnowledgeDocumentSummary,
  type KnowledgeDocument,
} from '../../knowledge/knowledge.api';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Editor dos documentos da Base de Conhecimento.
 *
 * Salvar não é só um UPDATE: se o conteúdo mudou, o backend refatia e revetoriza o documento, senão
 * a busca continuaria devolvendo trechos de um texto que o usuário já corrigiu. Por isso a tela
 * avisa quantos trechos foram regerados.
 */
export function Editor() {
  const accent = useBrandAccent();
  const { currentUser } = useAuth();
  // PUT /api/knowledge/:id exige ADMIN/GESTOR/CLOSER/SDR no backend (mesmo writeRoles da Base de
  // Conhecimento, `Base.tsx`), mas esta tela-irmã (mesmo dado, mesma rota) nunca escondia o botão
  // "Salvar" nem os campos editáveis — um VISUALIZADOR editava livremente e só descobria a falta
  // de permissão com um 403 em inglês ao clicar em Salvar (achado do Piloto 023, mesmo bug já
  // corrigido em `Base.tsx` no Piloto 019, nunca replicado aqui apesar de ser a mesma regra).
  const canWrite =
    !!currentUser && hasRequiredRole(currentUser.role, ['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);

  const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [doc, setDoc] = useState<KnowledgeDocument | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const list = await knowledgeApi.list();
      setDocuments(list);
      setSelectedId((current) => current ?? list[0]?.id ?? null);
    } catch (err) {
      setListError((err as Error).message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDoc(null);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoadingDoc(true);
      try {
        // `knowledgeApi.get` (Piloto 019) em vez da chamada crua `api.get` de antes — mesmo
        // cliente já usado por `Base.tsx`, já testado, já tipado com `content`/`version`/
        // `sourceType`.
        const full = await knowledgeApi.get(selectedId);
        // Sem isto, trocar de documento rápido pode aplicar a resposta antiga por cima da nova.
        if (cancelled) return;
        setDoc(full);
        setTitle(full.title);
        setContent(full.content);
      } catch (err) {
        if (!cancelled) toast.error((err as Error).message);
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const dirty = doc != null && (title !== doc.title || content !== doc.content);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? documents.filter((d) => d.title.toLowerCase().includes(q)) : documents;
  }, [documents, filter]);

  const save = useCallback(async () => {
    if (!doc || !dirty || !canWrite) return;
    if (!title.trim() || !content.trim()) {
      toast.error('Título e conteúdo não podem ficar vazios.');
      return;
    }

    setSaving(true);
    try {
      const contentChanged = content !== doc.content;
      // `knowledgeApi.update` (Piloto 019) em vez da chamada crua `api.put` de antes.
      const result = await knowledgeApi.update(doc.id, { title: title.trim(), content });

      toast.success(
        contentChanged
          ? `Salvo e reindexado em ${result.chunkCount} trecho(s).`
          : 'Título atualizado.',
      );
      if (result.embeddingFailures > 0) {
        toast.error(`${result.embeddingFailures} trecho(s) ficaram sem busca semântica.`);
      }

      setDoc({
        ...doc,
        title: title.trim(),
        content,
        chunkCount: result.chunkCount,
        version: contentChanged ? doc.version + 1 : doc.version,
        updatedAt: new Date().toISOString(),
      });
      await loadList();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [doc, dirty, canWrite, title, content, loadList]);

  const revert = useCallback(() => {
    if (!doc) return;
    setTitle(doc.title);
    setContent(doc.content);
  }, [doc]);

  return (
    <div className="flex-1 overflow-hidden bg-transparent p-8 flex flex-col">
      <div className="max-w-6xl mx-auto w-full flex flex-col min-h-0 flex-1 gap-6">
        <div className="flex items-center justify-between gap-4 border-b border-line pb-6">
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${accent.bgSoft} ${accent.text}`}
            >
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-ink">Editor de Documentos</h1>
              <p className="text-sm text-ink-2">
                Edita os documentos da Base de Conhecimento e reindexa a busca
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canWrite && (
              <>
                {dirty && (
                  <Button type="button" variant="outline" onClick={revert} disabled={saving}>
                    <RotateCcw className="w-4 h-4 mr-2" /> Descartar
                  </Button>
                )}
                <Button type="button" onClick={() => void save()} disabled={!dirty || saving}>
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  {saving ? 'Salvando…' : 'Salvar'}
                </Button>
              </>
            )}
          </div>
        </div>

        {listError && (
          <Card padding="lg" className="text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-danger-active dark:text-danger" />
            <p className="text-sm text-ink-2 mb-4">{listError}</p>
            <Button type="button" variant="outline" onClick={() => void loadList()}>
              Tentar novamente
            </Button>
          </Card>
        )}

        {!listError && !loadingList && documents.length === 0 && (
          <Card padding="lg" className="text-center border-dashed">
            <FileText className="w-12 h-12 mx-auto mb-4 text-ink-2" />
            <h3 className="text-lg font-semibold text-ink mb-1">Nenhum documento para editar</h3>
            <p className="text-sm text-ink-2">
              Envie um arquivo ou cole um texto na Base de Conhecimento primeiro.
            </p>
          </Card>
        )}

        {!listError && documents.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 min-h-0 flex-1">
            {/* Lista */}
            <Card padding="sm" className="flex flex-col min-h-0">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-2" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filtrar…"
                  aria-label="Filtrar documentos"
                  className="w-full bg-surface-2 border border-line rounded-lg pl-8 pr-2 py-1.5 text-xs text-ink placeholder-ink-2 outline-none focus:border-brand"
                />
              </div>

              <div className="overflow-y-auto flex flex-col gap-1 min-h-0">
                {filtered.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    aria-current={selectedId === d.id}
                    className={`text-left px-2 py-1.5 rounded-lg transition-colors ${
                      selectedId === d.id
                        ? `${accent.bgSoft} ${accent.text}`
                        : 'text-ink-2 hover:bg-surface-2'
                    }`}
                  >
                    <span className="block text-xs font-semibold truncate">{d.title}</span>
                    <span className="block text-[10px] text-ink-2">{d.chunkCount} trecho(s)</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-xs text-ink-2 px-2 py-3">Nenhum documento com esse nome.</p>
                )}
              </div>
            </Card>

            {/* Edição */}
            <Card padding="sm" className="flex flex-col min-h-0">
              {loadingDoc && (
                <div className="flex-1 flex items-center justify-center text-sm text-ink-2">
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando documento…
                </div>
              )}

              {!loadingDoc && doc && (
                <>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    readOnly={!canWrite}
                    aria-label="Título do documento"
                    className="w-full bg-transparent text-lg font-bold text-ink outline-none border-b border-line focus:border-brand pb-2 mb-1 transition-colors read-only:cursor-default"
                  />
                  {/* sourceName/sourceType/version/updatedAt já vinham na resposta da API mas
                      nunca eram exibidos aqui — mesmo padrão de "vitrine de dado real
                      subaproveitado" já corrigido em `Base.tsx` (Pilotos 019/021), reincidente
                      nesta tela-irmã (achado do Piloto 023). */}
                  <p className="text-[11px] text-ink-2 mb-3">
                    {doc.sourceName
                      ? doc.sourceName
                      : doc.sourceType === 'text'
                        ? 'Texto colado'
                        : 'Origem desconhecida'}
                    {doc.version > 1 && ` · editado · v${doc.version}`}
                    {' · atualizado em '}
                    {formatDate(doc.updatedAt)}
                  </p>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    readOnly={!canWrite}
                    aria-label="Conteúdo do documento"
                    spellCheck
                    className="flex-1 w-full bg-surface-2 border border-line rounded-xl p-3 text-sm text-ink leading-relaxed outline-none focus:border-brand transition-colors resize-none min-h-[320px] read-only:cursor-default"
                  />
                  <div className="flex items-center justify-between mt-2 text-[11px] text-ink-2">
                    <span>
                      {content.length.toLocaleString('pt-BR')} caracteres · {doc.chunkCount}{' '}
                      trecho(s) indexado(s)
                    </span>
                    {dirty && (
                      <span className="text-warning-active dark:text-warning">
                        alterações não salvas
                      </span>
                    )}
                    {!canWrite && (
                      <span className="text-ink-2">Somente leitura — exige permissão de edição</span>
                    )}
                  </div>
                </>
              )}

              {!loadingDoc && !doc && (
                <div className="flex-1 flex items-center justify-center text-sm text-ink-2">
                  Selecione um documento à esquerda.
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
