import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { finalize } from 'rxjs';
import { AdminCarBrandService as CarBrandService } from '../../../core/api/generated/admin-car-brand/admin-car-brand.service';
import type {
  CarBrandResponseDto,
  CreateCarBrandDto,
  UpdateCarBrandDto,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';

type BrandStatusFilter = 'All' | 'Active' | 'Inactive';

@Component({
  selector: 'app-admin-carbrand',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './admin-carbrand.component.html',
  styleUrl: './admin-carbrand.component.css',
})
export class AdminCarbrandComponent implements OnInit {
  readonly statusOptions: BrandStatusFilter[] = ['All', 'Active', 'Inactive'];
  imageDragActive = false;

  query = '';
  statusFilter: BrandStatusFilter = 'All';
  appliedQuery = '';
  appliedStatusFilter: BrandStatusFilter = 'All';

  items: CarBrandResponseDto[] = [];
  filteredItems: CarBrandResponseDto[] = [];

  loading = true;
  loadError: string | null = null;
  saving = false;
  deleting = false;
  page = 1;
  pageSize = 50;
  readonly pageSizeOptions = [20, 50, 100];

  modalOpen = false;
  confirmOpen = false;
  mode: 'create' | 'edit' = 'create';
  selected: CarBrandResponseDto | null = null;

  readonly form;

  constructor(
    private readonly fb: FormBuilder,
    private readonly carBrandService: CarBrandService,
    private readonly toastService: ToastService,
  ) {
    this.form = this.fb.group({
      car_brand_name: ['', [Validators.required, Validators.minLength(2)]],
      brand_url: [''],
      is_active: [true, [Validators.required]],
      brand_image: [''],
    });
  }

  ngOnInit(): void {
    this.loadBrands();
  }

  get totalCount(): number {
    return this.filteredItems.length;
  }

  get activeCount(): number {
    return this.filteredItems.filter((item) => item.is_active).length;
  }

  get inactiveCount(): number {
    return this.filteredItems.filter((item) => !item.is_active).length;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredItems.length / this.pageSize));
  }

  get paginatedItems(): CarBrandResponseDto[] {
    const start = (this.page - 1) * this.pageSize;
    return this.filteredItems.slice(start, start + this.pageSize);
  }

  applyFilters(): void {
    this.appliedQuery = this.query.trim().toLowerCase();
    this.appliedStatusFilter = this.statusFilter;
    this.filteredItems = this.items.filter((item) => {
      const matchesQuery =
        !this.appliedQuery ||
        item.car_brand_name.toLowerCase().includes(this.appliedQuery) ||
        item.brand_url.toLowerCase().includes(this.appliedQuery);

      const matchesStatus =
        this.appliedStatusFilter === 'All'
          ? true
          : item.is_active === (this.appliedStatusFilter === 'Active');

      return matchesQuery && matchesStatus;
    });
    this.page = 1;
  }

  resetFilters(): void {
    this.query = '';
    this.statusFilter = 'All';
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
    this.selected = null;
    this.form.reset({
      car_brand_name: '',
      brand_url: '',
      is_active: true,
      brand_image: '',
    });
    this.modalOpen = true;
  }

  openEdit(item: CarBrandResponseDto): void {
    this.mode = 'edit';
    this.selected = item;
    this.form.reset({
      car_brand_name: item.car_brand_name,
      brand_url: item.brand_url ?? '',
      is_active: item.is_active,
      brand_image: item.brand_image ?? '',
    });
    this.modalOpen = true;
  }

  closeModal(): void {
    if (this.saving) {
      return;
    }

    this.modalOpen = false;
    this.selected = null;
  }

  openDelete(item: CarBrandResponseDto): void {
    this.selected = item;
    this.confirmOpen = true;
  }

  closeConfirm(): void {
    if (this.deleting) {
      return;
    }

    this.confirmOpen = false;
    this.selected = null;
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload: CreateCarBrandDto = {
      car_brand_name: String(value.car_brand_name).trim(),
      brand_url: String(value.brand_url ?? '').trim(),
      brand_image: String(value.brand_image ?? '').trim(),
      is_active: Boolean(value.is_active),
      is_deleted: false,
    };

    this.saving = true;

    const request =
      this.mode === 'create'
        ? this.carBrandService.carBrandControllerCreate(payload)
        : this.carBrandService.carBrandControllerUpdate(
            String(this.selected?.car_brand_id),
            this.toUpdatePayload(payload),
          );

    request.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.toastService.success(
          this.mode === 'create'
            ? 'Car brand created successfully.'
            : 'Car brand updated successfully.',
        );
        this.modalOpen = false;
        this.selected = null;
        this.loadBrands();
      },
      error: (error) => {
        this.toastService.error(
          this.getErrorMessage(error, 'Failed to save car brand.'),
        );
      },
    });
  }

  confirmDelete(): void {
    if (!this.selected || this.deleting) {
      return;
    }

    this.deleting = true;
    this.carBrandService
      .carBrandControllerRemove(String(this.selected.car_brand_id))
      .pipe(finalize(() => (this.deleting = false)))
      .subscribe({
        next: () => {
          this.toastService.success('Car brand deleted successfully.');
          this.confirmOpen = false;
          this.selected = null;
          this.loadBrands();
        },
        error: (error) => {
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to delete car brand.'),
          );
        },
      });
  }

  async onImageChange(event: Event): Promise<void> {
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

    if (file.size > 2 * 1024 * 1024) {
      this.toastService.warning('Image must be 2MB or smaller.');
      return;
    }

    try {
      const base64 = await this.fileToBase64(file);
      this.form.patchValue({ brand_image: base64 });
    } catch {
      this.toastService.error('Failed to read the selected image.');
    }
  }

  clearImage(): void {
    this.form.patchValue({ brand_image: '' });
  }

  isInvalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.get(name);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  trackByBrandId(_: number, item: CarBrandResponseDto): number {
    return item.car_brand_id;
  }

  retryLoad(): void {
    this.loadBrands();
  }

  private loadBrands(): void {
    this.loading = true;
    this.loadError = null;
    this.carBrandService
      .carBrandControllerList()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.items = response.data ?? [];
          this.applyFilters();
        },
        error: (error) => {
          this.items = [];
          this.filteredItems = [];
          this.loadError = this.getErrorMessage(error, 'Failed to load car brands.');
          this.toastService.error(this.loadError);
        },
      });
  }

  private toUpdatePayload(payload: CreateCarBrandDto): UpdateCarBrandDto {
    return {
      car_brand_name: payload.car_brand_name,
      brand_url: payload.brand_url,
      brand_image: payload.brand_image,
      is_active: payload.is_active,
      is_deleted: payload.is_deleted,
    };
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
