import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Sparkles, UploadCloud, CheckCircle2, AlertCircle, Building2, Aperture, X } from 'lucide-react';
import { api } from '../../../../lib/api';
import { useBrand } from '../../../../contexts/BrandContext';
import type { ProspectCandidate } from '../../services/prospecting.service';

interface PromoteResult {
    lead: { id: string };
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
    const [candidate, setCandidate] = useState<ProspectCandidate | null>(null);
    const [promoting, setPromoting] = useState(false);
    const [promoted, setPromoted] = useState<PromoteResult | null>(null);
    const [cameraActive, setCameraActive] = useState(false);

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setCameraActive(false);
    };

    // Garante que a câmera do usuário nunca fica ligada em segundo plano se ele trocar de tela
    // sem clicar em "Fechar câmera" — vazamento de permissão de câmera é um problema sério, não
    // só de performance.
    useEffect(() => () => stopCamera(), []);

    const startCamera = async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false,
            });
            streamRef.current = stream;
            setCameraActive(true);
            // O elemento <video> só existe depois do próximo render (cameraActive vira true agora).
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
        setCandidate(null);
        setPromoted(null);
        setError(null);
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
            const response = await api.postForm<{ candidate: ProspectCandidate }>('/api/prospecting/ocr', form, { timeoutMs: 120_000 });
            setCandidate(response.candidate);
        } catch (e) {
            setError(getErrorMessage(e, 'Não foi possível ler essa imagem.'));
        } finally {
            setReading(false);
        }
    };

    const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = '';
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    };

    const promote = async () => {
        if (!candidate) return;
        setPromoting(true);
        setError(null);
        try {
            const result = await api.post<PromoteResult>('/api/prospecting/promote', {
                tradeName: candidate.tradeName,
                legalName: candidate.legalNameGuess,
                cnpj: candidate.cnpjGuess,
                segment: candidate.segment,
                size: candidate.size,
                location: candidate.location,
                source: `${brandInfo.name} Prospect (OCR de imagem)`,
                autoEnrich: false,
                phone: candidate.phone,
                website: candidate.website,
                contact: candidate.suggestedContact,
            });
            setPromoted(result);
        } catch (e) {
            setError(getErrorMessage(e, 'Falha ao cadastrar no CRM.'));
        } finally {
            setPromoting(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-5">
            {cameraActive ? (
                <div className="rounded-2xl overflow-hidden border border-line bg-black relative">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-96 object-contain bg-black" />
                    <div className="absolute inset-x-0 bottom-0 p-4 flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent">
                        <button
                            onClick={capturePhoto}
                            className="flex items-center gap-2 bg-atlas-orange text-white px-5 py-2.5 rounded-full font-bold text-sm shadow-lg hover:bg-orange-600 transition-colors"
                        >
                            <Aperture className="w-4 h-4" /> Capturar Foto
                        </button>
                        <button
                            onClick={stopCamera}
                            className="flex items-center gap-1.5 bg-white/10 text-white px-4 py-2.5 rounded-full font-bold text-sm hover:bg-white/20 transition-colors"
                        >
                            <X className="w-4 h-4" /> Fechar câmera
                        </button>
                    </div>
                </div>
            ) : (
                <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-line rounded-2xl p-10 text-center cursor-pointer hover:border-atlas-orange hover:bg-surface-2/50 transition-all bg-surface"
                >
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={onFileInputChange} />
                    {previewUrl ? (
                        <img src={previewUrl} alt="Pré-visualização" className="max-h-64 mx-auto rounded-xl object-contain" />
                    ) : (
                        <div className="space-y-3">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-atlas-orange flex items-center justify-center text-white mx-auto shadow-lg">
                                <Camera className="w-7 h-7" />
                            </div>
                            <div>
                                <p className="font-bold text-ink text-sm">Cartão de visita, fachada ou lista impressa</p>
                                <p className="text-xs text-ink-2 mt-1">Arraste uma foto aqui ou clique para escolher (JPEG, PNG ou WebP, até 8MB)</p>
                            </div>
                            <div className="flex items-center justify-center gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-atlas-orange">
                                    <UploadCloud className="w-4 h-4" /> Selecionar imagem
                                </span>
                                <span className="text-[11px] text-ink-2">ou</span>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); startCamera(); }}
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300"
                                >
                                    <Camera className="w-4 h-4" /> Usar câmera agora
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {reading && (
                <div className="flex items-center justify-center gap-2 text-sm text-ink-2 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" /> Lendo texto da imagem e identificando a empresa...
                </div>
            )}

            {error && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {candidate && !promoted && (
                <div className="bg-surface border border-line rounded-2xl p-5 space-y-3 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-300 uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5" /> Extraído da imagem — confira antes de cadastrar
                    </div>
                    <div className="flex items-start gap-3">
                        <Building2 className="w-5 h-5 text-ink-2 mt-0.5 shrink-0" />
                        <div className="space-y-1 text-sm">
                            <p className="font-bold text-ink">{candidate.tradeName}</p>
                            <p className="text-ink-2 text-xs">{candidate.segment} {candidate.location && candidate.location !== 'Não informado' ? `· ${candidate.location}` : ''}</p>
                            {candidate.suggestedContact && (
                                <p className="text-ink-2 text-xs">👤 {candidate.suggestedContact.name} — {candidate.suggestedContact.role}</p>
                            )}
                            {candidate.phone && <p className="text-ink-2 text-xs">📞 {candidate.phone}</p>}
                            {candidate.emails?.[0] && <p className="text-ink-2 text-xs">✉️ {candidate.emails[0]}</p>}
                            {candidate.website && <p className="text-ink-2 text-xs">🌐 {candidate.website}</p>}
                        </div>
                    </div>
                    <p className="text-[11px] text-ink-2 italic">{candidate.rationale}</p>
                    <button
                        onClick={promote}
                        disabled={promoting}
                        className="w-full flex items-center justify-center gap-2 bg-atlas-orange text-white py-2.5 rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors disabled:opacity-50"
                    >
                        {promoting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        {promoting ? 'Cadastrando...' : 'Cadastrar no CRM'}
                    </button>
                </div>
            )}

            {promoted && (
                <div className="bg-success/10 border border-success/30 rounded-2xl p-5 text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-success mx-auto" />
                    <p className="font-bold text-sm text-ink">Cadastrado no CRM com sucesso!</p>
                    <button onClick={reset} className="text-xs font-bold text-atlas-orange hover:underline">Ler outra imagem</button>
                </div>
            )}
        </div>
    );
}
