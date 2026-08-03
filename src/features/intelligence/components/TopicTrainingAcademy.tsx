import { useState } from 'react';
import { BookOpen, Sparkles, Award, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useBrand } from '../../../contexts/BrandContext';
import { api } from '../../../lib/api';

export function TopicTrainingAcademy() {
  const { brandInfo } = useBrand();
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [trainingModule, setTrainingModule] = useState<{
    title: string;
    description: string;
    steps: { step: number; title: string; detail: string; tip: string }[];
  } | null>(null);

  const handleGenerateTraining = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic) return;
    setIsGenerating(true);
    setError('');
    setTrainingModule(null);
    try {
      const response = await api.post<{
        result: NonNullable<typeof trainingModule>;
      }>('/api/intelligence/studio', {
        kind: 'training',
        brand: { name: brandInfo.name, description: brandInfo.description },
        inputs: { topic },
      }, { timeoutMs: 90_000 });
      setTrainingModule(response.result);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Não foi possível gerar o treinamento.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-surface/95 backdrop-blur-3xl p-8 rounded-[3rem] border border-line/90 shadow-2xl space-y-6 text-ink">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-indigo-100 text-indigo-600 border border-indigo-200">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Academia de Treinamento Comercial por Tema</h2>
            <p className="text-xs text-ink-2 font-medium">Digite qualquer assunto ou dor para gerar uma aula interativa sob medida</p>
          </div>
        </div>
        <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-black rounded-full border border-indigo-200">
          IA Academy Live
        </span>
      </div>

      <form onSubmit={handleGenerateTraining} className="space-y-3 bg-surface-2 p-6 rounded-3xl border border-line">
        <label className="block text-xs font-extrabold text-ink-2 uppercase">Qual tema de vendas você deseja treinar hoje?</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ex: Negociação com Diretor de Logística, Redução de Combustível, Fechamento de Grandes Frotas..."
            className="flex-1 bg-surface border border-line rounded-2xl px-4 py-3 text-xs text-ink font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            required
          />
          <button
            type="submit"
            disabled={isGenerating || !topic}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-6 py-3 rounded-2xl text-xs shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{isGenerating ? 'Gerando Aula...' : 'Gerar Treinamento sob Medida'}</span>
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loader visual durante geração (sem o jogo 3D) */}
      {isGenerating && (
         <div className="mt-8 animate-in fade-in duration-500 relative">
            <div className="bg-black/80 backdrop-blur-md rounded-[3rem] p-16 flex flex-col items-center justify-center border border-white/10 shadow-inner">
                <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mb-4" />
                <h3 className="text-white font-black text-xl tracking-tight">Processando dados com Inteligência Artificial...</h3>
                <p className="text-gray-400 text-sm mt-2 font-medium">Isso pode levar alguns segundos dependendo da complexidade do tema.</p>
            </div>
         </div>
      )}

      {trainingModule && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 pt-2">
          <div className="p-5 rounded-2xl bg-indigo-50 border border-indigo-200">
            <h3 className="font-black text-indigo-900 text-base flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-600" /> {trainingModule.title}
            </h3>
            <p className="text-xs text-indigo-700 mt-1">{trainingModule.description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {trainingModule.steps.map((s) => (
              <div key={s.step} className="p-5 rounded-3xl bg-surface border border-line shadow-sm space-y-2 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                    ETAPA {s.step}
                  </span>
                  <h4 className="font-extrabold text-xs text-ink mt-2">{s.title}</h4>
                  <p className="text-xs text-ink-2 mt-1 leading-relaxed font-medium">{s.detail}</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-bold">
                  💡 Dica do Especialista: {s.tip}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
