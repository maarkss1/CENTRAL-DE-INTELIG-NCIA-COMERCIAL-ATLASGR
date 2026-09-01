import { useEffect, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  Check,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  LockKeyholeOpen,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../contexts/AuthContext';
import { toast } from '../../../lib/toast';
import { useConfirmDialog } from '../../../components/ui/ConfirmDialog';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  createdAt: string;
  /** Bloqueio por tentativas de login (`src/lib/auth.ts`) — nunca era exibido nem tinha ação de
   * desbloqueio antes do Piloto 024. `null`/data passada = não bloqueado. */
  lockedUntil: string | null;
  failedLoginAttempts: number;
  /** `emailVerified`, `image`, `bitrixUserId` e `updatedAt` são campos reais do model `User` que
   * já existiam no schema mas nunca apareciam nesta tela (achado fora de escopo do Piloto 024). */
  emailVerified: boolean;
  image: string | null;
  bitrixUserId: number | null;
  updatedAt: string;
}

function isLocked(member: TeamMember): boolean {
  return !!member.lockedUntil && new Date(member.lockedUntil).getTime() > Date.now();
}

function formatUpdatedAt(updatedAt: string): string {
  return new Date(updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  GESTOR: 'Gestor',
  CLOSER: 'Closer',
  SDR: 'SDR',
  VISUALIZADOR: 'Visualizador',
};

export function Team() {
  const { currentUser } = useAuth();
  const { confirm, dialog } = useConfirmDialog();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('SDR');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [revealedCredentials, setRevealedCredentials] = useState<{
    email: string;
    tempPassword: string;
    justCreated: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [resetError, setResetError] = useState('');

  const loadMembers = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await api.get<{ members: TeamMember[]; assignableRoles: string[] }>('/api/team');
      setMembers(data.members);
      setAssignableRoles(data.assignableRoles);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Falha ao carregar a equipe.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreateError('');
    setRevealedCredentials(null);
    try {
      const data = await api.post<{ member: TeamMember; tempPassword: string }>('/api/team', {
        name,
        email,
        role,
      });
      setMembers((prev) => [...prev, data.member]);
      setRevealedCredentials({
        email: data.member.email,
        tempPassword: data.tempPassword,
        justCreated: true,
      });
      setName('');
      setEmail('');
      setRole('SDR');
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Falha ao criar usuário.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleResetPassword = async (member: TeamMember) => {
    const isSelf = member.id === currentUser?.id;
    if (
      !(await confirm({
        title: isSelf ? 'Redefinir sua própria senha' : `Redefinir a senha de ${member.name}`,
        description: isSelf
          ? 'Redefinir a sua própria senha? Sua sessão atual será encerrada e você vai precisar entrar de novo com a senha temporária gerada agora.'
          : `Redefinir a senha de ${member.name}? O acesso atual dela(e) para de funcionar imediatamente — só volta a entrar com a senha temporária que você vai copiar agora.`,
        confirmLabel: 'Redefinir senha',
        variant: 'danger',
      }))
    )
      return;
    setResettingId(member.id);
    setResetError('');
    setRevealedCredentials(null);
    try {
      const data = await api.post<{ member: TeamMember; tempPassword: string }>(
        `/api/team/${member.id}/reset-password`,
        {},
      );
      setMembers((prev) => prev.map((m) => (m.id === data.member.id ? data.member : m)));
      setRevealedCredentials({
        email: data.member.email,
        tempPassword: data.tempPassword,
        justCreated: false,
      });
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Falha ao redefinir a senha.');
    } finally {
      setResettingId(null);
    }
  };

  const handleUnlock = async (member: TeamMember) => {
    setUnlockingId(member.id);
    try {
      const data = await api.post<{ member: TeamMember }>(`/api/team/${member.id}/unlock`, {});
      setMembers((prev) => prev.map((m) => (m.id === data.member.id ? data.member : m)));
      toast.success(`Acesso de ${member.name} desbloqueado.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao desbloquear o usuário.');
    } finally {
      setUnlockingId(null);
    }
  };

  const handleDelete = async (member: TeamMember) => {
    if (
      !(await confirm({
        title: `Remover ${member.name}`,
        description: `Remover o acesso de ${member.name} (${member.email})? Essa ação não pode ser desfeita.`,
        confirmLabel: 'Remover acesso',
        variant: 'danger',
      }))
    )
      return;
    setDeletingId(member.id);
    try {
      await api.delete(`/api/team/${member.id}`);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao remover usuário.');
    } finally {
      setDeletingId(null);
    }
  };

  const copyCredentials = () => {
    if (!revealedCredentials) return;
    navigator.clipboard.writeText(
      `E-mail: ${revealedCredentials.email}\nSenha temporária: ${revealedCredentials.tempPassword}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-transparent p-6 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-surface rounded-xl flex items-center justify-center shadow-sm text-brand">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-ink">Equipe</h1>
            <p className="text-ink-2 text-sm">
              Crie acessos, defina papéis e remova usuários da organização.
            </p>
          </div>
        </div>

        {/* Formulário de novo usuário */}
        <form
          onSubmit={handleCreate}
          className="bg-surface/80 p-6 rounded-2xl border border-line space-y-4"
        >
          <h2 className="font-black text-sm text-ink flex items-center gap-2">
            <UserPlus size={16} className="text-brand" /> Adicionar novo usuário
          </h2>

          {createError && (
            <div className="bg-danger/10 border border-danger/30 text-danger-active dark:text-danger p-3 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /> {createError}
            </div>
          )}

          {revealedCredentials && (
            <div className="bg-success/10 border border-success/30 rounded-xl p-4 text-xs space-y-2">
              <p className="font-bold text-success-active dark:text-success">
                {revealedCredentials.justCreated ? 'Usuário criado!' : 'Senha redefinida!'} Copie a
                senha temporária agora — ela não aparece de novo.
              </p>
              <div className="bg-surface font-mono p-3 rounded-lg border border-line text-ink">
                <div>{revealedCredentials.email}</div>
                <div>{revealedCredentials.tempPassword}</div>
              </div>
              <button
                type="button"
                onClick={copyCredentials}
                className="flex items-center gap-1.5 text-ink-2 hover:text-ink font-bold"
              >
                {copied ? (
                  <Check size={14} className="text-success-active dark:text-success" />
                ) : (
                  <Copy size={14} />
                )}
                {copied ? 'Copiado' : 'Copiar credenciais'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="team-name"
                className="block text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1.5"
              >
                Nome
              </label>
              <input
                id="team-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="Nome completo"
                required
              />
            </div>
            <div>
              <label
                htmlFor="team-email"
                className="block text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1.5"
              >
                E-mail corporativo
              </label>
              <input
                id="team-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="nome@atlasgr.com.br"
                required
              />
            </div>
            <div>
              <label
                htmlFor="team-role"
                className="block text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1.5"
              >
                Papel
              </label>
              <select
                id="team-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {(assignableRoles.length ? assignableRoles : Object.keys(ROLE_LABELS)).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] || r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={isCreating || !name || !email}
            className="bg-brand-active text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-brand-2 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isCreating ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            {isCreating ? 'Criando...' : 'Criar usuário'}
          </button>
        </form>

        {/* Lista de usuários */}
        <div className="bg-surface/80 rounded-2xl border border-line overflow-hidden">
          <div className="px-6 py-4 border-b border-line space-y-2">
            <h2 className="font-black text-sm text-ink flex items-center gap-2">
              <Shield size={16} className="text-brand" /> Usuários da organização ({members.length})
            </h2>
            {resetError && (
              <div className="bg-danger/10 border border-danger/30 text-danger-active dark:text-danger p-2.5 rounded-lg text-xs flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" /> {resetError}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="animate-spin text-ink-2" />
            </div>
          ) : loadError ? (
            <div className="p-6 text-xs text-danger-active dark:text-danger">{loadError}</div>
          ) : (
            <ul className="divide-y divide-line">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {member.image ? (
                      <img
                        src={member.image}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover shrink-0 border border-line"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-sm font-bold text-white shadow-card"
                      >
                        {(member.name || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-ink">{member.name}</span>
                        {member.mustChangePassword && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning-active dark:text-warning font-bold">
                            senha temporária
                          </span>
                        )}
                        {isLocked(member) && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-danger/15 text-danger-active dark:text-danger font-bold">
                            bloqueado até{' '}
                            {new Date(member.lockedUntil!).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                        {member.emailVerified && (
                          <span
                            title="E-mail verificado"
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success-active dark:text-success font-bold"
                          >
                            <BadgeCheck size={11} /> verificado
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap text-xs text-ink-2">
                        <span>{member.email}</span>
                        {member.updatedAt && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>atualizado em {formatUpdatedAt(member.updatedAt)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {member.bitrixUserId != null && (
                      <span
                        title={`ID Bitrix: ${member.bitrixUserId}`}
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-surface-2 text-ink-2 border border-line font-mono"
                      >
                        <Link2 size={11} /> #{member.bitrixUserId}
                      </span>
                    )}
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-info/15 text-info-active dark:text-info font-bold">
                      {ROLE_LABELS[member.role] || member.role}
                    </span>
                    {isLocked(member) && (
                      <button
                        type="button"
                        onClick={() => void handleUnlock(member)}
                        disabled={unlockingId === member.id}
                        title="Desbloquear acesso (zera tentativas de login)"
                        aria-label={`Desbloquear acesso de ${member.name}`}
                        className="text-ink-2 hover:bg-warning/10 hover:text-warning-active dark:hover:text-warning p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {unlockingId === member.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <LockKeyholeOpen size={14} />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleResetPassword(member)}
                      disabled={resettingId === member.id}
                      title={
                        member.id === currentUser?.id
                          ? 'Redefinir a sua própria senha'
                          : `Redefinir a senha de ${member.name}`
                      }
                      aria-label={
                        member.id === currentUser?.id
                          ? 'Redefinir a sua própria senha'
                          : `Redefinir a senha de ${member.name}`
                      }
                      className="text-ink-2 hover:bg-brand/10 hover:text-brand-active dark:hover:text-brand-2 p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {resettingId === member.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <KeyRound size={14} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(member)}
                      disabled={deletingId === member.id || member.id === currentUser?.id}
                      title={
                        member.id === currentUser?.id
                          ? 'Você não pode remover a própria conta'
                          : 'Remover usuário'
                      }
                      aria-label={
                        member.id === currentUser?.id
                          ? 'Você não pode remover a própria conta'
                          : `Remover ${member.name}`
                      }
                      className="text-danger-active dark:text-danger hover:bg-danger/10 p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {deletingId === member.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {dialog}
    </div>
  );
}
