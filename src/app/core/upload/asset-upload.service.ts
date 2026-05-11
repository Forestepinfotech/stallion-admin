import { HttpClient, HttpEvent, HttpEventType, HttpHeaders, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { UploadsService } from '../api/generated/uploads/uploads.service';
import type { CreateUploadUrlDtoFolder } from '../api/generated/schemas/createUploadUrlDtoFolder';
import type { CreateUploadUrlResponseDto } from '../api/generated/schemas/createUploadUrlResponseDto';

@Injectable({ providedIn: 'root' })
export class AssetUploadService {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly http: HttpClient,
  ) {}

  async uploadFile(
    file: File,
    folder: CreateUploadUrlDtoFolder,
    onProgress?: (progress: number) => void,
  ): Promise<CreateUploadUrlResponseDto> {
    onProgress?.(0);

    const presigned = await firstValueFrom(
      this.uploadsService.uploadsControllerCreatePresignedUpload({
        folder,
        fileName: file.name,
        contentType: file.type || undefined,
      }),
    );

    const headers = this.toHttpHeaders(presigned.headers, presigned.contentType || file.type);
    const request = new HttpRequest('PUT', presigned.uploadUrl, file, {
      headers,
      reportProgress: true,
      responseType: 'text',
    });

    await firstValueFrom(
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
    return presigned;
  }

  private toHttpHeaders(
    rawHeaders: Record<string, unknown> | undefined,
    contentType: string | undefined,
  ): HttpHeaders {
    let headers = new HttpHeaders();

    for (const [key, value] of Object.entries(rawHeaders ?? {})) {
      if (typeof value === 'string') {
        headers = headers.set(key, value);
      }
    }

    if (contentType && !headers.has('Content-Type')) {
      headers = headers.set('Content-Type', contentType);
    }

    return headers;
  }
}
