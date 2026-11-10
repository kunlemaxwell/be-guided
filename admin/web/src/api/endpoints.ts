import type {
  ConnectorKeyDto,
  CreatedConnectorKeyDto,
  NewConnectorKeyInput,
  PendingChangeDetailDto,
  PendingChangeDto,
  AuditEntryDto,
  AuditQuery,
  CapabilitiesDto,
  FolderChoiceDto,
  GuideRequest,
  LibraryDto,
  MeDto,
  ModuleJson,
  NewModuleInput,
  NewPageInput,
  NewPersonInput,
  NewProductInput,
  NewRequestInput,
  PageDetailDto,
  PageSummary,
  Paged,
  PersonDto,
  ProductJson,
  PublishResultDto,
  PublishStatusDto,
  RequestDto,
  RevisionDetailDto,
  RevisionSummaryDto,
  SavePageInput,
  SavePageResult,
  UpdatePersonInput,
  UploadKind,
  UploadResultDto,
} from '../../../shared/api-types';
import { apiRequest, apiRequestWithMessage } from './client';

/** Typed admin API: one function per endpoint (see docs/openapi.json). */
const seg = encodeURIComponent;
const pagePath = (product: string, module: string, page: string) => `/pages/${seg(product)}/${seg(module)}/${seg(page)}`;

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Query keys. Locally there is one user per computer; in the cloud the cache is cleared when the person changes. */
export const queryKeys = {
  me: ['me'] as const,
  capabilities: ['capabilities'] as const,
  site: ['site'] as const,
  library: ['library'] as const,
  page: (id: string) => ['page', id] as const,
  revisions: (id: string, pageNumber: number) => ['revisions', id, pageNumber] as const,
  revision: (id: string, revisionId: string) => ['revision', id, revisionId] as const,
  people: ['people'] as const,
  connectorKeys: ['connector-keys'] as const,
  changes: (status?: string) => ['changes', status ?? 'all'] as const,
  change: (id: string) => ['change', id] as const,
  audit: (q: Partial<AuditQuery>) => ['audit', q] as const,
  auditEntry: (id: string) => ['audit-entry', id] as const,
  requests: ['requests'] as const,
  publish: ['publish'] as const,
};

export const api = {
  getMe: (signal?: AbortSignal) => apiRequest<MeDto>('/me', { signal }),
  getCapabilities: (signal?: AbortSignal) => apiRequest<CapabilitiesDto>('/capabilities', { signal }),
  chooseFolder: () => apiRequest<FolderChoiceDto>('/system/choose-folder', { method: 'POST', body: {} }),

  getSite: (signal?: AbortSignal) => apiRequest<Record<string, unknown>>('/site', { signal }),
  saveSite: (site: Record<string, unknown>) => apiRequest<Record<string, unknown>>('/site', { method: 'PUT', body: site }),

  getLibrary: (signal?: AbortSignal) => apiRequest<LibraryDto>('/library', { signal }),
  getProductImages: (product: string, signal?: AbortSignal) => apiRequest<string[]>(`/products/${seg(product)}/images`, { signal }),
  createProduct: (input: NewProductInput) => apiRequest<ProductJson>('/products', { method: 'POST', body: input }),
  saveProduct: (product: string, meta: Record<string, unknown>) => apiRequest<ProductJson>(`/products/${seg(product)}`, { method: 'PUT', body: meta }),
  createModule: (product: string, input: NewModuleInput) => apiRequest<ModuleJson>(`/products/${seg(product)}/modules`, { method: 'POST', body: input }),
  createPage: (product: string, module: string, input: NewPageInput) =>
    apiRequest<PageSummary>(`/products/${seg(product)}/modules/${seg(module)}/pages`, { method: 'POST', body: input }),
  upload: (product: string, module: string, kind: UploadKind, file: File) => {
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', file);
    return apiRequestWithMessage<UploadResultDto>(`/products/${seg(product)}/modules/${seg(module)}/uploads`, { method: 'POST', form });
  },

  getPage: (product: string, module: string, page: string, signal?: AbortSignal) => apiRequest<PageDetailDto>(pagePath(product, module, page), { signal }),
  savePage: (product: string, module: string, page: string, input: SavePageInput) =>
    apiRequest<SavePageResult>(pagePath(product, module, page), { method: 'PUT', body: input }),
  markDraft: (product: string, module: string, page: string) => apiRequest<SavePageResult>(`${pagePath(product, module, page)}/draft`, { method: 'POST', body: {} }),
  getRevisions: (product: string, module: string, page: string, pageNumber: number, signal?: AbortSignal) =>
    apiRequest<Paged<RevisionSummaryDto>>(`${pagePath(product, module, page)}/revisions${query({ pageNumber, pageSize: 20 })}`, { signal }),
  getRevision: (product: string, module: string, page: string, revisionId: string, signal?: AbortSignal) =>
    apiRequest<RevisionDetailDto>(`${pagePath(product, module, page)}/revisions/${seg(revisionId)}`, { signal }),

  getPeople: (signal?: AbortSignal) => apiRequest<PersonDto[]>('/people', { signal }),
  /** The message says whether the person can now sign in (online). */
  createPerson: (input: NewPersonInput) => apiRequestWithMessage<PersonDto>('/people', { method: 'POST', body: input }),
  updatePerson: (id: string, input: UpdatePersonInput) => apiRequestWithMessage<PersonDto>(`/people/${seg(id)}`, { method: 'PUT', body: input }),
  syncSignIn: () => apiRequestWithMessage<{ signIn: string }>('/people/sign-in/sync', { method: 'POST', body: {} }),
  getConnectorKeys: (signal?: AbortSignal) => apiRequest<ConnectorKeyDto[]>('/connector-keys', { signal }),
  createConnectorKey: (input: NewConnectorKeyInput) => apiRequest<CreatedConnectorKeyDto>('/connector-keys', { method: 'POST', body: input }),
  revokeConnectorKey: (id: string) => apiRequest<ConnectorKeyDto>(`/connector-keys/${seg(id)}`, { method: 'DELETE' }),
  getChanges: (status?: 'pending' | 'approved' | 'rejected', signal?: AbortSignal) =>
    apiRequest<PendingChangeDto[]>(status ? `/changes?status=${status}` : '/changes', { signal }),
  getChange: (id: string, signal?: AbortSignal) => apiRequest<PendingChangeDetailDto>(`/changes/${seg(id)}`, { signal }),
  decideChange: (id: string, decision: 'approve' | 'reject', note?: string) =>
    apiRequest<PendingChangeDto>(`/changes/${seg(id)}/${decision}`, { method: 'POST', body: note ? { note } : {} }),
  setCurrentPerson: (personId: string | null) => apiRequest<MeDto>('/settings/current-person', { method: 'PUT', body: { personId } }),

  getAudit: (q: Partial<AuditQuery>, signal?: AbortSignal) =>
    apiRequest<Paged<AuditEntryDto>>(`/audit-log${query({ pageNumber: q.pageNumber, pageSize: q.pageSize, area: q.area, actorId: q.actorId, from: q.from, to: q.to, q: q.q })}`, { signal }),
  getAuditEntry: (id: string, signal?: AbortSignal) => apiRequest<AuditEntryDto>(`/audit-log/${seg(id)}`, { signal }),

  getRequests: (signal?: AbortSignal) => apiRequest<RequestDto[]>('/requests', { signal }),
  createRequest: (input: NewRequestInput) => apiRequest<GuideRequest>('/requests', { method: 'POST', body: input }),
  cancelRequest: (id: string) => apiRequest<GuideRequest>(`/requests/${seg(id)}/cancel`, { method: 'POST', body: {} }),
  dismissRequest: (id: string) => apiRequest<{ removed: boolean }>(`/requests/${seg(id)}/dismiss`, { method: 'POST', body: {} }),
  approveCreate: (id: string) => apiRequestWithMessage<RequestDto>(`/requests/${seg(id)}/create`, { method: 'POST', body: {} }),
  approveChanges: (id: string, approved: string[]) => apiRequest<RequestDto>(`/requests/${seg(id)}/approve`, { method: 'POST', body: { approved } }),

  getPublishStatus: (signal?: AbortSignal) => apiRequest<PublishStatusDto>('/publish', { signal }),
  publish: () => apiRequest<PublishResultDto>('/publish', { method: 'POST', body: {} }),
};

/** Admin URL for a module file written as "images/x.webp" or "media/x.mp4". */
export function moduleFileUrl(product: string, module: string, src: string): string {
  return `/api/v1/files?path=${encodeURIComponent(`products/${product}/${module}/${src}`)}`;
}
