import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Database, Search, Upload, FileText, Trash2, Loader2, X,
    AlertTriangle, Sparkles, Type, RefreshCw,
} from 'lucide-react';

import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { toast } from '../../../lib/toast';
import {
    knowledgeApi, fileToBase64, ACCEPTED_EXTENSIONS,
    type KnowledgeDocumentSummary, type KnowledgeSearchResponse,
} from '../knowledge.api';

/** Realça no trecho os termos que o usuário digitou, para ele achar o ponto sem reler tudo. */
function Highlighted({ text, query }: { text: string; query: string }) {
    const terms = useMemo(
        () => query.split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '')).filter((t) => t.length > 2),
        [query],
    );

    if (terms.length === 0) return <>{text}</>;

    const parts = text.split(new RegExp(`(${terms.join('|')})`, 'gi'));
    const lowered = terms.map((t) => t.toLowerCase());

    return (
        <>
            {parts.map((part, i) =>
                lowered.includes(part.toLowerCase())
                    ? <mark key={i} className="bg-amber-400/25 text-amber-100 rounded px-0.5">{part}</mark>
                    : <span key={i}>{part}</span>,
            )}
        </>
    );
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function Base() {
    const accent = useBrandAccent();

    const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>([]);
    const [loadingDocs, setLoadingDocs] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<KnowledgeSearchResponse | null>(null);

    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [pasteOpen, setPasteOpen] = useState(false);
    const [pasteTitle, setPasteTitle] = useState('');
    const [pasteContent, setPasteContent] = useState('');
    const [busyDocId, setBusyDocId] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadDocuments = useCallback(async () => {
        setLoadingDocs(true);
        setLoadError(null);
        try {
            setDocuments(await knowledgeApi.list());
        } catch (err) {
            setLoadError((err as Error).message);
        } finally {
            setLoadingDocs(false);
        }
    }, []);

    useEffect(() => { void loadDocuments(); }, [loadDocuments]);

    /** Avisa quando parte dos trechos ficou sem vetor — o usuário precisa saber que a busca está parcial. */
    const reportIngestion = useCallback((title: string, chunkCount: number, embeddingFailures: number) => {
        if (embeddingFailures > 0) {
            toast.error(
                `"${title}" foi salvo, mas ${embeddingFailures} de ${chunkCount} trechos ficaram sem busca semântica. Use "Revetorizar".`,
            );
        } else {
            toast.success(`"${title}" indexado em ${chunkCount} trecho${chunkCount === 1 ? '' : 's'}.`);
        }
    }, []);

    const ingestFiles = useCallback(async (files: File[]) => {
        const accepted = files.filter((f) =>
            ACCEPTED_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)),
        );
        const rejected = files.filter((f) => !accepted.includes(f));

        if (rejected.length > 0) {
            toast.error(`Formato não suportado: ${rejected.map((f) => f.name).join(', ')}`);
        }
        if (accepted.length === 0) return;

        setUploading(true);
        try {
            // Sequencial de propósito: cada arquivo dispara N chamadas de embedding, e mandar
            // vários em paralelo estoura o rate limit de IA do servidor.
            for (const file of accepted) {
                try {
                    const base64 = await fileToBase64(file);
                    const result = await knowledgeApi.upload(file.name, base64);
                    reportIngestion(result.title, result.chunkCount, result.embeddingFailures);
                } catch (err) {
                    toast.error(`${file.name}: ${(err as Error).message}`);
                }
            }
            await loadDocuments();
        } finally {
            setUploading(false);
        }
    }, [loadDocuments, reportIngestion]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        void ingestFiles(Array.from(e.dataTransfer.files));
    }, [ingestFiles]);

    const handleSearch = useCallback(async (e?: React.FormEvent) => {
        e?.preventDefault();
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            toast.info('Digite pelo menos 2 caracteres para buscar.');
            return;
        }

        setSearching(true);
        try {
            const response = await knowledgeApi.search(trimmed);
            setResults(response);
            if (!response.semanticAvailable) {
                toast.info('Busca semântica indisponível agora — exibindo resultados por palavra-chave.');
            }
        } catch (err) {
            toast.error((err as Error).message);
            setResults(null);
        } finally {
            setSearching(false);
        }
    }, [query]);

    const handlePasteSubmit = useCallback(async () => {
        if (!pasteTitle.trim() || !pasteContent.trim()) {
            toast.error('Preencha o título e o conteúdo.');
            return;
        }
        setUploading(true);
        try {
            const result = await knowledgeApi.ingestText(pasteTitle.trim(), pasteContent.trim());
            reportIngestion(result.title, result.chunkCount, result.embeddingFailures);
            setPasteOpen(false);
            setPasteTitle('');
            setPasteContent('');
            await loadDocuments();
        } catch (err) {
            toast.error((err as Error).message);
        } finally {
            setUploading(false);
        }
    }, [pasteTitle, pasteContent, loadDocuments, reportIngestion]);

    const handleDelete = useCallback(async (doc: KnowledgeDocumentSummary) => {
        if (!window.confirm(`Remover "${doc.title}" da base? Esta ação não pode ser desfeita.`)) return;
        setBusyDocId(doc.id);
        try {
            await knowledgeApi.remove(doc.id);
            toast.success('Documento removido.');
            // Limpa resultados que apontavam para o documento apagado.
            setResults((prev) => prev && { ...prev, hits: prev.hits.filter((h) => h.documentId !== doc.id) });
            await loadDocuments();
        } catch (err) {
            toast.error((err as Error).message);
        } finally {
            setBusyDocId(null);
        }
    }, [loadDocuments]);

    const handleReembed = useCallback(async (doc: KnowledgeDocumentSummary) => {
        setBusyDocId(doc.id);
        try {
            const { repaired, remaining } = await knowledgeApi.reembed(doc.id);
            if (repaired === 0 && remaining === 0) {
                toast.info('Todos os trechos deste documento já estavam vetorizados.');
            } else {
                toast.success(`${repaired} trecho(s) revetorizado(s).${remaining > 0 ? ` ${remaining} ainda falharam.` : ''}`);
            }
        } catch (err) {
            toast.error((err as Error).message);
        } finally {
            setBusyDocId(null);
        }
    }, []);

    const totalChunks = useMemo(
        () => documents.reduce((sum, d) => sum + d.chunkCount, 0),
        [documents],
    );

    return (
        <div
            className="flex-1 overflow-y-auto bg-slate-950 p-8"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
        >
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Cabeçalho */}
                <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-6">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${accent.bgSoft} ${accent.text}`}>
                            <Database className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white">Base de Conhecimento</h1>
                            <p className="text-sm text-gray-400">
                                {loadingDocs
                                    ? 'Carregando…'
                                    : `${documents.length} documento${documents.length === 1 ? '' : 's'} · ${totalChunks} trecho${totalChunks === 1 ? '' : 's'} indexado${totalChunks === 1 ? '' : 's'}`}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setPasteOpen(true)} disabled={uploading}>
                            <Type className="w-4 h-4 mr-2" /> Colar texto
                        </Button>
                        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                            {uploading
                                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                : <Upload className="w-4 h-4 mr-2" />}
                            {uploading ? 'Indexando…' : 'Enviar arquivo'}
                        </Button>
                    </div>
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_EXTENSIONS.join(',')}
                    className="hidden"
                    onChange={(e) => {
                        void ingestFiles(Array.from(e.target.files ?? []));
                        // Zera para permitir reenviar o mesmo arquivo depois de um erro.
                        e.target.value = '';
                    }}
                />

                {/* Busca */}
                <form onSubmit={handleSearch}>
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Pergunte em linguagem natural: como reduzir sinistro de carga?"
                            className="w-full bg-slate-900/60 border border-white/10 rounded-2xl pl-12 pr-32 py-4 text-sm text-white placeholder-gray-500 outline-none transition-all focus:border-atlas-orange"
                        />
                        <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2" disabled={searching}>
                            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
                        </Button>
                    </div>
                </form>

                {/* Resultados */}
                {results && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-gray-300">
                                {results.hits.length === 0
                                    ? 'Nenhum trecho encontrado'
                                    : `${results.hits.length} trecho${results.hits.length === 1 ? '' : 's'} relevante${results.hits.length === 1 ? '' : 's'}`}
                            </h2>
                            <button
                                onClick={() => { setResults(null); setQuery(''); }}
                                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                            >
                                Limpar busca
                            </button>
                        </div>

                        {!results.semanticAvailable && (
                            <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                Busca semântica fora do ar — estes resultados vieram só de palavra-chave.
                            </div>
                        )}

                        {results.hits.map((hit) => (
                            <Card key={hit.chunkId} padding="sm" className="hover:border-white/20 transition-colors">
                                <div className="flex items-start justify-between gap-4 mb-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileText className={`w-4 h-4 shrink-0 ${accent.text}`} />
                                        <span className="text-sm font-semibold text-white truncate">{hit.documentTitle}</span>
                                        <span className="text-[11px] text-gray-500 shrink-0">trecho #{hit.chunkIndex + 1}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {hit.matchedBy.includes('semantic') && (
                                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 flex items-center gap-1">
                                                <Sparkles className="w-3 h-3" /> semântico
                                            </span>
                                        )}
                                        {hit.matchedBy.includes('keyword') && (
                                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300">
                                                termo
                                            </span>
                                        )}
                                        {hit.similarity != null && (
                                            <span className="text-[10px] font-mono text-gray-500">
                                                {(hit.similarity * 100).toFixed(0)}%
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                                    <Highlighted text={hit.content} query={results.query} />
                                </p>
                            </Card>
                        ))}

                        {results.hits.length === 0 && (
                            <Card padding="lg" className="text-center">
                                <Search className="w-10 h-10 mx-auto mb-3 text-gray-600" />
                                <p className="text-sm text-gray-400">
                                    Nada encontrado para “{results.query}”. Tente outras palavras ou envie mais documentos.
                                </p>
                            </Card>
                        )}
                    </div>
                )}

                {/* Documentos */}
                <div className="space-y-3">
                    <h2 className="text-sm font-semibold text-gray-300">Documentos</h2>

                    {loadingDocs && (
                        <Card padding="lg" className="text-center text-gray-400 text-sm">
                            <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> Carregando documentos…
                        </Card>
                    )}

                    {loadError && !loadingDocs && (
                        <Card padding="lg" className="text-center">
                            <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-400" />
                            <p className="text-sm text-gray-300 mb-4">{loadError}</p>
                            <Button variant="outline" onClick={() => void loadDocuments()}>Tentar novamente</Button>
                        </Card>
                    )}

                    {!loadingDocs && !loadError && documents.length === 0 && (
                        <Card padding="lg" className="text-center border-dashed">
                            <Database className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                            <h3 className="text-lg font-semibold text-white mb-1">Nenhum documento ainda</h3>
                            <p className="text-sm text-gray-400 mb-5 max-w-md mx-auto">
                                Envie propostas, playbooks, tabelas de preço ou apresentações. O conteúdo vira
                                busca semântica para toda a equipe comercial.
                            </p>
                            <div className="flex items-center justify-center gap-2">
                                <Button onClick={() => fileInputRef.current?.click()}>
                                    <Upload className="w-4 h-4 mr-2" /> Enviar arquivo
                                </Button>
                                <Button variant="outline" onClick={() => setPasteOpen(true)}>
                                    <Type className="w-4 h-4 mr-2" /> Colar texto
                                </Button>
                            </div>
                            <p className="text-[11px] text-gray-600 mt-4">
                                Aceita {ACCEPTED_EXTENSIONS.join(', ')} — ou arraste os arquivos para esta tela.
                            </p>
                        </Card>
                    )}

                    {documents.map((doc) => (
                        <Card key={doc.id} padding="sm" className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <FileText className="w-5 h-5 text-gray-500 shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-white truncate">{doc.title}</p>
                                    <p className="text-xs text-gray-500">
                                        {doc.chunkCount} trecho{doc.chunkCount === 1 ? '' : 's'} · {formatDate(doc.createdAt)}
                                        {doc.sourceName && ` · ${doc.sourceName}`}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    onClick={() => void handleReembed(doc)}
                                    disabled={busyDocId === doc.id}
                                    title="Regerar embeddings que falharam"
                                    className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
                                >
                                    {busyDocId === doc.id
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <RefreshCw className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => void handleDelete(doc)}
                                    disabled={busyDocId === doc.id}
                                    title="Remover documento"
                                    className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Overlay de arrastar-e-soltar */}
            {dragging && (
                <div className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm border-4 border-dashed ${accent.border} pointer-events-none`}>
                    <div className="text-center">
                        <Upload className={`w-16 h-16 mx-auto mb-4 ${accent.text}`} />
                        <p className="text-xl font-bold text-white">Solte para indexar</p>
                        <p className="text-sm text-gray-400 mt-1">{ACCEPTED_EXTENSIONS.join(', ')}</p>
                    </div>
                </div>
            )}

            {/* Modal de texto colado */}
            {pasteOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-6">
                    <Card className="w-full max-w-2xl" accentBar>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white">Adicionar texto à base</h2>
                            <button
                                onClick={() => setPasteOpen(false)}
                                className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <input
                                value={pasteTitle}
                                onChange={(e) => setPasteTitle(e.target.value)}
                                placeholder="Título — ex: Playbook de objeções 2026"
                                className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 outline-none focus:border-atlas-orange transition-colors"
                            />
                            <textarea
                                value={pasteContent}
                                onChange={(e) => setPasteContent(e.target.value)}
                                rows={12}
                                placeholder="Cole aqui o conteúdo que a equipe precisa consultar…"
                                className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 outline-none focus:border-atlas-orange transition-colors resize-none"
                            />
                            <p className="text-xs text-gray-500">
                                {pasteContent.length.toLocaleString('pt-BR')} caracteres
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-white/10">
                            <Button variant="outline" onClick={() => setPasteOpen(false)} disabled={uploading}>
                                Cancelar
                            </Button>
                            <Button onClick={() => void handlePasteSubmit()} disabled={uploading}>
                                {uploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                {uploading ? 'Indexando…' : 'Indexar'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
