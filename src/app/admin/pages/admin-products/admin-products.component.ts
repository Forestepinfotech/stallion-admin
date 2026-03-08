import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

type ProductType = 'tire' | 'rim' | 'cover';

type Brand = { id: string; name: string };
type Model = { id: string; brandId: string; name: string };
@Component({
  selector: 'app-admin-products',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-products.component.html',
  styleUrl: './admin-products.component.css',
})
export class AdminProductsComponent {
  // demo brand/model data (replace with backend later)
  brands: Brand[] = [
    { id: 'b1', name: 'Michelin' },
    { id: 'b2', name: 'Bridgestone' },
    { id: 'b3', name: 'Goodyear' },
  ];

  models: Model[] = [
    { id: 'm1', brandId: 'b1', name: 'Pilot Sport 4' },
    { id: 'm2', brandId: 'b1', name: 'Primacy 4' },
    { id: 'm3', brandId: 'b2', name: 'Turanza T005' },
    { id: 'm4', brandId: 'b2', name: 'Potenza S007A' },
    { id: 'm5', brandId: 'b3', name: 'Eagle F1' },
  ];

  // UI
  saving = false;

  // IMPORTANT: build in constructor to avoid "fb used before init"
  form;

  constructor(
    private fb: FormBuilder,
    private router: Router,
  ) {
    this.form = this.fb.group({
      productType: ['tire' as ProductType, Validators.required],

      // common fields
      sku: ['', [Validators.required, Validators.minLength(3)]],
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: ['', [Validators.required, Validators.minLength(10)]],
      price: [0, [Validators.required, Validators.min(0)]],
      status: ['Active', Validators.required],
      imageUrl: [''],

      // tire selects
      brandId: [''],
      modelId: [''],

      // attributes (store as group)
      attrs: this.fb.group({
        // tire
        width: [''], // e.g. 205
        aspect: [''], // e.g. 55
        diameter: [''], // e.g. 16
        season: [''], // Summer/Winter/All-season
        loadIndex: [''], // e.g. 91
        speedRating: [''], // e.g. V

        // rim
        rimSize: [''], // e.g. 17x7.5
        boltPattern: [''], // e.g. 5x114.3
        offset: [''], // e.g. +35
        material: [''], // Alloy/Steel

        // cover
        coverSize: [''], // e.g. 16"
        coverMaterial: [''], // Plastic/ABS
        color: [''], // Black/Silver
      }),
    });

    // reset dependent selects when type changes
    this.form
      .get('productType')!
      .valueChanges.subscribe((type: ProductType|null) => {
        if (type !== 'tire') {
          this.form.patchValue({ brandId: '', modelId: '' });
        }
      });

    // reset model when brand changes
    this.form.get('brandId')!.valueChanges.subscribe(() => {
      this.form.patchValue({ modelId: '' });
    });
  }

  get productType(): ProductType {
    return this.form.get('productType')!.value as ProductType;
  }

  get availableModels(): Model[] {
    const brandId = this.form.get('brandId')!.value as string;
    return this.models.filter((m) => m.brandId === brandId);
  }

  goBack() {
    this.router.navigateByUrl('/admin/dashboard');
  }

  async onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) return;

    const base64 = await this.fileToBase64(file);
    this.form.patchValue({ imageUrl: base64 });
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.form.getRawValue();

    // Example: enforce tire brand/model
    if (
      payload.productType === 'tire' &&
      (!payload.brandId || !payload.modelId)
    ) {
      alert('Please select tire Brand and Model.');
      return;
    }

    console.log('PRODUCT PAYLOAD:', payload);
    alert('Product saved (demo). Connect to backend API next.');
  }
}