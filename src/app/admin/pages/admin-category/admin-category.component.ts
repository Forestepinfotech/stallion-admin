import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
type CategoryItem = {
  id: number;
  name: string;
  image?: string | null;
  imageName?: string | null;
};

@Component({
  selector: 'app-admin-category',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-category.component.html',
  styleUrl: './admin-category.component.css',
})
export class AdminCategoryComponent {
  categories: CategoryItem[] = [
    { id: 1, name: 'Tires', image: null, imageName: null },
    { id: 2, name: 'Wheels', image: null, imageName: null },
    { id: 3, name: 'Tonneau Covers', image: null, imageName: null },
  ];

  categoryModalOpen = false;
  categoryMode: 'create' | 'edit' = 'create';
  editingCategoryId: number | null = null;

  selectedCategoryImageFile: File | null = null;
  selectedCategoryImageName = '';
  categoryImagePreview: string | null = null;

  categoryForm: FormGroup;

  constructor(private fb: FormBuilder) {
    this.categoryForm = this.fb.group({
      name: ['', Validators.required],
    });
  }

  invalid(form: FormGroup, controlName: string): boolean {
    const control = form.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  openCreateCategory(): void {
    this.categoryMode = 'create';
    this.editingCategoryId = null;

    this.categoryForm.reset({
      name: '',
    });

    this.selectedCategoryImageFile = null;
    this.selectedCategoryImageName = '';
    this.categoryImagePreview = null;

    this.categoryModalOpen = true;
  }

  openEditCategory(category: CategoryItem): void {
    this.categoryMode = 'edit';
    this.editingCategoryId = category.id;

    this.categoryForm.patchValue({
      name: category.name,
    });

    this.selectedCategoryImageFile = null;
    this.selectedCategoryImageName = category.imageName || '';
    this.categoryImagePreview = category.image || null;

    this.categoryModalOpen = true;
  }

  closeCategoryModal(): void {
    this.categoryModalOpen = false;
  }

  onCategoryImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;

    if (!file) return;

    this.selectedCategoryImageFile = file;
    this.selectedCategoryImageName = file.name;

    const reader = new FileReader();
    reader.onload = () => {
      this.categoryImagePreview = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  removeCategoryImage(): void {
    this.selectedCategoryImageFile = null;
    this.selectedCategoryImageName = '';
    this.categoryImagePreview = null;
  }

  saveCategory(): void {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    const payload: CategoryItem = {
      id: this.editingCategoryId ?? Date.now(),
      name: (this.categoryForm.value['name'] || '').trim(),
      image: this.categoryImagePreview || null,
      imageName: this.selectedCategoryImageName || null,
    };

    if (this.categoryMode === 'create') {
      this.categories.unshift(payload);
    } else {
      this.categories = this.categories.map((item) =>
        item.id === this.editingCategoryId ? payload : item,
      );
    }

    this.closeCategoryModal();
  }

  deleteCategory(category: CategoryItem): void {
    const ok = confirm(`Delete "${category.name}"?`);
    if (!ok) return;

    this.categories = this.categories.filter((item) => item.id !== category.id);
  }
}