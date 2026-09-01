import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'success', 'warning', 'danger', 'info', 'neon', 'gradient', 'outline'],
    },
  },
  args: { children: 'Qualificado', variant: 'default' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="success">Aprovado</Badge>
      <Badge variant="warning">Pendente</Badge>
      <Badge variant="danger">Bloqueado</Badge>
      <Badge variant="info">Info</Badge>
      <Badge variant="neon">Prioridade</Badge>
      <Badge variant="gradient">Destaque</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};
