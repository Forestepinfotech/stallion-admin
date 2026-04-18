import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, firstValueFrom } from 'rxjs';
import { AdminGalleryService } from '../../../core/api/generated/admin-gallery/admin-gallery.service';
import type { MediaGalleryItemDto } from '../../../core/api/generated/schemas';
import { CreateUploadUrlDtoFolder } from '../../../core/api/generated/schemas/createUploadUrlDtoFolder';
import { MediaUrlService } from '../../../core/media/media-url.service';
import { ToastService } from '../../../core/notification/toast.service';
import { AssetUploadService } from '../../../core/upload/asset-upload.service';

type GalleryTab = 'images' | 'videos';

type MediaTile = {
  id: number;
  key: string;
  url: string;
  kind: 'image' | 'video';
  raw: MediaGalleryItemDto;
};

type PendingUpload = {
  id: string;
  file: File;
  kind: 'image' | 'video';
  previewUrl: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
};

@Component({
  selector: 'app-admin-gallery',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-gallery.component.html',
  styleUrl: './admin-gallery.component.css',
})
export class AdminGalleryComponent implements OnInit, OnDestroy {
  private readonly galleryService = inject(AdminGalleryService);
  private readonly toastService = inject(ToastService);
  private readonly mediaUrlService = inject(MediaUrlService);
  private readonly assetUploadService = inject(AssetUploadService);

  loadingGallery = false;
  galleryError = '';
  savingMedia = false;
  galleryItems = signal<MediaGalleryItemDto[]>([]);

  tab = signal<GalleryTab>('images');
  tilePage = signal(1);
  tilesPerPage = signal(24);
  totalItems = signal<number | null>(null);
  totalPages = signal<number | null>(null);

  dragActive = false;
  uploadProgress = signal<number | null>(null);
  altText = '';
  pendingUploads = signal<PendingUpload[]>([]);

  ngOnInit(): void {
    this.loadGallery();
  }

  ngOnDestroy(): void {
    for (const item of this.pendingUploads()) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }

  get totalTilePages(): number {
    const fromServer = this.totalPages();
    if (typeof fromServer === 'number' && Number.isFinite(fromServer) && fromServer > 0) {
      return fromServer;
    }
    const fromLocal = Math.ceil(this.currentTiles().length / this.tilesPerPage());
    return Math.max(1, fromLocal);
  }

  setTab(tab: GalleryTab): void {
    this.tab.set(tab);
    this.tilePage.set(1);
    this.loadGallery();
  }

  nextTilePage(): void {
    if (this.tilePage() >= this.totalTilePages) return;
    this.tilePage.set(this.tilePage() + 1);
    this.loadGallery();
  }

  prevTilePage(): void {
    if (this.tilePage() <= 1) return;
    this.tilePage.set(this.tilePage() - 1);
    this.loadGallery();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragActive = false;
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragActive = false;

    const files = Array.from(event.dataTransfer?.files ?? []);
    this.addPendingFiles(files);
  }

  async onFilePicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (input) input.value = '';
    this.addPendingFiles(files);
  }

  currentTiles(): MediaTile[] {
    const items = this.galleryItems();
    const tab = this.tab();

    const filtered = items.filter((item) => {
      const kind = this.toKind(item.media_type, item.media_url);
      return tab === 'images' ? kind === 'image' : kind === 'video';
    });

    return filtered.map((item) => {
      const key = String(item.media_url ?? '').trim();
      const kind = this.toKind(item.media_type, item.media_url);
      return {
        id: Number(item.media_asset_id),
        key,
        url: this.mediaUrlService.resolve(key),
        kind,
        raw: item,
      };
    });
  }

  pagedTiles(): MediaTile[] {
    return this.currentTiles();
  }

  async removeTile(tile: MediaTile): Promise<void> {
    const confirmed = globalThis.confirm('Remove this item from the gallery?');
    if (!confirmed) return;

    this.savingMedia = true;
    this.galleryService
      .mediaGalleryControllerRemove(String(tile.id))
      .pipe(finalize(() => (this.savingMedia = false)))
      .subscribe({
        next: () => {
          this.toastService.success('Gallery item removed.');
          this.galleryItems.set(this.galleryItems().filter((item) => Number(item.media_asset_id) !== tile.id));
          const existingTotal = this.totalItems();
          if (typeof existingTotal === 'number' && Number.isFinite(existingTotal)) {
            this.totalItems.set(Math.max(0, existingTotal - 1));
          }
        },
        error: (error) => {
          this.toastService.error(this.getErrorMessage(error, 'Failed to remove gallery item.'));
        },
      });
  }

  async copyMediaUrl(tile: MediaTile): Promise<void> {
    const value = String(tile?.raw?.media_url ?? tile?.key ?? '').trim();
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      this.toastService.success('Copied media url.');
    } catch {
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', 'true');
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      this.toastService.success('Copied media url.');
    }
  }

  removePending(id: string): void {
    const remaining: PendingUpload[] = [];
    for (const item of this.pendingUploads()) {
      if (item.id === id) {
        URL.revokeObjectURL(item.previewUrl);
        continue;
      }
      remaining.push(item);
    }
    this.pendingUploads.set(remaining);
    if (remaining.length === 0) {
      this.uploadProgress.set(null);
    }
  }

  clearPending(): void {
    for (const item of this.pendingUploads()) {
      URL.revokeObjectURL(item.previewUrl);
    }
    this.pendingUploads.set([]);
    this.uploadProgress.set(null);
  }

  async uploadPending(): Promise<void> {
    const pending = this.pendingUploads();
    if (pending.length === 0) return;

    this.savingMedia = true;
    this.galleryError = '';
    this.uploadProgress.set(0);

    const total = pending.length;
    let completed = 0;

    try {
      for (const item of pending) {
        this.markPending(item.id, { status: 'uploading', progress: 0, error: undefined });

        const folder =
          item.kind === 'video'
            ? CreateUploadUrlDtoFolder['product/video']
            : CreateUploadUrlDtoFolder['product/image'];

        const uploaded = await this.assetUploadService.uploadFile(item.file, folder, (p) => {
          this.markPending(item.id, { progress: p });
          const overall = Math.round(((completed * 100 + p) / (total * 100)) * 100);
          this.uploadProgress.set(overall);
        });

        const key = uploaded.key;
        if (!key) {
          throw new Error('Upload succeeded but no key returned.');
        }

        const created = await firstValueFrom(
          this.galleryService.mediaGalleryControllerCreate({
            media_type: item.kind,
            media_url: key,
            alt_text: this.altText.trim() || undefined,
          }),
        );

        this.prependCreated(created?.data);
        completed += 1;
        this.markPending(item.id, { status: 'done', progress: 100 });
        this.uploadProgress.set(Math.round((completed / total) * 100));
      }
    } catch (error) {
      const msg = this.getErrorMessage(error, 'Upload failed.');
      this.toastService.error(msg);
      const firstUploading = this.pendingUploads().find((u) => u.status === 'uploading');
      if (firstUploading) {
        this.markPending(firstUploading.id, { status: 'error', error: msg });
      }
      this.savingMedia = false;
      return;
    } finally {
      this.savingMedia = false;
    }

    this.toastService.success('Uploaded.');
    this.clearPending();
  }

  private getErrorMessage(error: any, fallback: string): string {
    return (
      error?.error?.message ||
      error?.message ||
      fallback
    );
  }

  private loadGallery(onFinally?: () => void): void {
    this.loadingGallery = true;
    this.galleryError = '';

    this.galleryService
      .mediaGalleryControllerList({
        page: this.tilePage(),
        limit: this.tilesPerPage(),
        media_type: this.tab() === 'images' ? 'image' : 'video',
      })
      .pipe(
        finalize(() => {
          this.loadingGallery = false;
          onFinally?.();
        }),
      )
      .subscribe({
        next: (response) => {
          const items = Array.isArray(response?.data) ? response.data : [];
          this.galleryItems.set(items);

          const extracted = this.extractPagination(response?.meta);
          this.totalItems.set(extracted.totalItems);
          this.totalPages.set(extracted.totalPages);

          if (typeof extracted.page === 'number' && extracted.page > 0 && extracted.page !== this.tilePage()) {
            this.tilePage.set(extracted.page);
          }
        },
        error: (error) => {
          this.galleryItems.set([]);
          this.galleryError = this.getErrorMessage(error, 'Failed to load gallery.');
        },
      });
  }

  private toKind(mediaType: unknown, mediaUrl: unknown): 'image' | 'video' {
    const type = String(mediaType ?? '').toLowerCase();
    if (type.includes('video')) return 'video';

    const url = String(mediaUrl ?? '').toLowerCase();
    if (url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.mov')) return 'video';

    return 'image';
  }

  private addPendingFiles(files: File[]): void {
    const valid = files.filter((file) => file && file.size > 0);
    if (valid.length === 0) return;

    const existing = this.pendingUploads();
    const next = [...existing];

    for (const file of valid) {
      const kind = file.type.startsWith('video/') ? 'video' : 'image';
      const previewUrl = URL.createObjectURL(file);
      next.push({
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        file,
        kind,
        previewUrl,
        progress: 0,
        status: 'pending',
      });
    }

    this.pendingUploads.set(next);
    if (next.length > 0 && this.uploadProgress() === null) {
      this.uploadProgress.set(0);
    }
  }

  private markPending(id: string, patch: Partial<Pick<PendingUpload, 'progress' | 'status' | 'error'>>): void {
    this.pendingUploads.set(
      this.pendingUploads().map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  private prependCreated(created: MediaGalleryItemDto): void {
    if (!created) return;

    const isFirstPage = this.tilePage() === 1;
    const desiredKind = this.tab() === 'images' ? 'image' : 'video';
    const createdKind = this.toKind(created.media_type, created.media_url);

    const existingTotal = this.totalItems();
    if (typeof existingTotal === 'number' && Number.isFinite(existingTotal)) {
      this.totalItems.set(existingTotal + 1);
    }

    if (!isFirstPage || createdKind !== desiredKind) {
      return;
    }

    const deduped = this.galleryItems().filter(
      (item) => Number(item.media_asset_id) !== Number(created.media_asset_id),
    );
    const next = [created, ...deduped].slice(0, this.tilesPerPage());
    this.galleryItems.set(next);
  }

  private extractPagination(meta: unknown): {
    totalItems: number | null;
    totalPages: number | null;
    page: number | null;
    limit: number | null;
  } {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      return { totalItems: null, totalPages: null, page: null, limit: null };
    }

    const m = meta as Record<string, unknown>;
    const toNum = (value: unknown): number | null => {
      const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
      return Number.isFinite(n) ? n : null;
    };

    const totalItems =
      toNum(m['total']) ??
      toNum(m['totalItems']) ??
      toNum(m['total_items']) ??
      toNum(m['count']) ??
      null;

    const page =
      toNum(m['page']) ??
      toNum(m['currentPage']) ??
      toNum(m['current_page']) ??
      null;

    const limit =
      toNum(m['limit']) ??
      toNum(m['perPage']) ??
      toNum(m['per_page']) ??
      toNum(m['pageSize']) ??
      null;

    const totalPages =
      toNum(m['totalPages']) ??
      toNum(m['total_pages']) ??
      toNum(m['lastPage']) ??
      toNum(m['last_page']) ??
      (totalItems !== null && limit ? Math.ceil(totalItems / limit) : null);

    return { totalItems, totalPages, page, limit };
  }
}
