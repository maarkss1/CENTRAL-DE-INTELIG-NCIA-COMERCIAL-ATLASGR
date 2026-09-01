import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';

const meta = {
  title: 'UI/Button',
  component: Button,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
  },
  args: {
    children: 'Salvar',
    variant: 'default',
    size: 'default',
    disabled: false,
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Excluir' },
};

export const Outline: Story = {
  args: { variant: 'outline', children: 'Cancelar' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Ver detalhes' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Mais opções' },
};

export const Link: Story = {
  args: { variant: 'link', children: 'Saiba mais' },
};

export const Disabled: Story = {
  args: { disabled: true, children: 'Indisponível' },
};

// Todas as variantes lado a lado — referência rápida sem precisar trocar o control.
export const AllVariants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} variant="default">
        Default
      </Button>
      <Button {...args} variant="destructive">
        Destructive
      </Button>
      <Button {...args} variant="outline">
        Outline
      </Button>
      <Button {...args} variant="secondary">
        Secondary
      </Button>
      <Button {...args} variant="ghost">
        Ghost
      </Button>
      <Button {...args} variant="link">
        Link
      </Button>
    </div>
  ),
};
