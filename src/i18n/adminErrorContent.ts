import { fr } from './fr';

export type AdminRequestErrorCode = 'request_failed';

export function localizeAdminRequestError(_code: AdminRequestErrorCode): string {
  return fr.admin.requestFailed;
}
