import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { finalize } from 'rxjs';
import { AdminCarBrandService as CarBrandService } from '../../../core/api/generated/admin-car-brand/admin-car-brand.service';
import { AdminCarBrandModelService as CarBrandModelService } from '../../../core/api/generated/admin-car-brand-model/admin-car-brand-model.service';
import type {
  CarBrandModelControllerListSortBy,
  CarBrandResponseDto,
  CarBrandModelResponseDto,
  CreateCarBrandModelDto,
  UpdateCarBrandModelDto,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';
import { AssetUploadService } from '../../../core/upload/asset-upload.service';

type ModelStatusFilter = 'All' | 'Active' | 'Inactive';

@Component({
  selector: 'app-admin-carmodel',
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './admin-carmodel.component.html',
  styleUrl: './admin-carmodel.component.css',
})
export class AdminCarmodelComponent implements OnInit, OnDestroy {
  readonly statusOptions: ModelStatusFilter[] = ['All', 'Active', 'Inactive'];
  imageDragActive = false;

  query = '';
  sortBy: CarBrandModelControllerListSortBy = 'newest';
  filterStatus: ModelStatusFilter = 'All';
  filterBrandId = '';
  dateFrom = '';
  dateTo = '';

  appliedQuery = '';
  appliedSortBy: CarBrandModelControllerListSortBy = 'newest';
  appliedFilterStatus: ModelStatusFilter = 'All';
  appliedFilterBrandId = '';
  appliedDateFrom = '';
  appliedDateTo = '';

  modalOpen = false;
  confirmOpen = false;
  mode: 'create' | 'edit' = 'create';
  selectedId: number | null = null;

  loading = false;
  loadError: string | null = null;
  saving = false;
  deleting = false;
  brandsLoading = false;
  imageUploadProgress: number | null = null;
  private pendingImageFile: File | null = null;
  private pendingImagePreviewUrl: string | null = null;
  page = 1;
  pageSize = 50;
  readonly pageSizeOptions = [20, 50, 100];

  items: CarBrandModelResponseDto[] = [];
  brands: CarBrandResponseDto[] = [];

  readonly form;

  constructor(
    private readonly fb: FormBuilder,
    private readonly carBrandModelService: CarBrandModelService,
    private readonly carBrandService: CarBrandService,
    private readonly toastService: ToastService,
    private readonly assetUploadService: AssetUploadService,
  ) {
    this.form = this.fb.group({
      car_brand_id: [null as number | null, [Validators.required]],
      model_name: ['', [Validators.required, Validators.minLength(2)]],
      model_engine: ['', [Validators.required, Validators.minLength(2)]],
      is_active: [true, [Validators.required]],
      model_image: [''],
    });
  }

  ngOnInit(): void {
    this.loadBrands();
    this.loadModels();
  }

  ngOnDestroy(): void {}

  get totalCount(): number {
    return this.items.length;
  }

  get activeCount(): number {
    return this.items.filter((item) => item.is_active).length;
  }

  get inactiveCount(): number {
    return this.items.filter((item) => !item.is_active).length;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.items.length / this.pageSize));
  }

  get paginatedItems(): CarBrandModelResponseDto[] {
    const start = (this.page - 1) * this.pageSize;
    return this.items.slice(start, start + this.pageSize);
  }

  applyFilters(): void {
    if (this.dateFrom && this.dateTo && this.dateFrom > this.dateTo) {
      this.toastService.warning('From date must be earlier than To date.');
      return;
    }

    this.appliedQuery = this.query.trim();
    this.appliedSortBy = this.sortBy;
    this.appliedFilterStatus = this.filterStatus;
    this.appliedFilterBrandId = this.filterBrandId;
    this.appliedDateFrom = this.dateFrom;
    this.appliedDateTo = this.dateTo;
    this.page = 1;
    this.loadModels();
  }

  resetFilters(): void {
    this.query = '';
    this.sortBy = 'newest';
    this.filterStatus = 'All';
    this.filterBrandId = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.applyFilters();
  }

  changePageSize(size: number): void {
    this.pageSize = Number(size) || 50;
    this.page = 1;
  }

  prevPage(): void {
    if (this.page > 1) {
      this.page -= 1;
    }
  }

  nextPage(): void {
    if (this.page < this.totalPages) {
      this.page += 1;
    }
  }

  openCreate(): void {
    this.mode = 'create';
    this.selectedId = null;
    this.clearPendingImageState();
    this.form.reset({
      car_brand_id: null,
      model_name: '',
      model_engine: '',
      is_active: true,
      model_image: '',
    });
    this.modalOpen = true;
  }

  openEdit(item: CarBrandModelResponseDto): void {
    this.mode = 'edit';
    this.selectedId = item.model_id;
    this.clearPendingImageState();
    this.form.reset({
      car_brand_id: item.car_brand_id,
      model_name: item.model_name,
      model_engine: item.model_engine,
      is_active: item.is_active,
      model_image: item.model_image ?? '',
    });
    this.modalOpen = true;
  }

  closeModal(): void {
    if (this.saving) {
      return;
    }

    this.modalOpen = false;
  }

  openDelete(item: CarBrandModelResponseDto): void {
    this.selectedId = item.model_id;
    this.confirmOpen = true;
  }

  closeConfirm(): void {
    if (this.deleting) {
      return;
    }

    this.confirmOpen = false;
    this.selectedId = null;
  }

  confirmDelete(): void {
    if (this.selectedId == null || this.deleting) {
      return;
    }

    this.deleting = true;
    this.carBrandModelService
      .carBrandModelControllerRemove(String(this.selectedId))
      .pipe(finalize(() => (this.deleting = false)))
      .subscribe({
        next: () => {
          this.confirmOpen = false;
          this.selectedId = null;
          this.toastService.success('Car model deleted successfully.');
          this.loadModels();
        },
        error: (error) => {
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to delete car model.'),
          );
        },
      });
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    let modelImage = String(this.form.get('model_image')?.value ?? '').trim();

    try {
      if (this.pendingImageFile) {
        this.imageUploadProgress = 0;
        const uploaded = await this.assetUploadService.uploadFile(this.pendingImageFile, 'category', (progress) => {
          this.imageUploadProgress = progress;
        });
        modelImage = uploaded.endpoint;
      }
    } catch (error) {
      this.toastService.error(
        this.getErrorMessage(error, 'Failed to upload the selected image.'),
      );
      this.imageUploadProgress = null;
      return;
    }

    const rawValue = this.form.getRawValue();
    const payload: CreateCarBrandModelDto = {
      car_brand_id: Number(rawValue.car_brand_id),
      model_name: String(rawValue.model_name).trim(),
      model_engine: String(rawValue.model_engine).trim(),
      model_image: modelImage,
      is_active: Boolean(rawValue.is_active),
      is_deleted: false,
    };

    this.saving = true;

    const request =
      this.mode === 'create'
        ? this.carBrandModelService.carBrandModelControllerCreate(payload)
        : this.carBrandModelService.carBrandModelControllerUpdate(
            String(this.selectedId),
            this.toUpdatePayload(payload),
          );

    request.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.clearPendingImageState();
        this.toastService.success(
          this.mode === 'create'
            ? 'Car model created successfully.'
            : 'Car model updated successfully.',
        );
        this.modalOpen = false;
        this.selectedId = null;
        this.loadModels();
      },
      error: (error) => {
        this.imageUploadProgress = null;
        this.toastService.error(
          this.getErrorMessage(error, 'Failed to save car model.'),
        );
      },
    });
  }

  async onFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    await this.applyImage(file);
  }

  onImageDragOver(event: DragEvent): void {
    event.preventDefault();
    this.imageDragActive = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onImageDragLeave(event: DragEvent): void {
    if (event.currentTarget === event.target) {
      this.imageDragActive = false;
    }
  }

  async onImageDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.imageDragActive = false;
    await this.applyImage(event.dataTransfer?.files?.[0]);
  }

  private async applyImage(file: File | undefined): Promise<void> {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.toastService.warning('Please select an image file.');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      this.toastService.warning('Image must be 50MB or smaller.');
      return;
    }

    this.revokePendingImagePreview();
    const previewUrl = URL.createObjectURL(file);
    this.pendingImageFile = file;
    this.pendingImagePreviewUrl = previewUrl;
    this.form.patchValue({ model_image: previewUrl });
  }

  clearImage(): void {
    this.clearPendingImageState();
    this.form.patchValue({ model_image: '' });
  }

  isInvalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.get(name);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  trackByModelId(_: number, item: CarBrandModelResponseDto): number {
    return item.model_id;
  }

  retryLoad(): void {
    this.loadModels();
  }

  getBrandName(brandId: number): string {
    return (
      this.brands.find((brand) => brand.car_brand_id === brandId)
        ?.car_brand_name ?? 'Unknown Brand'
    );
  }

  private loadBrands(): void {
    this.brandsLoading = true;
    this.carBrandService
      .carBrandControllerList()
      .pipe(finalize(() => (this.brandsLoading = false)))
      .subscribe({
        next: (response) => {
          this.brands = response.data ?? [];
        },
        error: (error) => {
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to load car brands.'),
          );
        },
      });
  }

  private loadModels(): void {
    this.loading = true;
    this.loadError = null;
    this.carBrandModelService
      .carBrandModelControllerList({
        page: 1,
        limit: 100,
        search: this.appliedQuery || undefined,
        car_brand_id: this.appliedFilterBrandId
          ? Number(this.appliedFilterBrandId)
          : undefined,
        is_active: this.toStatusFilter(this.appliedFilterStatus),
        dateFrom: this.appliedDateFrom || undefined,
        dateTo: this.appliedDateTo || undefined,
        sortBy: this.appliedSortBy,
      })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.items = response.data ?? [];
          this.page = Math.min(this.page, this.totalPages);
        },
        error: (error) => {
          this.items = [];
          this.loadError = this.getErrorMessage(error, 'Failed to load car models.');
          this.toastService.error(this.loadError);
        },
      });
  }

  private toUpdatePayload(
    payload: CreateCarBrandModelDto,
  ): UpdateCarBrandModelDto {
    return {
      car_brand_id: payload.car_brand_id,
      model_name: payload.model_name,
      model_engine: payload.model_engine,
      model_image: payload.model_image,
      is_active: payload.is_active,
      is_deleted: payload.is_deleted,
    };
  }

  private toStatusFilter(value: ModelStatusFilter): boolean | undefined {
    if (value === 'All') {
      return undefined;
    }

    return value === 'Active';
  }

  private clearPendingImageState(): void {
    this.pendingImageFile = null;
    this.imageUploadProgress = null;
    this.revokePendingImagePreview();
  }

  private revokePendingImagePreview(): void {
    if (this.pendingImagePreviewUrl) {
      URL.revokeObjectURL(this.pendingImagePreviewUrl);
      this.pendingImagePreviewUrl = null;
    }
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'message' in error.error
    ) {
      const message = error.error.message;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message) && message.length > 0) {
        return String(message[0]);
      }
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return error.message;
    }

    return fallback;
  }
}
