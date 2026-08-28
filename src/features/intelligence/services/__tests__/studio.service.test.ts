import { describe, expect, it, vi } from 'vitest';

// Mocka cada gerador para devolver um marcador único e reconhecível — o teste confirma que
// StudioService.generate roteia cada `kind` para o gerador certo, não que os geradores funcionam
// (isso já é coberto em studio/generators/__tests__/*). Um erro de digitação num `case` do switch
// (ex.: chamar generateMessage para kind:"call_script") não daria erro de tipo — só um bug de
// roteamento silencioso em runtime, exatamente o que esta suíte pega.
vi.mock('../studio/generators/email.js', () => ({ generateEmail: () => 'email' }));
vi.mock('../studio/generators/callScript.js', () => ({ generateCallScript: () => 'call_script' }));
vi.mock('../studio/generators/message.js', () => ({ generateMessage: () => 'message' }));
vi.mock('../studio/generators/ocrExtract.js', () => ({ generateOcrExtract: () => 'ocr_extract' }));
vi.mock('../studio/generators/b2bMatrix.js', () => ({ generateB2bMatrix: () => 'b2b_matrix' }));
vi.mock('../studio/generators/training.js', () => ({ generateTraining: () => 'training' }));
vi.mock('../studio/generators/methodology.js', () => ({
  generateMethodology: () => 'methodology',
}));
vi.mock('../studio/generators/script.js', () => ({ generateScript: () => 'script' }));
vi.mock('../studio/generators/automation.js', () => ({ generateAutomation: () => 'automation' }));
vi.mock('../studio/generators/assistant.js', () => ({ generateAssistant: () => 'assistant' }));
vi.mock('../studio/generators/roleplay.js', () => ({ generateRoleplay: () => 'roleplay' }));
vi.mock('../studio/generators/superagent.js', () => ({ generateSuperagent: () => 'superagent' }));

import { studioService } from '../studio.service.js';
import type { StudioGenerationRequest } from '../studio.service.js';

const KINDS: StudioGenerationRequest['kind'][] = [
  'email',
  'call_script',
  'message',
  'ocr_extract',
  'b2b_matrix',
  'training',
  'methodology',
  'script',
  'automation',
  'assistant',
  'roleplay',
  'superagent',
];

describe('StudioService.generate — roteamento por kind', () => {
  it.each(KINDS)('roteia kind:"%s" para o gerador correspondente', async (kind) => {
    // O request só precisa satisfazer o discriminant `kind` para o switch — os generators
    // reais (que exigiriam `inputs`/`brand` válidos) estão mockados acima.
    const request = { kind } as unknown as StudioGenerationRequest;

    const result = await studioService.generate(request);

    expect(result).toBe(kind);
  });
});
