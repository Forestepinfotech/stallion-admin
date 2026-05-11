import { HttpClient, HttpEvent, HttpEventType, HttpRequest } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { filter, map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class ExcelImportService {
  private readonly http = inject(HttpClient);

  async uploadExcel(
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<unknown> {
    onProgress?.(0);

    const form = new FormData();
    form.append('file', file, file.name);

    const request = new HttpRequest('POST', '/import/excel', form, {
      reportProgress: true,
    });

    const response = await firstValueFrom(
      this.http.request(request).pipe(
        map((event: HttpEvent<unknown>) => {
          if (event.type === HttpEventType.UploadProgress) {
            const total = event.total ?? file.size;
            const progress = total > 0 ? Math.round((event.loaded / total) * 100) : 0;
            onProgress?.(progress);
          }
          return event;
        }),
        filter((event) => event.type === HttpEventType.Response),
      ),
    );

    onProgress?.(100);
    return (response as any).body;
  }
}

