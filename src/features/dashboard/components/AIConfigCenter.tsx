import React, { useEffect, useState } from 'react';
import { Cpu, Loader2, Save, Check, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { api } from '../../../lib/api';

/** Perfis realmente disponíveis no runtime atual. Os values são aliases lógicos do gateway. */
const MODEL_OPTIONS = [
  { value: 'local-llama3-fast', label: 'Llama 3.1 8B · rápido', provider: 'Groq' },
  { value: 'local-llama3', label: 'Llama 3.3 70B · qualidade', provider: 'Groq' },
  { value: 'qwen-coder', label: 'Qwen 2.5 Coder 32B · especialista API/Código', provider: 'OpenRouter' },
  { value: 'deepseek-coder', label: 'DeepSeek Coder V2 · arquitetura & lógica', provider: 'OpenRouter' },
] as const;

const PROVIDER_BY_MODEL: Record<string, string> = Object.fromEntries(
  MODEL_OPTIONS.map((m) => [m.value, m.provider]),
);

/** Ferramentas de conteúdo — espelha `ContentTool` em ai.service.ts. */
const TOOLS: { key: string; label: string }[] = [
  { key: 'script_call', label: 'Script de Cold Call' },
  { key: 'script_whatsapp', label: 'Script de WhatsApp' },
  { key: 'script_email', label: 'Cold E-mail' },
  { key: 'prompt', label: 'Perguntas de Qualificação' },
  { key: 'objections', label: 'Matriz de Objeções' },
  { key: 'followup', label: 'Follow-up Pós-Reunião' },
  { key: 'profile', label: 'Perfil Comportamental (DiSC)' },
  { key: 'risk', label: 'Riscos de Negociação' },
  { key: 'linkedin_invite', label: 'Convite LinkedIn' },
  { key: 'voicemail', label: 'Script de Voicemail' },
  { key: 'roi_pitch', label: 'Pitch de ROI' },
  { key: 'competitor_battlecard', label: 'Battlecard de Concorrente' },
  { key: 'cadence_sequence', label: 'Sequência de Cadência' },
];

const DEFAULT_MODEL = 'local-llama3-fast';
const DEFAULT_TEMPERATURE = 0.5;

interface ToolSetting {
  toolKey: string;
  provider: string;
  model: string;
  temperature: number;
}

interface AiEngineSettingDto {
  toolKey: string;
  provider: string;
  model: string;
  temperature: number;
}

function buildDefaultSettings(): Record<string, ToolSetting> {
  const map: Record<string, ToolSetting> = {};
  for (const tool of TOOLS) {
    map[tool.key] = {
      toolKey: tool.key,
      provider: PROVIDER_BY_MODEL[DEFAULT_MODEL],
      model: DEFAULT_MODEL,
      temperature: DEFAULT_TEMPERATURE,
    };
  }
  return map;
}

export const AIConfigCenter: React.FC = () => {
  const [settings, setSettings] = useState<Record<string, ToolSetting>>(buildDefaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const saved = await api.get<AiEngineSettingDto[]>('/api/intelligence/ai-settings');
        if (cancelled) return;
        setSettings((prev) => {
          const next = { ...prev };
          for (const s of saved) {
            const supportedModel = MODEL_OPTIONS.some((option) => option.value === s.model)
              ? s.model
              : DEFAULT_MODEL;
            next[s.toolKey] = {
              toolKey: s.toolKey,
              provider: PROVIDER_BY_MODEL[supportedModel],
              model: supportedModel,
              temperature: s.temperature,
            };
          }
          return next;
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar configurações.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateTool = (toolKey: string, patch: Partial<ToolSetting>) => {
    setSettings((prev) => ({
      ...prev,
      [toolKey]: { ...prev[toolKey], ...patch },
    }));
  };

  const handleModelChange = (toolKey: string, model: string) => {
    updateTool(toolKey, { model, provider: PROVIDER_BY_MODEL[model] ?? 'Google' });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put('/api/intelligence/ai-settings', { settings: Object.values(settings) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="default" padding="lg" className="font-sans" accentBar>
      <CardHeader className="flex-row items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-atlas-orange/15 border border-atlas-orange/30 flex items-center justify-center text-atlas-orange shrink-0">
            <Cpu size={22} />
          </div>
          <div>
            <CardTitle className="text-gradient-brand">Central de Motores de IA</CardTitle>
            <CardDescription>Escolha entre os perfis Groq realmente conectados e ajuste a criatividade de cada ferramenta.</CardDescription>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving || loading} className="shrink-0">
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
          <span className="ml-2">{saved ? 'Salvo!' : saving ? 'Salvando…' : 'Salvar Configurações'}</span>
        </Button>
      </CardHeader>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-card px-4 py-3">
          <AlertTriangle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <Loader2 size={20} className="animate-spin" /> Carregando configurações…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TOOLS.map((tool) => {
              const setting = settings[tool.key];
              return (
                <div
                  key={tool.key}
                  className="rounded-card border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-gray-100">{tool.label}</span>
                    <Badge variant="gradient">{setting.provider}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-xs text-gray-400">
                      Modelo
                      <select
                        value={setting.model}
                        onChange={(e) => handleModelChange(tool.key, e.target.value)}
                        className="bg-slate-950/60 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-atlas-orange"
                      >
                        {MODEL_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-xs text-gray-400">
                      Temperatura ({setting.temperature.toFixed(2)})
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={setting.temperature}
                        onChange={(e) => updateTool(tool.key, { temperature: Number(e.target.value) })}
                        className="accent-atlas-orange mt-2"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
