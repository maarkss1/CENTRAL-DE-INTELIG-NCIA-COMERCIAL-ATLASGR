import { useEffect, useRef, useState } from 'react';
import {
    Camera, Loader2, Sparkles, UploadCloud, CheckCircle2, AlertCircle,
    Building2, Aperture, X, Phone, Mail, Globe, User, Briefcase,
    MapPin, Search, MessageSquare, ExternalLink, RefreshCw, Clipboard
} from 'lucide-react';
import { api } from '../../../../lib/api';
import { useBrand } from '../../../../contexts/BrandContext';
import type { ProspectCandidate } from '../../services/prospecting.service';

interface PromoteResult {
    lead: { id: string };
}

interface CnpjEnrichmentResponse {
    razao_social?: string;
    nome_fantasia?: string;
    cnae_fiscal_descricao?: string;
    municipio?: string;
    uf?: string;
    ddd_telefone_1?: string;
    email?: string;
    qsa?: Array<{ nome_socio: string; qualificacao_socio: string }>;
}

function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

export function OcrCapturePanel() {
    const { brandInfo } = useBrand();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [reading, setReading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [promoting, setPromoting] = useState(false);
    const [promoted, setPromoted] = useState<PromoteResult | null>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [rawExtractedText, setRawExtractedText] = useState<string | null>(null);
    const [enrichingCnpj, setEnrichingCnpj] = useState(false);

    // Campos editáveis do Lead / Candidato
    const [formData, setFormData] = useState<{
        tradeName: string;
        legalName: string;
        cnpj: string;
        segment: string;
        location: string;
        contactName: string;
        contactRole: string;
        phone: string;
        email: string;
        website: string;
        rationale: string;
        fitScoreEstimate: number;
    }>({
        tradeName: '',
        legalName: '',
        cnpj: '',
        segment: '',
        location: '',
        contactName: '',
        contactRole: '',
        phone: '',
        email: '',
        website: '',
        rationale: '',
        fitScoreEstimate: 60,
    });

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setCameraActive(false);
    };

    useEffect(() => () => stopCamera(), []);

    // Suporte a colar imagem da área de transferência (Ctrl+V)
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) {
                        handleFile(file);
                        break;
                    }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [brandInfo]);

    const startCamera = async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false,
            });
            streamRef.current = stream;
            setCameraActive(true);
            requestAnimationFrame(() => {
                if (videoRef.current) videoRef.current.srcObject = stream;
            });
        } catch {
            setError('Não foi possível acessar a câmera. Verifique a permissão do navegador ou envie uma foto pelo botão de upload.');
        }
    };

    const capturePhoto = () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
            if (!blob) return;
            stopCamera();
            handleFile(new File([blob], `captura-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.92);
    };

    const reset = () => {
        stopCamera();
        setPreviewUrl(null);
        setPromoted(null);
        setError(null);
        setRawExtractedText(null);
        setFormData({
            tradeName: '',
            legalName: '',
            cnpj: '',
            segment: '',
            location: '',
            contactName: '',
            contactRole: '',
            phone: '',
            email: '',
            website: '',
            rationale: '',
            fitScoreEstimate: 60,
        });
    };

    const handleFile = async (file: File) => {
        reset();
        setPreviewUrl(URL.createObjectURL(file));
        setReading(true);
        try {
            const form = new FormData();
            form.append('image', file);
            form.append('brandName', brandInfo.name);
            form.append('brandDescription', brandInfo.description);
            const response = await api.postForm<{ candidate: ProspectCandidate; rawText?: string }>('/api/prospecting/ocr', form, { timeoutMs: 120_000 });
            
            const cand = response.candidate;
            setRawExtractedText(response.rawText || null);
            setFormData({
                tradeName: cand.tradeName || '',
                legalName: cand.legalNameGuess || '',
                cnpj: cand.cnpjGuess || '',
                segment: cand.segment || '',
                location: cand.location || '',
                contactName: cand.suggestedContact?.name || '',
                contactRole: cand.suggestedContact?.role || '',
                phone: cand.phone || '',
                email: cand.emails?.[0] || '',
                website: cand.website || '',
                rationale: cand.rationale || 'Extraído via OCR inteligente + IA.',
                fitScoreEstimate: cand.fitScoreEstimate || 65,
            });
        } catch (e) {
            setError(getErrorMessage(e, 'Não foi possível ler essa imagem.'));
        } finally {
            setReading(false);
        }
    };

    const handleCnpjEnrich = async () => {
        const cleanCnpj = formData.cnpj.replace(/\D/g, '');
        if (cleanCnpj.length !== 14) {
            setError('Digite um CNPJ válido com 14 dígitos para consultar na Receita Federal.');
            return;
        }
        setEnrichingCnpj(true);
        setError(null);
        try {
            const res = await api.post<{ company: CnpjEnrichmentResponse }>('/api/prospecting/enrich-cnpj', { cnpj: cleanCnpj });
            const c = res.company;
            if (c) {
                setFormData(prev => ({
                    ...prev,
                    legalName: c.razao_social || prev.legalName,
                    tradeName: c.nome_fantasia || prev.tradeName || c.razao_social || '',
                    segment: c.cnae_fiscal_descricao || prev.segment,
                    location: (c.municipio && c.uf) ? `${c.municipio} - ${c.uf}` : prev.location,
                    phone: c.ddd_telefone_1 ? (c.ddd_telefone_1.includes('(') ? c.ddd_telefone_1 : `(${c.ddd_telefone_1.slice(0, 2)}) ${c.ddd_telefone_1.slice(2)}`) : prev.phone,
                    email: c.email || prev.email,
                    contactName: (c.qsa && c.qsa.length > 0) ? c.qsa[0].nome_socio : prev.contactName,
                    contactRole: (c.qsa && c.qsa.length > 0) ? c.qsa[0].qualificacao_socio : prev.contactRole,
                }));
            }
        } catch (e) {
            setError(getErrorMessage(e, 'Falha ao consultar CNPJ na Receita Federal.'));
        } finally {
            setEnrichingCnpj(false);
        }
    };

    const promote = async () => {
        if (!formData.tradeName.trim()) {
            setError('O nome da empresa é obrigatório.');
            return;
        }
        setPromoting(true);
        setError(null);
        try {
            const result = await api.post<PromoteResult>('/api/prospecting/promote', {
                tradeName: formData.tradeName,
                legalName: formData.legalName || null,
                cnpj: formData.cnpj || null,
                segment: formData.segment || 'Não informado',
                size: 'Não informado',
                location: formData.location || 'Não informado',
                source: `${brandInfo.name} Prospect (OCR Inteligente)`,
                autoEnrich: false,
                phone: formData.phone || null,
                website: formData.website || null,
                contact: formData.contactName ? {
                    name: formData.contactName,
                    role: formData.contactRole || 'Decisor',
                } : null,
            });
            setPromoted(result);
        } catch (e) {
            setError(getErrorMessage(e, 'Falha ao cadastrar no CRM.'));
        } finally {
            setPromoting(false);
        }
    };

    const hasExtractedData = Boolean(formData.tradeName);

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header com instruções e atalho Ctrl+V */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-surface border border-line">
                <div>
                    <h2 className="text-base font-bold text-ink flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-brand" /> OCR Inteligente de Cartões & Fachadas
                    </h2>
                    <p className="text-xs text-ink-2 mt-0.5">
                        Tire foto, faça upload ou pressione <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-line text-ink font-mono text-[10px]">Ctrl+V</kbd> para colar uma imagem.
                    </p>
                </div>
                {hasExtractedData && (
                    <button
                        onClick={reset}
                        type="button"
                        className="flex items-center gap-1.5 text-xs font-bold text-ink-2 hover:text-ink px-3 py-1.5 rounded-xl border border-line bg-surface-2/60 hover:bg-surface-2 transition-colors"
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> Nova Leitura
                    </button>
                )}
            </div>

            {/* Câmera Ativa */}
            {cameraActive && (
                <div className="rounded-2xl overflow-hidden border border-line bg-black relative shadow-xl">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-96 object-contain bg-black" />
                    <div className="absolute inset-x-0 bottom-0 p-4 flex items-center justify-center gap-3 bg-gradient-to-t from-black/80 to-transparent">
                        <button
                            type="button"
                            onClick={capturePhoto}
                            className="flex items-center gap-2 bg-brand text-white px-6 py-2.5 rounded-full font-bold text-sm shadow-lg hover:brightness-110 transition-all cursor-pointer"
                        >
                            <Aperture className="w-4 h-4" /> Capturar Foto
                        </button>
                        <button
                            type="button"
                            onClick={stopCamera}
                            className="flex items-center gap-1.5 bg-white/10 text-white px-4 py-2.5 rounded-full font-bold text-sm hover:bg-white/20 transition-colors cursor-pointer"
                        >
                            <X className="w-4 h-4" /> Fechar Câmera
                        </button>
                    </div>
                </div>
            )}

            {/* Área de Dropzone quando não há dados ou não está no split-view */}
            {!cameraActive && !hasExtractedData && (
                <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            fileInputRef.current?.click();
                        }
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) handleFile(file); }}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-line rounded-3xl p-12 text-center cursor-pointer hover:border-brand hover:bg-brand/5 transition-all bg-surface focus:outline-none focus:ring-2 focus:ring-brand shadow-sm"
                >
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ''; }} />
                    <div className="space-y-4 max-w-md mx-auto">
                        <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-brand via-orange-500 to-indigo-600 flex items-center justify-center text-white mx-auto shadow-lg">
                            <Camera className="w-8 h-8" />
                        </div>
                        <div>
                            <p className="font-bold text-ink text-base">Arraste uma foto de cartão, placa ou fachada</p>
                            <p className="text-xs text-ink-2 mt-1">Formatos suportados: JPEG, PNG ou WebP até 8MB</p>
                        </div>
                        <div className="flex items-center justify-center gap-3 pt-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-brand text-white px-4 py-2 rounded-xl shadow-sm hover:brightness-110 transition-all">
                                <UploadCloud className="w-4 h-4" /> Selecionar Arquivo
                            </span>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); startCamera(); }}
                                className="inline-flex items-center gap-1.5 text-xs font-bold bg-surface-2 text-ink border border-line px-4 py-2 rounded-xl hover:bg-surface-3 transition-colors cursor-pointer"
                            >
                                <Camera className="w-4 h-4 text-brand" /> Usar Câmera
                            </button>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 text-[11px] text-ink-2 pt-1">
                            <Clipboard className="w-3.5 h-3.5 text-brand" />
                            <span>Ou apenas pressione <strong>Ctrl+V</strong> para colar print/screenshot</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Indicador de Leitura / Processamento */}
            {reading && (
                <div className="flex flex-col items-center justify-center gap-3 p-8 rounded-2xl bg-surface border border-line text-center shadow-sm">
                    <Loader2 className="w-8 h-8 animate-spin text-brand" />
                    <div>
                        <p className="font-bold text-sm text-ink">Processando OCR e estruturando dados com IA...</p>
                        <p className="text-xs text-ink-2 mt-0.5">Normalizando iluminação, lendo texto e identificando contatos corporativos.</p>
                    </div>
                </div>
            )}

            {/* Mensagem de Erro */}
            {error && (
                <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200 shadow-sm">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    <span className="leading-relaxed">{error}</span>
                </div>
            )}

            {/* Visualização Split-View (Imagem Lado a Lado com Formulário Editável) */}
            {hasExtractedData && !promoted && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Coluna Esquerda: Preview da Imagem + Texto Bruto */}
                    <div className="lg:col-span-5 space-y-4">
                        <div className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
                            <div className="flex items-center justify-between pb-2 border-b border-line mb-2">
                                <span className="text-xs font-bold text-ink">Foto Original</span>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    type="button"
                                    className="text-[11px] font-bold text-brand hover:underline"
                                >
                                    Trocar Foto
                                </button>
                                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ''; }} />
                            </div>
                            {previewUrl && (
                                <img src={previewUrl} alt="Imagem original" className="w-full max-h-72 object-contain rounded-xl bg-black/5" />
                            )}
                        </div>

                        {rawExtractedText && (
                            <details className="rounded-xl border border-line bg-surface-2/40 p-3 text-xs">
                                <summary className="font-bold text-ink-2 cursor-pointer hover:text-ink">Ver Texto Cru Extraído pelo OCR</summary>
                                <pre className="mt-2 text-[10px] text-ink-2 whitespace-pre-wrap font-mono bg-surface p-2 rounded-lg border border-line max-h-36 overflow-y-auto">
                                    {rawExtractedText}
                                </pre>
                            </details>
                        )}
                    </div>

                    {/* Coluna Direita: Formulário de Validação & Edição */}
                    <div className="lg:col-span-7 bg-surface border border-line rounded-3xl p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-line">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-brand/10 text-brand">
                                    <Sparkles className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-ink">Dados Identificados pela IA</h3>
                                    <p className="text-[11px] text-ink-2">Revise ou edite os campos antes de cadastrar no CRM</p>
                                </div>
                            </div>
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-brand/10 text-brand border border-brand/20">
                                Score: {formData.fitScoreEstimate}%
                            </span>
                        </div>

                        <div className="space-y-3">
                            {/* Nome da Empresa */}
                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5 mb-1">
                                    <Building2 className="w-3.5 h-3.5 text-brand" /> Nome Fantasia / Razão Social *
                                </label>
                                <input
                                    type="text"
                                    value={formData.tradeName}
                                    onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
                                    className="w-full bg-surface-2 border border-line rounded-xl px-3.5 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                    placeholder="Ex: Total Trac Tecnologia"
                                />
                            </div>

                            {/* CNPJ com Consulta na Receita Federal */}
                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5 mb-1">
                                    <Search className="w-3.5 h-3.5 text-brand" /> CNPJ
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={formData.cnpj}
                                        onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                                        className="flex-1 bg-surface-2 border border-line rounded-xl px-3.5 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                        placeholder="00.000.000/0000-00"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleCnpjEnrich}
                                        disabled={enrichingCnpj || !formData.cnpj}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-surface-2 border border-line text-brand hover:bg-brand/10 hover:border-brand/40 transition-colors disabled:opacity-40 cursor-pointer"
                                        title="Consultar dados oficiais na Receita Federal via BrasilAPI"
                                    >
                                        {enrichingCnpj ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                                        {enrichingCnpj ? 'Buscando...' : 'Receita'}
                                    </button>
                                </div>
                            </div>

                            {/* Segmento e Localização */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5 mb-1">
                                        <Briefcase className="w-3.5 h-3.5 text-brand" /> Segmento
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.segment}
                                        onChange={(e) => setFormData({ ...formData, segment: e.target.value })}
                                        className="w-full bg-surface-2 border border-line rounded-xl px-3.5 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                                        placeholder="Ex: Transporte Rodoviário"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5 mb-1">
                                        <MapPin className="w-3.5 h-3.5 text-brand" /> Cidade / UF
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                        className="w-full bg-surface-2 border border-line rounded-xl px-3.5 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                                        placeholder="Ex: São Paulo - SP"
                                    />
                                </div>
                            </div>

                            {/* Decisor: Nome e Cargo */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5 mb-1">
                                        <User className="w-3.5 h-3.5 text-brand" /> Nome do Decisor
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.contactName}
                                        onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                                        className="w-full bg-surface-2 border border-line rounded-xl px-3.5 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                                        placeholder="Ex: Carlos Silva"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5 mb-1">
                                        <Briefcase className="w-3.5 h-3.5 text-brand" /> Cargo
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.contactRole}
                                        onChange={(e) => setFormData({ ...formData, contactRole: e.target.value })}
                                        className="w-full bg-surface-2 border border-line rounded-xl px-3.5 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                                        placeholder="Ex: Diretor de Operações"
                                    />
                                </div>
                            </div>

                            {/* Contatos: Telefone, E-mail, Site */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5 mb-1">
                                        <Phone className="w-3.5 h-3.5 text-brand" /> Telefone / WhatsApp
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="text"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            className="flex-1 bg-surface-2 border border-line rounded-xl px-3.5 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                                            placeholder="(11) 98765-4321"
                                        />
                                        {formData.phone && (
                                            <a
                                                href={`https://wa.me/55${formData.phone.replace(/\D/g, '')}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors shrink-0"
                                                title="Testar no WhatsApp Web"
                                            >
                                                <MessageSquare className="w-4 h-4" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5 mb-1">
                                        <Mail className="w-3.5 h-3.5 text-brand" /> E-mail
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full bg-surface-2 border border-line rounded-xl px-3.5 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                                        placeholder="contato@empresa.com.br"
                                    />
                                </div>
                            </div>

                            {/* Website */}
                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5 mb-1">
                                    <Globe className="w-3.5 h-3.5 text-brand" /> Website
                                </label>
                                <div className="flex items-center gap-1.5">
                                    <input
                                        type="text"
                                        value={formData.website}
                                        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                                        className="flex-1 bg-surface-2 border border-line rounded-xl px-3.5 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                                        placeholder="https://empresa.com.br"
                                    />
                                    {formData.website && (
                                        <a
                                            href={formData.website.startsWith('http') ? formData.website : `https://${formData.website}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="p-2 rounded-xl bg-surface-2 text-ink-2 hover:text-ink border border-line transition-colors shrink-0"
                                            title="Abrir site"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Botão de Ação Principal */}
                        <div className="pt-2">
                            <button
                                onClick={promote}
                                disabled={promoting || !formData.tradeName.trim()}
                                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand to-orange-500 text-white py-3 rounded-2xl font-bold text-sm shadow-md hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer"
                            >
                                {promoting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                {promoting ? 'Cadastrando no CRM...' : 'Cadastrar no CRM & Bitrix24'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sucesso no Cadastro */}
            {promoted && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-3xl p-8 text-center space-y-3 shadow-sm">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-black text-base text-ink">Lead Cadastrado com Sucesso!</h3>
                        <p className="text-xs text-ink-2 mt-1">A empresa foi inserida no Pipeline CRM e sincronizada com o Bitrix24.</p>
                    </div>
                    <div className="pt-2">
                        <button
                            onClick={reset}
                            className="inline-flex items-center gap-2 bg-brand text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-md hover:brightness-110 transition-all cursor-pointer"
                        >
                            <Camera className="w-3.5 h-3.5" /> Ler Novo Cartão / Foto
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
