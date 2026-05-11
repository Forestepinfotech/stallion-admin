import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type {
  CreateProductCategoryDto,
  ProductCategoryResponseDto,
} from '../../../core/api/generated/schemas';
import { MediaUrlService } from '../../../core/media/media-url.service';
import { AssetUploadService } from '../../../core/upload/asset-upload.service';

@Component({
  selector: 'app-category-modal',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './category-modal.component.html',
})
export class CategoryModalComponent implements OnChanges {
  @Input() open = false;
  @Input() saving = false;
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() category: ProductCategoryResponseDto | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<CreateProductCategoryDto>();
  @Output() warning = new EventEmitter<string>();
  @Output() error = new EventEmitter<string>();

  imageDragActive = false;
  imageUploadProgress: number | null = null;
  private pendingCategoryImageFile: File | null = null;
  private pendingCategoryImagePreviewUrl: string | null = null;

  readonly categoryForm;

  constructor(
    private readonly fb: FormBuilder,
    private readonly assetUploadService: AssetUploadService,
    private readonly mediaUrlService: MediaUrlService,
  ) {
    this.categoryForm = this.fb.group({
      category_name: ['', [Validators.required, Validators.minLength(2)]],
      is_active: [true, [Validators.required]],
      category_image: [''],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.open) {
      return;
    }

    if (changes['open'] || changes['mode'] || changes['category']) {
      this.resetForm();
    }
  }

  invalid(controlName: keyof typeof this.categoryForm.controls): boolean {
    const control = this.categoryForm.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  requestClose(): void {
    if (this.saving) {
      return;
    }

    this.close.emit();
  }

  async submit(): Promise<void> {
    if (this.categoryForm.invalid || this.saving) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    try {
      let categoryImage = this.mediaUrlService.toStoredValue(this.categoryForm.get('category_image')?.value);

      if (this.pendingCategoryImageFile) {
        this.imageUploadProgress = 0;
        const uploaded = await this.assetUploadService.uploadFile(
          this.pendingCategoryImageFile,
          'category',
          (progress) => {
            this.imageUploadProgress = progress;
          },
        );
        categoryImage = uploaded.endpoint;
      }

      const value = this.categoryForm.getRawValue();
      this.save.emit({
        category_name: String(value.category_name).trim(),
        category_image: categoryImage,
        is_active: Boolean(value.is_active),
        is_deleted: false,
      });
    } catch {
      this.error.emit('Failed to upload the selected image.');
    } finally {
      this.imageUploadProgress = null;
    }
  }

  async onCategoryImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    await this.applyCategoryImage(file);
  }

  onCategoryImageDragOver(event: DragEvent): void {
    event.preventDefault();
    this.imageDragActive = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onCategoryImageDragLeave(event: DragEvent): void {
    if (event.currentTarget === event.target) {
      this.imageDragActive = false;
    }
  }

  async onCategoryImageDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.imageDragActive = false;
    const file = event.dataTransfer?.files?.[0];
    await this.applyCategoryImage(file);
  }

  private async applyCategoryImage(file: File | undefined): Promise<void> {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.warning.emit('Please select an image file.');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      this.warning.emit('Image must be 50MB or smaller.');
      return;
    }

    this.revokePendingCategoryImagePreview();
    const previewUrl = URL.createObjectURL(file);
    this.pendingCategoryImageFile = file;
    this.pendingCategoryImagePreviewUrl = previewUrl;
    this.categoryForm.patchValue({ category_image: previewUrl });
  }

  removeCategoryImage(): void {
    this.pendingCategoryImageFile = null;
    this.revokePendingCategoryImagePreview();
    this.categoryForm.patchValue({ category_image: '' });
  }

  private resetForm(): void {
    this.pendingCategoryImageFile = null;
    this.revokePendingCategoryImagePreview();
    this.categoryForm.reset({
      category_name: this.mode === 'edit' ? this.category?.category_name ?? '' : '',
      is_active: this.mode === 'edit' ? this.category?.is_active ?? true : true,
      category_image:
        this.mode === 'edit' ? this.mediaUrlService.resolve(this.category?.category_image) : '',
    });
  }

  private revokePendingCategoryImagePreview(): void {
    if (this.pendingCategoryImagePreviewUrl) {
      URL.revokeObjectURL(this.pendingCategoryImagePreviewUrl);
      this.pendingCategoryImagePreviewUrl = null;
    }
  }

}
