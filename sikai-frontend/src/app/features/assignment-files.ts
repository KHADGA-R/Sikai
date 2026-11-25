import { ApiService } from '../core/api.service';

export async function downloadAssignmentFile(api: ApiService, path: string, name: string): Promise<void> {
  const url = URL.createObjectURL(await api.blob(path));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
