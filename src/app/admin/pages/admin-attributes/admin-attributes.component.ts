import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { CarBrandService } from '../../../core/api/generated/car-brand/car-brand.service';
import { CarBrandModelService } from '../../../core/api/generated/car-brand-model/car-brand-model.service';
import { ProductAttributeService } from '../../../core/api/generated/product-attribute/product-attribute.service';
import { ProductAttributeValuesService } from '../../../core/api/generated/product-attribute-values/product-attribute-values.service';
import { ProductCategoryAttributeService } from '../../../core/api/generated/product-category-attribute/product-category-attribute.service';
import { ProductCategoryService } from '../../../core/api/generated/product-category/product-category.service';
import { ProductsService } from '../../../core/api/generated/products/products.service';
import type {
  CarBrandResponseDto,
  CarBrandModelResponseDto,
  CreateProductAttributeDto,
  ProductAttributeResponseDto,
  ProductAttributeValuesResponseDto,
  ProductCategoryAttributeControllerWorkspaceParams,
  ProductCategoryAttributeResponseDto,
  ProductCategoryResponseDto,
  ProductSummaryDto,
  SaveProductCategoryAttributeAssignmentDto,
  UpdateProductAttributeDto,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';

type AttributeStatusFilter = 'All' | 'Active' | 'Inactive';
type AttributeDropdownKey = 'category' | 'brand' | 'model' | 'product';

interface DummyAttributeValueItem {
  id: number;
  label: string;
  selected: boolean;
}

@Component({
  selector: 'app-admin-attributes',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './admin-attributes.component.html',
  styleUrl: './admin-attributes.component.css',
})
export class AdminAttributesComponent implements OnInit {
  readonly statusOptions: AttributeStatusFilter[] = [
    'All',
    'Active',
    'Inactive',
  ];
  readonly pageSizeOptions = [20, 50, 100];

  query = '';
  statusFilter: AttributeStatusFilter = 'All';
  appliedQuery = '';
  appliedStatusFilter: AttributeStatusFilter = 'All';

  loading = true;
  saving = false;
  deleting = false;
  savingAssignment = false;
  assignmentLoading = false;
  brandsLoading = false;
  modelsLoading = false;

  page = 1;
  pageSize = 50;

  attrModalOpen = false;
  confirmOpen = false;
  valuesModalOpen = false;
  attrMode: 'create' | 'edit' = 'create';
  selectedAttr: ProductAttributeResponseDto | null = null;
  selectedValueAttribute: ProductAttributeResponseDto | null = null;
  selectedModelOption: CarBrandModelResponseDto | null = null;
  valueSearch = '';
  newValueLabel = '';
  editingValueId: number | null = null;
  editingValueLabel = '';
  nextDummyValueId = 1000;
  valueDraftItems: DummyAttributeValueItem[] = [];

  attributes: ProductAttributeResponseDto[] = [];
  filteredAttributes: ProductAttributeResponseDto[] = [];
  attributeValuesByAttributeId = new Map<
    number,
    ProductAttributeValuesResponseDto[]
  >();
  categoryIdsByAttributeId = new Map<number, number[]>();
  dummyValuesByAttributeId = new Map<number, DummyAttributeValueItem[]>();

  categories: ProductCategoryResponseDto[] = [];
  brands: CarBrandResponseDto[] = [];
  models: CarBrandModelResponseDto[] = [];
  products: ProductSummaryDto[] = [];
  activeDropdown: AttributeDropdownKey | null = null;
  categorySearch = '';
  brandSearch = '';
  modelSearch = '';
  productSearch = '';

  readonly attrForm;
  readonly assignForm;

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly productAttributeService: ProductAttributeService,
    private readonly productAttributeValuesService: ProductAttributeValuesService,
    private readonly productCategoryAttributeService: ProductCategoryAttributeService,
    private readonly productCategoryService: ProductCategoryService,
    private readonly carBrandService: CarBrandService,
    private readonly carBrandModelService: CarBrandModelService,
    private readonly productsService: ProductsService,
    private readonly toastService: ToastService,
  ) {
    this.attrForm = this.fb.group({
      attribute_name: ['', [Validators.required, Validators.minLength(2)]],
      is_active: [true, [Validators.required]],
    });

    this.assignForm = this.fb.nonNullable.group({
      categoryId: this.fb.nonNullable.control('', Validators.required),
      brandId: this.fb.nonNullable.control(''),
      modelId: this.fb.nonNullable.control(''),
      productId: this.fb.nonNullable.control(''),
      attributeIds: this.fb.nonNullable.control<number[]>([]),
    });

    this.assignForm.get('categoryId')!.valueChanges.subscribe(() => {
      this.assignForm.patchValue(
        { brandId: '', modelId: '', productId: '', attributeIds: [] },
        { emitEvent: false },
      );
      if (this.assignForm.get('categoryId')!.value) {
        this.loadAssignmentSelection();
      }
    });
  }

  ngOnInit(): void {
    this.loadAttributes();
    this.loadCategories();
    this.loadAttributeValues();
    this.loadCategoryAssignments();
  }

  get totalCount(): number {
    return this.filteredAttributes.length;
  }

  get activeCount(): number {
    return this.filteredAttributes.filter((item) => item.is_active).length;
  }

  get inactiveCount(): number {
    return this.filteredAttributes.filter((item) => !item.is_active).length;
  }

  get totalPages(): number {
    return Math.max(
      1,
      Math.ceil(this.filteredAttributes.length / this.pageSize),
    );
  }

  get paginatedAttributes(): ProductAttributeResponseDto[] {
    const start = (this.page - 1) * this.pageSize;
    return this.filteredAttributes.slice(start, start + this.pageSize);
  }

  get modelsForBrand(): CarBrandModelResponseDto[] {
    return this.models;
  }

  get filteredCategories(): ProductCategoryResponseDto[] {
    return this.filterByText(this.categories, this.categorySearch, (item) =>
      item.category_name ?? '',
    );
  }

  get filteredBrands(): CarBrandResponseDto[] {
    return this.filterByText(this.brands, this.brandSearch, (item) =>
      item.car_brand_name ?? '',
    );
  }

  get filteredModels(): CarBrandModelResponseDto[] {
    return this.filterByText(this.modelsForBrand, this.modelSearch, (item) =>
      item.model_name ?? '',
    );
  }

  get filteredProducts(): ProductSummaryDto[] {
    return this.filterByText(this.products, this.productSearch, (item) =>
      `${item.title ?? ''} ${item.sku ?? ''}`.trim(),
    );
  }

  get selectedAttributeIds(): number[] {
    return this.assignForm.get('attributeIds')!.value;
  }

  get selectedAttributeNames(): string[] {
    return this.selectedAttributeIds
      .map(
        (id) =>
          this.attributes.find((attribute) => attribute.attribute_id === id)
            ?.attribute_name,
      )
      .filter((name): name is string => !!name);
  }

  get categoryDisplayValue(): string {
    return this.categorySearch || this.selectedCategoryName;
  }

  get brandDisplayValue(): string {
    return this.brandSearch || this.selectedBrandName;
  }

  get modelDisplayValue(): string {
    return this.modelSearch || this.selectedModelName;
  }

  get productDisplayValue(): string {
    return this.productSearch || this.selectedProductName;
  }

  get selectedCategoryName(): string {
    const id = Number(this.assignForm.get('categoryId')!.value);
    return this.categories.find((item) => item.category_id === id)?.category_name || '';
  }

  get selectedBrandName(): string {
    const id = Number(this.assignForm.get('brandId')!.value);
    return this.brands.find((item) => item.car_brand_id === id)?.car_brand_name || '';
  }

  get selectedModelName(): string {
    const id = Number(this.assignForm.get('modelId')!.value);
    return (
      this.selectedModelOption?.model_id === id
        ? this.selectedModelOption.model_name
        : this.modelsForBrand.find((item) => item.model_id === id)?.model_name
    ) || '';
  }

  get selectedProductName(): string {
    const id = Number(this.assignForm.get('productId')!.value);
    const product = this.products.find((item) => item.product_id === id);
    return product ? this.formatProductLabel(product) : '';
  }

  get selectedAttributeCount(): number {
    return this.selectedAttributeIds.length;
  }

  get selectedValueCount(): number {
    return this.valueDraftItems.filter((item) => item.selected).length;
  }

  get visibleAttributeValues(): DummyAttributeValueItem[] {
    const values = this.getAttributeValueItems(
      this.selectedValueAttribute?.attribute_id,
    );
    const normalized = this.valueSearch.trim().toLowerCase();

    return values
      .filter((item) =>
        !normalized ? true : item.label.toLowerCase().includes(normalized),
      )
      .sort((left, right) => {
        if (left.selected !== right.selected) {
          return left.selected ? -1 : 1;
        }
        if (left.id !== right.id) {
          return right.id - left.id;
        }
        return left.label.localeCompare(right.label);
      });
  }

  applyFilters(): void {
    this.appliedQuery = this.query.trim().toLowerCase();
    this.appliedStatusFilter = this.statusFilter;

    this.filteredAttributes = this.attributes.filter((item) => {
      const attributeName = item.attribute_name.toLowerCase();
      const createdBy = String(item.created_by ?? '').toLowerCase();
      const matchesQuery =
        !this.appliedQuery ||
        attributeName.includes(this.appliedQuery) ||
        createdBy.includes(this.appliedQuery);

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

  goToCategoryPage(): void {
    this.router.navigateByUrl('/admin/category');
  }

  activateDropdown(dropdown: AttributeDropdownKey): void {
    this.activeDropdown = dropdown;
    if (this.getDropdownSearch(dropdown) === this.getSelectedLabel(dropdown)) {
      this.setDropdownSearch(dropdown, '');
    }
    if (dropdown === 'brand' && this.assignForm.get('categoryId')!.value) {
      this.loadBrands();
    }
    if (dropdown === 'model') {
      this.fetchModels();
    }
  }

  closeDropdown(): void {
    this.activeDropdown = null;
  }

  updateDropdownSearch(
    dropdown: AttributeDropdownKey,
    value: string,
  ): void {
    this.activeDropdown = dropdown;
    this.setDropdownSearch(dropdown, value);

    if (value === this.getSelectedLabel(dropdown)) {
      return;
    }

    switch (dropdown) {
      case 'category':
        this.assignForm.patchValue(
          { categoryId: '', productId: '', attributeIds: [] },
          { emitEvent: false },
        );
        this.products = [];
        this.productSearch = '';
        break;
      case 'brand':
        this.assignForm.patchValue(
          { brandId: '', modelId: '', productId: '', attributeIds: [] },
          { emitEvent: false },
        );
        this.products = [];
        this.modelSearch = '';
        this.productSearch = '';
        break;
      case 'model':
        this.assignForm.patchValue(
          { modelId: '', productId: '', attributeIds: [] },
          { emitEvent: false },
        );
        this.products = [];
        this.productSearch = '';
        this.selectedModelOption = null;
        this.fetchModels(value);
        break;
      case 'product':
        this.assignForm.patchValue(
          { productId: '', attributeIds: [] },
          { emitEvent: false },
        );
        break;
    }
  }

  selectCategory(category: ProductCategoryResponseDto): void {
    this.assignForm.patchValue({ categoryId: String(category.category_id) });
    this.categorySearch = category.category_name ?? '';
    this.closeDropdown();
  }

  selectBrand(brand: CarBrandResponseDto): void {
    this.assignForm.patchValue({ brandId: String(brand.car_brand_id) });
    this.brandSearch = brand.car_brand_name ?? '';
    this.fetchModels();
    this.closeDropdown();
  }

  selectModel(model: CarBrandModelResponseDto): void {
    this.assignForm.patchValue({ modelId: String(model.model_id) });
    this.modelSearch = model.model_name ?? '';
    this.selectedModelOption = model;
    this.closeDropdown();
  }

  selectProduct(product: ProductSummaryDto): void {
    this.assignForm.patchValue({ productId: String(product.product_id) });
    this.productSearch = this.formatProductLabel(product);
    this.closeDropdown();
  }

  openCreateAttribute(): void {
    this.attrMode = 'create';
    this.selectedAttr = null;
    this.attrForm.reset({
      attribute_name: '',
      is_active: true,
    });
    this.attrModalOpen = true;
  }

  openEditAttribute(attribute: ProductAttributeResponseDto): void {
    this.attrMode = 'edit';
    this.selectedAttr = attribute;
    this.attrForm.reset({
      attribute_name: attribute.attribute_name,
      is_active: attribute.is_active,
    });
    this.attrModalOpen = true;
  }

  closeAttrModal(): void {
    if (this.saving) {
      return;
    }

    this.attrModalOpen = false;
    this.selectedAttr = null;
  }

  openDeleteAttribute(attribute: ProductAttributeResponseDto): void {
    this.selectedAttr = attribute;
    this.confirmOpen = true;
  }

  closeConfirm(): void {
    if (this.deleting) {
      return;
    }

    this.confirmOpen = false;
    this.selectedAttr = null;
  }

  saveAttribute(): void {
    if (this.attrForm.invalid || this.saving) {
      this.attrForm.markAllAsTouched();
      return;
    }

    const value = this.attrForm.getRawValue();
    const payload = {
      attribute_name: String(value.attribute_name).trim(),
      is_active: Boolean(value.is_active),
      is_deleted: false,
    } as CreateProductAttributeDto;

    this.saving = true;

    const request =
      this.attrMode === 'create'
        ? this.productAttributeService.productAttributeControllerCreate(payload)
        : this.productAttributeService.productAttributeControllerUpdate(
            String(this.selectedAttr?.attribute_id),
            this.toUpdatePayload(payload),
          );

    request.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.toastService.success(
          this.attrMode === 'create'
            ? 'Attribute created successfully.'
            : 'Attribute updated successfully.',
        );
        this.attrModalOpen = false;
        this.selectedAttr = null;
        this.loadAttributes();
      },
      error: (error) => {
        this.toastService.error(
          this.getErrorMessage(error, 'Failed to save attribute.'),
        );
      },
    });
  }

  confirmDelete(): void {
    if (!this.selectedAttr || this.deleting) {
      return;
    }

    this.deleting = true;
    this.productAttributeService
      .productAttributeControllerRemove(String(this.selectedAttr.attribute_id))
      .pipe(finalize(() => (this.deleting = false)))
      .subscribe({
        next: () => {
          this.toastService.success('Attribute deleted successfully.');
          this.confirmOpen = false;
          this.selectedAttr = null;
          this.loadAttributes();
        },
        error: (error) => {
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to delete attribute.'),
          );
        },
      });
  }

  isSelectedAttr(attributeId: number): boolean {
    return this.selectedAttributeIds.includes(attributeId);
  }

  toggleAttr(attributeId: number): void {
    const current = this.selectedAttributeIds;
    const next = current.includes(attributeId)
      ? current.filter((id) => id !== attributeId)
      : [...current, attributeId];

    this.assignForm.patchValue({ attributeIds: next });
  }

  getAttributeValueCount(attributeId: number): number {
    return this.getAttributeValueItems(attributeId).length;
  }

  getAttributeValuePreview(attributeId: number, limit = 3): string {
    const values = this.getAttributeValueItems(attributeId);
    return (
      values
        .slice(0, limit)
        .map((item) => item.label)
        .filter(Boolean)
        .join(', ') || 'No values added'
    );
  }

  getAssignedCategoryNames(attributeId: number, limit = 2): string {
    const categoryIds = this.categoryIdsByAttributeId.get(attributeId) ?? [];
    const names = categoryIds
      .map(
        (categoryId) =>
          this.categories.find((item) => item.category_id === categoryId)
            ?.category_name,
      )
      .filter((name): name is string => !!name);

    if (names.length === 0) {
      return 'Not assigned';
    }

    if (names.length <= limit) {
      return names.join(', ');
    }

    return `${names.slice(0, limit).join(', ')} +${names.length - limit}`;
  }

  openAttributeValues(attribute: ProductAttributeResponseDto): void {
    this.selectedValueAttribute = attribute;
    this.ensureDummyValues(attribute);
    this.valueDraftItems = this.getAttributeValueItems(attribute.attribute_id).map(
      (item) => ({ ...item }),
    );
    this.valueSearch = '';
    this.newValueLabel = '';
    this.editingValueId = null;
    this.editingValueLabel = '';
    this.valuesModalOpen = true;
  }

  closeValuesModal(): void {
    this.valuesModalOpen = false;
    this.selectedValueAttribute = null;
    this.valueDraftItems = [];
    this.valueSearch = '';
    this.newValueLabel = '';
    this.editingValueId = null;
    this.editingValueLabel = '';
  }

  saveValueSelections(): void {
    const attributeId = this.selectedValueAttribute?.attribute_id;
    if (!attributeId) {
      return;
    }

    this.dummyValuesByAttributeId.set(
      attributeId,
      this.valueDraftItems.map((item) => ({ ...item })),
    );
    this.closeValuesModal();
  }

  addDummyValue(): void {
    const label = this.newValueLabel.trim();
    const attributeId = this.selectedValueAttribute?.attribute_id;

    if (!attributeId || !label) {
      return;
    }

    const values = [...this.getAttributeValueItems(attributeId)];
    this.valueDraftItems = [
      {
      id: this.nextDummyValueId++,
      label,
      selected: true,
      },
      ...values,
    ];
    this.newValueLabel = '';
  }

  toggleDummyValue(valueId: number): void {
    const attributeId = this.selectedValueAttribute?.attribute_id;
    if (!attributeId) {
      return;
    }

    this.valueDraftItems = this.getAttributeValueItems(attributeId).map((item) =>
      item.id === valueId ? { ...item, selected: !item.selected } : item,
    );
  }

  startEditingValue(value: DummyAttributeValueItem): void {
    this.editingValueId = value.id;
    this.editingValueLabel = value.label;
  }

  cancelEditingValue(): void {
    this.editingValueId = null;
    this.editingValueLabel = '';
  }

  saveEditedValue(valueId: number): void {
    const attributeId = this.selectedValueAttribute?.attribute_id;
    const label = this.editingValueLabel.trim();
    if (!attributeId || !label) {
      return;
    }

    this.valueDraftItems = this.getAttributeValueItems(attributeId).map((item) =>
      item.id === valueId ? { ...item, label } : item,
    );
    this.cancelEditingValue();
  }

  deleteDummyValue(valueId: number): void {
    const attributeId = this.selectedValueAttribute?.attribute_id;
    if (!attributeId) {
      return;
    }

    this.valueDraftItems = this.getAttributeValueItems(attributeId).filter(
      (item) => item.id !== valueId,
    );
    if (this.editingValueId === valueId) {
      this.cancelEditingValue();
    }
  }

  saveAssignment(): void {
    if (this.assignForm.invalid || this.savingAssignment) {
      this.assignForm.markAllAsTouched();
      return;
    }

    if (this.selectedAttributeIds.length === 0) {
      this.toastService.warning('Select at least one attribute.');
      return;
    }

    const value = this.assignForm.getRawValue();
    const payload: SaveProductCategoryAttributeAssignmentDto = {
      category_id: Number(value.categoryId),
      attribute_ids: value.attributeIds,
      is_active: true,
    };

    this.savingAssignment = true;
    this.productCategoryAttributeService
      .productCategoryAttributeControllerSaveAssignment(payload)
      .pipe(finalize(() => (this.savingAssignment = false)))
      .subscribe({
        next: () => {
          this.toastService.success('Assignment saved successfully.');
        },
        error: (error) => {
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to save assignment.'),
          );
        },
      });
  }

  invalid(controlName: keyof typeof this.attrForm.controls): boolean {
    const control = this.attrForm.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  invalidAssign(controlName: keyof typeof this.assignForm.controls): boolean {
    const control = this.assignForm.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  trackByAttributeId(_: number, item: ProductAttributeResponseDto): number {
    return item.attribute_id;
  }

  private loadAttributes(): void {
    this.loading = true;
    this.productAttributeService
      .productAttributeControllerList()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.attributes = response.data ?? [];
          this.seedDummyValues();
          this.applyFilters();
        },
        error: (error) => {
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to load attributes.'),
          );
        },
      });
  }

  private loadCategories(): void {
    this.productCategoryService.productCategoryControllerList().subscribe({
      next: (response) => {
        this.categories = response.data ?? [];
      },
      error: () => {
        this.toastService.error('Failed to load categories.');
      },
    });
  }

  private loadAttributeValues(): void {
    this.productAttributeValuesService
      .productAttributeValuesControllerList({
        params: { page: 1, limit: 1000 },
      })
      .subscribe({
        next: (response) => {
          this.attributeValuesByAttributeId = this.groupAttributeValues(
            response.data ?? [],
          );
        },
        error: () => {
          this.toastService.error('Failed to load attribute values.');
        },
      });
  }

  private loadCategoryAssignments(): void {
    this.productCategoryAttributeService
      .productCategoryAttributeControllerList({
        params: { page: 1, limit: 1000 },
      })
      .subscribe({
        next: (response) => {
          this.categoryIdsByAttributeId = this.groupCategoryAssignments(
            response.data ?? [],
          );
        },
        error: () => {
          this.toastService.error('Failed to load category assignments.');
        },
      });
  }

  private loadBrands(): void {
    if (!this.assignForm.get('categoryId')!.value) {
      this.brands = [];
      return;
    }

    this.brandsLoading = true;
    this.carBrandService
      .carBrandControllerList()
      .pipe(finalize(() => (this.brandsLoading = false)))
      .subscribe({
        next: (response) => {
          this.brands = response.data ?? [];
        },
        error: () => {
          this.toastService.error('Failed to load brands.');
        },
      });
  }

  private fetchModels(search?: string): void {
    const brandId = Number(this.assignForm.get('brandId')!.value);

    if (!brandId) {
      this.models = [];
      return;
    }

    this.modelsLoading = true;
    this.carBrandModelService
      .carBrandModelControllerList({
        page: 1,
        limit: 100,
        car_brand_id: brandId,
        search: search?.trim() || undefined,
      })
      .pipe(finalize(() => (this.modelsLoading = false)))
      .subscribe({
        next: (response) => {
          this.models = response.data ?? [];
        },
        error: () => {
          this.toastService.error('Failed to load models.');
        },
      });
  }

  private loadProductsForSelection(): void {
    const categoryId = this.assignForm.get('categoryId')!.value;
    const modelId = this.assignForm.get('modelId')!.value;
    const brandId = this.assignForm.get('brandId')!.value;

    if (!categoryId || !brandId || !modelId) {
      return;
    }

    this.productsService
      .productsControllerList({
        page: 1,
        limit: 200,
        categoryIds: String(categoryId),
        brandIds: String(brandId),
        modelIds: String(modelId),
      })
      .subscribe({
        next: (response) => {
          this.products = response.data ?? [];
          if (!this.products.some((item) => item.product_id === Number(this.assignForm.get('productId')!.value))) {
            this.assignForm.patchValue(
              { productId: '', attributeIds: [] },
              { emitEvent: false },
            );
            this.productSearch = '';
          }
        },
        error: () => {
          this.toastService.error('Failed to load products.');
        },
      });
  }

  private loadAssignmentSelection(): void {
    const value = this.assignForm.getRawValue();
    if (!value.categoryId) {
      this.assignForm.patchValue({ attributeIds: [] }, { emitEvent: false });
      return;
    }

    const params: ProductCategoryAttributeControllerWorkspaceParams = {
      page: 1,
      limit: 1,
      category_id: value.categoryId ? Number(value.categoryId) : undefined,
    };

    this.assignmentLoading = true;
    this.productCategoryAttributeService
      .productCategoryAttributeControllerWorkspace<any>(params)
      .pipe(finalize(() => (this.assignmentLoading = false)))
      .subscribe({
        next: (response) => {
          this.assignForm.patchValue(
            { attributeIds: this.extractWorkspaceAttributeIds(response) },
            { emitEvent: false },
          );
        },
        error: () => {
          this.assignForm.patchValue(
            { attributeIds: [] },
            { emitEvent: false },
          );
        },
      });
  }

  private extractWorkspaceAttributeIds(response: any): number[] {
    const candidates = [
      response?.attribute_ids,
      response?.selected_attribute_ids,
      response?.assignment?.attribute_ids,
      response?.data?.attribute_ids,
      response?.data?.selected_attribute_ids,
      response?.data?.assignment?.attribute_ids,
      response?.workspace?.attribute_ids,
      response?.workspace?.assignment?.attribute_ids,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value));
      }
    }

    return [];
  }

  private filterByText<T>(
    items: T[],
    query: string,
    project: (item: T) => string,
  ): T[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return items;
    }

    return items.filter((item) =>
      project(item).toLowerCase().includes(normalized),
    );
  }

  private groupAttributeValues(
    items: ProductAttributeValuesResponseDto[],
  ): Map<number, ProductAttributeValuesResponseDto[]> {
    const grouped = new Map<number, ProductAttributeValuesResponseDto[]>();

    for (const item of items) {
      const current = grouped.get(item.attribute_id) ?? [];
      current.push(item);
      grouped.set(item.attribute_id, current);
    }

    return grouped;
  }

  private groupCategoryAssignments(
    items: ProductCategoryAttributeResponseDto[],
  ): Map<number, number[]> {
    const grouped = new Map<number, Set<number>>();

    for (const item of items) {
      if (!grouped.has(item.attribute_id)) {
        grouped.set(item.attribute_id, new Set<number>());
      }
      grouped.get(item.attribute_id)!.add(item.category_id);
    }

    return new Map(
      Array.from(grouped.entries()).map(([attributeId, categoryIds]) => [
        attributeId,
        Array.from(categoryIds),
      ]),
    );
  }

  private getAttributeValueItems(attributeId?: number): DummyAttributeValueItem[] {
    if (!attributeId) {
      return [];
    }

    if (
      this.selectedValueAttribute?.attribute_id === attributeId &&
      this.valueDraftItems.length >= 0 &&
      this.valuesModalOpen
    ) {
      return this.valueDraftItems;
    }

    return this.dummyValuesByAttributeId.get(attributeId) ?? [];
  }

  private ensureDummyValues(attribute: ProductAttributeResponseDto): void {
    if (this.dummyValuesByAttributeId.has(attribute.attribute_id)) {
      return;
    }

    this.dummyValuesByAttributeId.set(
      attribute.attribute_id,
      this.createInitialDummyValues(attribute),
    );
  }

  private seedDummyValues(): void {
    for (const attribute of this.attributes) {
      this.ensureDummyValues(attribute);
    }
  }

  private createInitialDummyValues(
    attribute: ProductAttributeResponseDto,
  ): DummyAttributeValueItem[] {
    const existingValues = this.attributeValuesByAttributeId.get(
      attribute.attribute_id,
    );

    if (existingValues?.length) {
      return existingValues.map((item) => ({
        id: item.value_id,
        label: item.attribute_value,
        selected: true,
      }));
    }

    const fallbackByName: Record<string, string[]> = {
      size: ['205/55R16', '225/45R17', '17x8'],
      color: ['Matte Black', 'Gloss Black', 'Bronze'],
      'bolt pattern': ['5x114.3', '6x139.7'],
      width: ['8J', '9J'],
      offset: ['+20', '+35'],
    };

    const fallbackValues =
      fallbackByName[attribute.attribute_name.trim().toLowerCase()] ?? [];

    const seededValues = fallbackValues.map((label, index) => ({
      id: this.nextDummyValueId + index,
      label,
      selected: index < 2,
    }));

    this.nextDummyValueId += fallbackValues.length;

    return seededValues;
  }

  private getDropdownSearch(dropdown: AttributeDropdownKey): string {
    switch (dropdown) {
      case 'category':
        return this.categorySearch;
      case 'brand':
        return this.brandSearch;
      case 'model':
        return this.modelSearch;
      case 'product':
        return this.productSearch;
    }
  }

  private setDropdownSearch(
    dropdown: AttributeDropdownKey,
    value: string,
  ): void {
    switch (dropdown) {
      case 'category':
        this.categorySearch = value;
        break;
      case 'brand':
        this.brandSearch = value;
        break;
      case 'model':
        this.modelSearch = value;
        break;
      case 'product':
        this.productSearch = value;
        break;
    }
  }

  private getSelectedLabel(dropdown: AttributeDropdownKey): string {
    switch (dropdown) {
      case 'category':
        return this.selectedCategoryName;
      case 'brand':
        return this.selectedBrandName;
      case 'model':
        return this.selectedModelName;
      case 'product':
        return this.selectedProductName;
    }
  }

  private formatProductLabel(product: ProductSummaryDto): string {
    return `${product.title || 'Untitled product'}${product.sku ? ` (${product.sku})` : ''}`;
  }

  private toUpdatePayload(
    payload: CreateProductAttributeDto,
  ): UpdateProductAttributeDto {
    return {
      attribute_name: payload.attribute_name,
      is_active: payload.is_active,
      is_deleted: payload.is_deleted,
    };
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
