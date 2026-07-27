export interface UserPreset {
  id: string;
  name: string;
  email: string;
  password: string;
  role: string;
  brand: 'atlasgr' | 'totaltrac';
  avatarBg: string;
}

export const PRESET_USERS: UserPreset[] = [
  {
    id: 'user-1',
    name: 'Marcelo Nascimento',
    email: 'marcelo.nascimento@atlasgr.com.br',
    password: '12345678',
    role: 'Diretor de Operações & Tech',
    brand: 'atlasgr',
    avatarBg: 'bg-gradient-to-r from-orange-500 to-amber-500'
  },
  {
    id: 'user-2',
    name: 'João Reis',
    email: 'joao.reis@atlasgr.com.br',
    password: '***REMOVED***',
    role: 'Executivo Comercial B2B',
    brand: 'atlasgr',
    avatarBg: 'bg-gradient-to-r from-amber-500 to-red-500'
  },
  {
    id: 'user-3',
    name: 'Cauê Oliveira',
    email: 'caue.oliveira@totaltrack.com.br',
    password: '12345678',
    role: 'Gerente de Frotas & Operações',
    brand: 'totaltrac',
    avatarBg: 'bg-gradient-to-r from-sky-500 to-blue-600'
  },
  {
    id: 'user-4',
    name: 'Ronan',
    email: 'ronan@totaltrack.com.br',
    password: '12345678',
    role: 'Especialista em Telemetria & GR',
    brand: 'totaltrac',
    avatarBg: 'bg-gradient-to-r from-indigo-500 to-purple-600'
  }
];
