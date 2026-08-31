import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { toast } from '../../../lib/toast';

export function EditorIA() {
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAction = async (action: 'expand' | 'concise' | 'pain') => {
    if (!content.trim()) {
      toast.error('Digite algum texto para o assistente editar.');
      return;
    }
    setIsGenerating(true);
    try {
      const response = await fetch('/api/knowledge/editor-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text: content }),
      });

      if (!response.ok) throw new Error('Erro ao processar com IA');
      const data = await response.json();

      if (data.success && data.result) {
        setContent(data.result);
        toast.success('Texto editado com sucesso pela IA!');
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-surface rounded-2xl border border-line p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand" /> Assistente de Redação IA
        </h3>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Cole ou digite o texto de um e-mail, proposta ou roteiro aqui..."
        className="w-full h-40 p-4 rounded-xl bg-surface-2 border border-line focus:outline-none focus:ring-2 focus:ring-brand resize-none text-sm text-ink leading-relaxed"
        disabled={isGenerating}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => handleAction('expand')}
          disabled={isGenerating}
          variant="outline"
          className="text-xs py-1.5 h-auto cursor-pointer"
        >
          Expandir Argumento
        </Button>
        <Button
          type="button"
          onClick={() => handleAction('concise')}
          disabled={isGenerating}
          variant="outline"
          className="text-xs py-1.5 h-auto cursor-pointer"
        >
          Tornar mais Conciso
        </Button>
        <Button
          type="button"
          onClick={() => handleAction('pain')}
          disabled={isGenerating}
          variant="outline"
          className="text-xs py-1.5 h-auto cursor-pointer"
        >
          Focar na Dor (SPIN)
        </Button>

        {isGenerating && (
          <span className="flex items-center gap-2 text-xs text-brand font-bold ml-auto animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin" /> Processando...
          </span>
        )}
      </div>
    </div>
  );
}
