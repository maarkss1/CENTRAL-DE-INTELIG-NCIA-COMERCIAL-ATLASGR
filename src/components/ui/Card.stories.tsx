import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card';
import { Button } from './Button';

const meta = {
  title: 'UI/Card',
  component: Card,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'stat', 'outline', 'accent'],
    },
    padding: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'none'],
    },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Empresa qualificada</CardTitle>
        <CardDescription>Score de fit comercial atualizado há 2h.</CardDescription>
      </CardHeader>
      <CardContent>Faturamento estimado: R$ 4,2M/ano · Setor: Logística</CardContent>
      <CardFooter>
        <Button size="sm">Abrir no CRM</Button>
      </CardFooter>
    </Card>
  ),
};

export const Stat: Story = {
  args: { variant: 'stat' },
  render: (args) => (
    <Card {...args} className="w-64">
      <CardHeader>
        <CardDescription>Leads convertidos (mês)</CardDescription>
        <CardTitle className="text-3xl">128</CardTitle>
      </CardHeader>
    </Card>
  ),
};

export const AccentBar: Story = {
  args: { variant: 'accent', accentBar: true },
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Destaque da marca</CardTitle>
        <CardDescription>accentBar usa o gradiente laranja→branco da AtlasGR.</CardDescription>
      </CardHeader>
    </Card>
  ),
};

export const Outline: Story = {
  args: { variant: 'outline' },
  render: (args) => (
    <Card {...args} className="w-80">
      <CardContent>Card sem preenchimento de fundo, só borda.</CardContent>
    </Card>
  ),
};
