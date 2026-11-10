import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, queryKeys } from '../../api/endpoints';

/** The request queue, shared by every screen that adds to it. */
export function useRequests() {
  return useQuery({ queryKey: queryKeys.requests, queryFn: ({ signal }) => api.getRequests(signal) });
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createRequest,
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.requests }),
  });
}

/** "Approve and create": creates the requested product or module, then refreshes the list and the library. */
export function useApproveCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.approveCreate(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.requests });
      void qc.invalidateQueries({ queryKey: queryKeys.library });
    },
  });
}

export function useRequestAction<T>(action: (id: string) => Promise<T>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.requests }),
  });
}
