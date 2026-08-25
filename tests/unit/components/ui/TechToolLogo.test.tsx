/**
 * ITEM-04 (cobertura de testes real): TechToolLogo.tsx resolve o nome de uma tecnologia
 * detectada no stack de uma empresa (ex.: enriquecimento de prospecção) para um badge visual —
 * tem lógica real de normalização de string e fallback para tecnologia desconhecida (usada quando
 * o crawler encontra algo fora do dicionário `TECH_DATABASE`). Antes desta suíte: 13% de
 * cobertura, nenhum teste do comportamento de lookup/fallback/onClick.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TechToolLogo } from '@/components/ui/TechToolLogo';

afterEach(() => {
    cleanup();
});

describe('TechToolLogo', () => {
    it('resolve uma tecnologia conhecida (case-insensitive) para seu nome canônico', () => {
        render(<TechToolLogo techName="REACT" />);
        expect(screen.getByRole('button', { name: /React/ })).toBeInTheDocument();
    });

    it('normaliza variações de grafia/pontuação para a mesma entrada do dicionário', () => {
        render(<TechToolLogo techName="Node.js" />);
        // "node.js" normalizado (só a-z0-9) vira "nodejs", que está no dicionário como "Node.js".
        expect(screen.getByText('Node.js')).toBeInTheDocument();
    });

    it('cai no fallback "Outros" para uma tecnologia fora do dicionário, preservando o nome original exibido', () => {
        render(<TechToolLogo techName="FerramentaBemObscura" />);
        expect(screen.getByText('FerramentaBemObscura')).toBeInTheDocument();
        const title = screen.getByRole('button').getAttribute('title');
        expect(title).toContain('FerramentaBemObscura (Outros)');
    });

    it('mostra o badge de categoria só quando showCategory=true', () => {
        const { rerender } = render(<TechToolLogo techName="docker" showCategory={false} />);
        expect(screen.queryByText('DevOps')).not.toBeInTheDocument();

        rerender(<TechToolLogo techName="docker" showCategory />);
        expect(screen.getByText('DevOps')).toBeInTheDocument();
    });

    it('chama onClick com a info resolvida da tecnologia ao clicar', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<TechToolLogo techName="aws" onClick={onClick} />);

        await user.click(screen.getByRole('button'));

        expect(onClick).toHaveBeenCalledTimes(1);
        expect(onClick).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'AWS', category: 'Cloud' })
        );
    });

    it('não quebra ao clicar quando nenhum onClick é passado', async () => {
        const user = userEvent.setup();
        render(<TechToolLogo techName="python" />);
        await expect(user.click(screen.getByRole('button'))).resolves.not.toThrow();
    });
});
