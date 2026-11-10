import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeDto, Permission } from '../../../shared/api-types';
import { onUnauthorized } from '../api/client';
import { api, queryKeys } from '../api/endpoints';
import { AsyncView } from '../components/AsyncView';
import { AccessDenied } from '../components/AccessDenied';

interface AuthState {
  me: MeDto;
  /** UX only: hides what the person can't use. The server enforces every rule. */
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * The single source of truth for who is using the admin, hydrated from
 * GET /api/v1/me. When the person changes, or any request answers 401, all
 * cached server data is dropped so nobody sees the previous person's data.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => api.getMe(signal), staleTime: 30_000 });

  useEffect(
    () =>
      onUnauthorized(() => {
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
        void qc.invalidateQueries({ queryKey: queryKeys.me });
      }),
    [qc],
  );

  const personKey = me.data ? `${me.data.person?.id ?? 'none'}:${me.data.role}` : null;
  useEffect(() => {
    if (!personKey) return;
    return () => {
      // The person (or their role) changed: clear everything they had loaded.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    };
  }, [personKey, qc]);

  return (
    <AsyncView query={me} loadingLabel="Starting the admin…">
      {(data) => <AuthReady me={data}>{children}</AuthReady>}
    </AsyncView>
  );
}

function AuthReady({ me, children }: { me: MeDto; children: ReactNode }) {
  const value = useMemo<AuthState>(() => ({ me, can: (p) => me.permissions.includes(p) }), [me]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Renders children only when the person has the permission (fail closed). */
export function Can({ permission, children, fallback = null }: { permission: Permission; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useAuth();
  return <>{can(permission) ? children : fallback}</>;
}

/** Route guard: a deep link to a screen the person may not use shows "access denied". */
export function RequirePermission({ permission, children, what }: { permission: Permission; children: ReactNode; what?: string }) {
  const { can } = useAuth();
  return can(permission) ? <>{children}</> : <AccessDenied what={what} />;
}
