import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

type ProductType = 'Tire' | 'Rim' | 'Cover';

type Brand = { id: string; name: string };
type CarModel = { id: string; brandId: string; name: string; year: number };

type Product = {
  id: string;
  type: ProductType;
  brandId: string;
  modelId: string;
  name: string;
  sku: string;
};

type Attribute = {
  id: string;
  name: string; // e.g. "Size"
  group: ProductType; // Tire / Rim / Cover
  values: string[]; // e.g. ["205/55R16","225/45R17"]
};
type CategoryItem = {
  id: number;
  name: string;
  image?: string | null;
  imageName?: string | null;
};

type ProductAttributeMap = {
  productId: string;
  attributeIds: string[];
};
@Component({
  selector: 'app-admin-attributes',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-attributes.component.html',
  styleUrl: './admin-attributes.component.css',
})
export class AdminAttributesComponent {
  // ===== Mock master data (replace with backend) =====
  brands: Brand[] = [
    { id: 'b1', name: 'Toyota' },
    { id: 'b2', name: 'Honda' },
  ];

  models: CarModel[] = [
    { id: 'm1', brandId: 'b1', name: 'Corolla', year: 2022 },
    { id: 'm2', brandId: 'b1', name: 'Camry', year: 2023 },
    { id: 'm3', brandId: 'b2', name: 'Civic', year: 2022 },
  ];

  products: Product[] = [
    {
      id: 'p1',
      type: 'Tire',
      brandId: 'b1',
      modelId: 'm1',
      name: 'Michelin 205/55R16',
      sku: 'TIRE-20555R16-MIC',
    },
    {
      id: 'p2',
      type: 'Rim',
      brandId: 'b1',
      modelId: 'm2',
      name: 'Alloy Rim 17x7.5',
      sku: 'RIM-17X75-AL',
    },
    {
      id: 'p3',
      type: 'Cover',
      brandId: 'b2',
      modelId: 'm3',
      name: 'Wheel Cover 16" Black',
      sku: 'COV-16-BLK',
    },
  ];
  categories: CategoryItem[] = [];
  // category modal
  categoryModalOpen = false;
  categoryMode: 'create' | 'edit' = 'create';
  editingCategoryId: number | null = null;

  // image upload
  selectedCategoryImageFile: File | null = null;
  selectedCategoryImageName = '';
  categoryImagePreview: string | null = null;
  categoryForm: FormGroup;
  attributes: Attribute[] = [
    {
      id: 'a1',
      name: 'Size',
      group: 'Tire',
      values: ['205/55R16', '225/45R17'],
    },
    {
      id: 'a2',
      name: 'Season',
      group: 'Tire',
      values: ['Summer', 'Winter', 'All-season'],
    },
    {
      id: 'a3',
      name: 'Rim Diameter',
      group: 'Rim',
      values: ['16"', '17"', '18"'],
    },
    {
      id: 'a4',
      name: 'Bolt Pattern',
      group: 'Rim',
      values: ['5x114.3', '5x112'],
    },
    { id: 'a5', name: 'Color', group: 'Cover', values: ['Black', 'Silver'] },
  ];

  // product -> selected attributeIds
  mappings: ProductAttributeMap[] = [
    { productId: 'p1', attributeIds: ['a1', 'a2'] },
    { productId: 'p2', attributeIds: ['a3', 'a4'] },
  ];

  // ===== UI state =====
  attrQuery = '';
  attrTypeFilter: 'All' | ProductType = 'All';

  attrModalOpen = false;
  attrMode: 'create' | 'edit' = 'create';
  selectedAttr: Attribute | null = null;

  // ===== Forms =====
  attrForm;
  assignForm;

  constructor(private fb: FormBuilder) {
    this.categoryForm = this.fb.group({
      name: ['', Validators.required],
    });
    // Create/Edit attribute form
    this.attrForm = this.fb.nonNullable.group({
      name: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.minLength(2),
      ]),
      group: this.fb.nonNullable.control<ProductType>(
        'Tire',
        Validators.required,
      ),
      valuesText: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.minLength(1),
      ]), // comma separated
    });

    // Assignment form (Brand -> Model -> Product)
    this.assignForm = this.fb.nonNullable.group({
      type: this.fb.nonNullable.control<ProductType>(
        'Tire',
        Validators.required,
      ),
      brandId: this.fb.nonNullable.control('', Validators.required),
      modelId: this.fb.nonNullable.control('', Validators.required),
      productId: this.fb.nonNullable.control('', Validators.required),
      attributeIds: this.fb.nonNullable.control<string[]>([]), // multi select
    });

    // reset lower selections when parent changes
    this.assignForm.get('brandId')!.valueChanges.subscribe(() => {
      this.assignForm.patchValue({
        modelId: '',
        productId: '',
        attributeIds: [],
      });
    });

    this.assignForm.get('modelId')!.valueChanges.subscribe(() => {
      this.assignForm.patchValue({ productId: '', attributeIds: [] });
    });

    this.assignForm.get('type')!.valueChanges.subscribe(() => {
      this.assignForm.patchValue({ productId: '', attributeIds: [] });
    });

    this.assignForm.get('productId')!.valueChanges.subscribe((pid) => {
      if (!pid) {
        this.assignForm.patchValue({ attributeIds: [] });
        return;
      }
      const existing =
        this.mappings.find((m) => m.productId === pid)?.attributeIds ?? [];
      this.assignForm.patchValue({ attributeIds: [...existing] });
    });
  }
  // ---------- common helper ----------

  // ===== Attributes list filtering =====
  get filteredAttributes(): Attribute[] {
    const q = this.attrQuery.trim().toLowerCase();
    return this.attributes.filter((a) => {
      const matchesQuery =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.values.join(',').toLowerCase().includes(q);

      const matchesType =
        this.attrTypeFilter === 'All' ? true : a.group === this.attrTypeFilter;
      return matchesQuery && matchesType;
    });
  }

  // ===== Brand/Model/Product dropdowns =====
  get modelsForBrand(): CarModel[] {
    const brandId = this.assignForm.get('brandId')!.value;
    return this.models.filter((m) => m.brandId === brandId);
  }

  get productsForSelection(): Product[] {
    const type = this.assignForm.get('type')!.value;
    const brandId = this.assignForm.get('brandId')!.value;
    const modelId = this.assignForm.get('modelId')!.value;

    return this.products.filter(
      (p) => p.type === type && p.brandId === brandId && p.modelId === modelId,
    );
  }

  get attributesForType(): Attribute[] {
    const type = this.assignForm.get('type')!.value;
    return this.attributes.filter((a) => a.group === type);
  }

  // ===== Attribute CRUD =====
  openCreateAttribute() {
    this.attrMode = 'create';
    this.selectedAttr = null;
    this.attrForm.reset({ name: '', group: 'Tire', valuesText: '' });
    this.attrModalOpen = true;
  }

  openEditAttribute(a: Attribute) {
    this.attrMode = 'edit';
    this.selectedAttr = a;
    this.attrForm.reset({
      name: a.name,
      group: a.group,
      valuesText: a.values.join(', '),
    });
    this.attrModalOpen = true;
  }

  closeAttrModal() {
    this.attrModalOpen = false;
    this.selectedAttr = null;
  }

  saveAttribute() {
    if (this.attrForm.invalid) {
      this.attrForm.markAllAsTouched();
      return;
    }

    const v = this.attrForm.getRawValue();
    const values = v.valuesText
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

    if (values.length === 0) {
      alert('Please enter at least 1 value.');
      return;
    }

    if (this.attrMode === 'create') {
      const newAttr: Attribute = {
        id: crypto.randomUUID(),
        name: v.name.trim(),
        group: v.group,
        values,
      };
      this.attributes = [newAttr, ...this.attributes];
    } else if (this.selectedAttr) {
      const id = this.selectedAttr.id;
      this.attributes = this.attributes.map((a) =>
        a.id === id ? { ...a, name: v.name.trim(), group: v.group, values } : a,
      );

      // If attribute group changed, remove from mappings where it doesn't match product type anymore
      this.cleanupMappings();
    }

    this.closeAttrModal();
  }

  deleteAttribute(a: Attribute) {
    if (!confirm(`Delete attribute "${a.name}"?`)) return;

    this.attributes = this.attributes.filter((x) => x.id !== a.id);

    // remove from any product mappings
    this.mappings = this.mappings.map((m) => ({
      ...m,
      attributeIds: m.attributeIds.filter((id) => id !== a.id),
    }));

    // keep UI selection clean
    const current = this.assignForm.get('attributeIds')!.value;
    this.assignForm.patchValue({
      attributeIds: current.filter((id) => id !== a.id),
    });
  }

  private cleanupMappings() {
    // ensure only attributes matching product type remain
    const attrById = new Map(this.attributes.map((a) => [a.id, a] as const));
    const prodById = new Map(this.products.map((p) => [p.id, p] as const));

    this.mappings = this.mappings.map((m) => {
      const p = prodById.get(m.productId);
      if (!p) return m;

      const filtered = m.attributeIds.filter(
        (aid) => attrById.get(aid)?.group === p.type,
      );
      return { ...m, attributeIds: filtered };
    });
  }

  // ===== Assign attributes to product =====
  isSelectedAttr(attrId: string): boolean {
    return this.assignForm.get('attributeIds')!.value.includes(attrId);
  }

  toggleAttr(attrId: string) {
    const current = this.assignForm.get('attributeIds')!.value;
    const next = current.includes(attrId)
      ? current.filter((id) => id !== attrId)
      : [...current, attrId];

    this.assignForm.patchValue({ attributeIds: next });
  }

  saveAssignment() {
    if (this.assignForm.invalid) {
      this.assignForm.markAllAsTouched();
      return;
    }

    const v = this.assignForm.getRawValue();

    const existing = this.mappings.find((m) => m.productId === v.productId);
    if (existing) {
      existing.attributeIds = [...v.attributeIds];
      this.mappings = [...this.mappings];
    } else {
      this.mappings = [
        { productId: v.productId, attributeIds: [...v.attributeIds] },
        ...this.mappings,
      ];
    }

    alert('Attributes assigned (demo). Connect backend API here.');
  }

  // helpers
  invalid(form: any, name: string) {
    const c = form.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  typeBadge(t: ProductType) {
    switch (t) {
      case 'Tire':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Rim':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  }

  productLabel(p: Product) {
    return `${p.name} • ${p.sku}`;
  }
  onSearch(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.attrQuery = value;
  }
  onTypeChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.attrTypeFilter = value as any;
  }
  getAttributeName(id: string): string {
    return this.attributes.find((a) => a.id === id)?.name ?? 'Unknown';
  }

  // ---------- category modal ----------
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

  openEditCategory(item: CategoryItem): void {
    this.categoryMode = 'edit';
    this.editingCategoryId = item.id;

    this.categoryForm.patchValue({
      name: item.name,
    });

    this.selectedCategoryImageFile = null;
    this.selectedCategoryImageName = item.imageName || '';
    this.categoryImagePreview = item.image || null;

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

  deleteCategory(id: number): void {
    this.categories = this.categories.filter((item) => item.id !== id);
  }
}
