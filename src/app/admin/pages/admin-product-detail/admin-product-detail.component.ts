import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminProductsService as ProductsService } from '../../../core/api/generated/admin-products/admin-products.service';
import type { ProductDetailDto } from '../../../core/api/generated/schemas';
import { MediaUrlService } from '../../../core/media/media-url.service';
import { ToastService } from '../../../core/notification/toast.service';

type AttributeEntry = {
  key: string;
  value: string;
};

type SpecificationEntry = {
  label: string;
  value: string;
};

type MediaEntry = {
  type: 'image' | 'video';
  url: string;
};

function toDisplayString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toBooleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value === 'true';
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  return false;
}

@Component({
  selector: 'app-admin-product-detail',
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-product-detail.component.html',
  styleUrl: './admin-product-detail.component.css',
})
export class AdminProductDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly productsService = inject(ProductsService);
  private readonly toastService = inject(ToastService);
  private readonly mediaUrlService = inject(MediaUrlService);

  loading = false;
  loadError = signal<string | null>(null);
  product = signal<ProductDetailDto | null>(null);
  productId: string | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.toastService.error('Product id is missing.');
      return;
    }

    this.productId = id;
    this.loadProduct(id);
  }

  retry(): void {
    if (!this.productId) return;
    this.loadProduct(this.productId);
  }

  get attributeEntries(): AttributeEntry[] {
    const source = this.product()?.attributes;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return [];
    }

    return Object.entries(source as Record<string, unknown>)
      .map(([key, value]) => ({
        key: this.toLabel(key),
        value: this.formatUnknown(value),
      }))
      .filter((entry) => entry.value);
  }

  get specificationEntries(): SpecificationEntry[] {
    const specifications = this.product()?.specifications ?? [];

    return specifications
      .map((item) => {
        const record = item as Record<string, unknown>;
        const label =
          toDisplayString(record['label']) ||
          toDisplayString(record['name']) ||
          this.toLabel(toDisplayString(record['code']) || 'Specification');
        const value =
          toDisplayString(record['value']) ||
          this.formatUnknown(record['values']) ||
          this.formatUnknown(record['display_value']);

        return { label, value };
      })
      .filter((entry) => entry.value);
  }

  get breadcrumbs(): string[] {
    return (this.product()?.breadcrumbs ?? [])
      .map((item) => {
        const record = item as Record<string, unknown>;
        return (
          toDisplayString(record['name']) ||
          toDisplayString(record['label']) ||
          toDisplayString(record['title'])
        );
      })
      .filter(Boolean);
  }

  get galleryImages(): string[] {
    const detail = this.product();
    if (!detail) {
      return [];
    }

    const mediaImages = (detail.media ?? [])
      .map((item) => item as Record<string, unknown>)
      .filter((item) => toDisplayString(item['type']).toLowerCase() === 'image')
      .map((item) => this.mediaUrlService.resolve(item['url']))
      .filter(Boolean);

    const galleryImages = Array.isArray(detail.gallery_images)
      ? detail.gallery_images
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map((item) => this.mediaUrlService.resolve(item))
      : [];

    return Array.from(new Set([...mediaImages, ...galleryImages]));
  }

  get videoItems(): string[] {
    const detail = this.product();
    if (!detail) {
      return [];
    }

    const mediaVideos = (detail.media ?? [])
      .map((item) => item as Record<string, unknown>)
      .filter((item) => toDisplayString(item['type']).toLowerCase() === 'video')
      .map((item) => this.mediaUrlService.resolve(item['url']))
      .filter(Boolean);

    const videoUrls = Array.isArray(detail.video_urls)
      ? detail.video_urls
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map((item) => this.mediaUrlService.resolve(item))
      : [];

    return Array.from(new Set([...mediaVideos, ...videoUrls]));
  }

  get thumbnailImageSrc(): string {
    return this.mediaUrlService.resolve(this.product()?.thumbnail_image);
  }

  formatMoney(value: unknown, currency: unknown): string {
    const numeric = toNumberValue(value);
    if (numeric === null) {
      return '—';
    }

    const code = toDisplayString(currency) || 'CAD';

    try {
      return new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: code,
        maximumFractionDigits: 2,
      }).format(numeric);
    } catch {
      return `${code} ${numeric.toFixed(2)}`;
    }
  }

  formatNumber(value: unknown): string {
    const numeric = toNumberValue(value);
    return numeric === null ? '—' : String(numeric);
  }

  formatText(value: unknown): string {
    return toDisplayString(value) || '—';
  }

  formatDate(value: unknown): string {
    const raw = toDisplayString(value);
    if (!raw) {
      return '—';
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString('en-CA');
  }

  isTruthy(value: unknown): boolean {
    return toBooleanValue(value);
  }

  isVideo(url: string): boolean {
    return /^data:video\//.test(url) || /\.(mp4|webm|ogg|mov)$/i.test(url);
  }

  private loadProduct(id: string): void {
    this.loading = true;
    this.loadError.set(null);
    this.productsService
      .productsControllerGet(id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.product.set(response.data);
        },
        error: (error) => {
          this.product.set(null);
          const message = this.getErrorMessage(error, 'Failed to load product details.');
          this.loadError.set(message);
          this.toastService.error(message);
        },
      });
  }

  private formatUnknown(value: unknown): string {
    if (Array.isArray(value)) {
      return value.map((item) => this.formatUnknown(item)).filter(Boolean).join(', ');
    }

    if (value && typeof value === 'object') {
      const text = Object.values(value as Record<string, unknown>)
        .map((item) => this.formatUnknown(item))
        .filter(Boolean)
        .join(' ');
      return text.trim();
    }

    return toDisplayString(value);
  }

  private toLabel(value: string): string {
    return value
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null) {
      const message = (error as { error?: { message?: unknown } }).error?.message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    return fallback;
  }
}
