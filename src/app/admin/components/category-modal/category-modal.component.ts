import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type {
  CreateProductCategoryDto,
  ProductCategoryResponseDto,
} from '../../../core/api/generated/schemas';

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

  readonly categoryForm;

  constructor(private readonly fb: FormBuilder) {
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

  submit(): void {
    if (this.categoryForm.invalid || this.saving) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    const value = this.categoryForm.getRawValue();
    this.save.emit({
      category_name: String(value.category_name).trim(),
      category_image: String(value.category_image ?? '').trim(),
      is_active: Boolean(value.is_active),
      is_deleted: false,
    });
  }

  async onCategoryImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.warning.emit('Please select an image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      this.warning.emit('Image must be 2MB or smaller.');
      return;
    }

    try {
      const base64 = await this.fileToBase64(file);
      this.categoryForm.patchValue({ category_image: base64 });
    } catch {
      this.error.emit('Failed to read the selected image.');
    }
  }

  removeCategoryImage(): void {
    this.categoryForm.patchValue({ category_image: '' });
  }

  private resetForm(): void {
    this.categoryForm.reset({
      category_name: this.mode === 'edit' ? this.category?.category_name ?? '' : '',
      is_active: this.mode === 'edit' ? this.category?.is_active ?? true : true,
      category_image:
        this.mode === 'edit' ? this.category?.category_image ?? '' : '',
    });
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
