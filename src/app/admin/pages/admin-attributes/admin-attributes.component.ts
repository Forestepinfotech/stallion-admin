import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, forkJoin, of, from } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { CategoryModalComponent } from '../../components/category-modal/category-modal.component';
import { AdminCarBrandService as CarBrandService } from '../../../core/api/generated/admin-car-brand/admin-car-brand.service';
import { AdminCarBrandModelService as CarBrandModelService } from '../../../core/api/generated/admin-car-brand-model/admin-car-brand-model.service';
import { AdminProductAttributeService as ProductAttributeService } from '../../../core/api/generated/admin-product-attribute/admin-product-attribute.service';
import { AdminProductAttributeValuesService as ProductAttributeValuesService } from '../../../core/api/generated/admin-product-attribute-values/admin-product-attribute-values.service';
import { AdminProductCategoryAttributeService as ProductCategoryAttributeService } from '../../../core/api/generated/admin-product-category-attribute/admin-product-category-attribute.service';
import { AdminProductCategoryService as ProductCategoryService } from '../../../core/api/generated/admin-product-category/admin-product-category.service';
import { AdminProductsService as ProductsService } from '../../../core/api/generated/admin-products/admin-products.service';
import type {
  CarBrandResponseDto,
  CarBrandModelResponseDto,
  CreateProductCategoryDto,
  CreateProductAttributeDto,
  PaginatedCarBrandModelResponseDto,
  ProductAttributeResponseDto,
  ProductAttributeValuesResponseDto,
  SaveProductCategoryAttributeValuesDto,
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
type AddValuesMode = 'year_range' | 'brands' | 'categories' | 'models';

interface DummyAttributeValueItem {
  id: number;
  label: string;
  selected: boolean;
  persisted: boolean;
  createdAt?: string;
}

@Component({
  selector: 'app-admin-attributes',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, CategoryModalComponent],
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
  savingCategory = false;
  saving = false;
  deleting = false;
  savingAssignment = false;
  assignmentLoading = false;
  brandsLoading = false;
  modelsLoading = false;

  page = 1;
  pageSize = 20;

  categoryModalOpen = false;
  attrModalOpen = false;
  confirmOpen = false;
  assignConfirmOpen = false;
  valuesModalOpen = false;
  attrMode: 'create' | 'edit' = 'create';
  selectedAttr: ProductAttributeResponseDto | null = null;
  pendingAssignAttribute: ProductAttributeResponseDto | null = null;
  selectedValueAttribute: ProductAttributeResponseDto | null = null;
  selectedModelOption: CarBrandModelResponseDto | null = null;
  selectedCategoryLabel = '';
  valueSearch = '';
  valueSelectionFilter = 'all';
  valueSortBy = 'new_first';
  valueDateFrom = '';
  valueDateTo = '';
  newValueLabel = '';
  addValuesModalOpen = false;
  addValuesMode: AddValuesMode = 'year_range';
  addValuesBusy = false;
  addValuesProgress: { total: number; done: number } | null = null;
  addValuesYearFrom = new Date().getFullYear();
  addValuesYearTo = new Date().getFullYear();
  addValuesBrandSearchInput = '';
  addValuesCategorySearchInput = '';
  addValuesModelSearchInput = '';
  addValuesBrandSearchApplied = '';
  addValuesCategorySearchApplied = '';
  addValuesModelSearchApplied = '';
  private addValuesBrandSearchHandle: number | null = null;
  private addValuesCategorySearchHandle: number | null = null;
  private addValuesModelSearchHandle: number | null = null;
  readonly addValuesPageSize = 50;
  addValuesBrandsLoading = false;
  addValuesCategoriesLoading = false;
  addValuesModelsLoading = false;
  addValuesBrandsPage = 1;
  addValuesCategoriesPage = 1;
  addValuesModelsPage = 1;
  addValuesBrandsTotalPages = 1;
  addValuesCategoriesTotalPages = 1;
  addValuesModelsTotalPages = 1;
  addValuesBrandsHasNext = false;
  addValuesCategoriesHasNext = false;
  addValuesModelsHasNext = false;
  addValuesBrands: CarBrandResponseDto[] = [];
  addValuesCategories: ProductCategoryResponseDto[] = [];
  addValuesModels: CarBrandModelResponseDto[] = [];
  addValuesSelectedBrandIds = new Set<number>();
  addValuesSelectedCategoryIds = new Set<number>();
  addValuesSelectedModelIds = new Set<number>();
  private addValuesBrandNameById = new Map<number, string>();
  private addValuesCategoryNameById = new Map<number, string>();
  private addValuesModelNameById = new Map<number, string>();
  editingValueId: number | null = null;
  editingValueLabel = '';
  duplicateValueConfirmOpen = false;
  pendingDuplicateValue: ProductAttributeValuesResponseDto | null = null;
  nextDummyValueId = 1000;
  valueDraftItems: DummyAttributeValueItem[] = [];
  valueOriginalItems: DummyAttributeValueItem[] = [];
  selectedValueIdsDraft: number[] = [];
  savingValues = false;
  addingValue = false;
  loadingValueSelection = false;
  applyingValueFilters = false;
  assignmentPage = 1;
  assignmentPageSize = 50;
  assignmentTotalItems = 0;
  valuePage = 1;
  valuePageSize = 10;
  valueTotalItems = 0;

  attributes: ProductAttributeResponseDto[] = [];
  filteredAttributes: ProductAttributeResponseDto[] = [];
  workspaceAttributes: ProductAttributeResponseDto[] = [];
  attributeValuesByAttributeId = new Map<
    number,
    ProductAttributeValuesResponseDto[]
  >();
  categoryIdsByAttributeId = new Map<number, number[]>();
  categoryAttributeValueIds = new Map<string, number[]>();

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
      this.selectedCategoryLabel = this.resolveSelectedCategoryName();
      this.assignmentPage = 1;
      this.assignmentPageSize = 50;
      this.assignmentTotalItems = 0;
      this.assignForm.patchValue(
        { brandId: '', modelId: '', productId: '', attributeIds: [] },
        { emitEvent: false },
      );
      if (this.assignForm.get('categoryId')!.value) {
        this.loadAssignmentSelection();
      } else {
        this.categoryAttributeValueIds.clear();
      }
    });
  }

  ngOnInit(): void {
    this.loadAttributes();
    this.loadCategories();
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

  get addValuesSelectedCount(): number {
    switch (this.addValuesMode) {
      case 'brands':
        return this.addValuesSelectedBrandIds.size;
      case 'categories':
        return this.addValuesSelectedCategoryIds.size;
      case 'models':
        return this.addValuesSelectedModelIds.size;
      case 'year_range':
      default:
        return this.buildYearRange(this.addValuesYearFrom, this.addValuesYearTo).length;
    }
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
    return this.selectedCategoryLabel || this.resolveSelectedCategoryName();
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

  get hasSelectedCategory(): boolean {
    return !!this.assignForm.get('categoryId')!.value;
  }

  get assignmentAttributes(): ProductAttributeResponseDto[] {
    if (!this.hasSelectedCategory) {
      return [];
    }

    return [...this.workspaceAttributes];
  }

  get selectedValueCount(): number {
    return this.selectedValueIdsDraft.length;
  }

  get assignmentTotalPages(): number {
    return Math.max(1, Math.ceil(this.assignmentTotalItems / this.assignmentPageSize));
  }

  get visibleAttributeValues(): DummyAttributeValueItem[] {
    return this.valueDraftItems;
  }

  get valueTotalPages(): number {
    return Math.max(1, Math.ceil(this.valueTotalItems / this.valuePageSize));
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
    this.pageSize = Number(size) || 20;
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

  changeAssignmentPageSize(size: number): void {
    this.assignmentPageSize = Number(size) || 50;
    this.assignmentPage = 1;
    this.loadAssignmentSelection();
  }

  prevAssignmentPage(): void {
    if (this.assignmentPage > 1) {
      this.assignmentPage -= 1;
      this.loadAssignmentSelection();
    }
  }

  nextAssignmentPage(): void {
    if (this.assignmentPage < this.assignmentTotalPages) {
      this.assignmentPage += 1;
      this.loadAssignmentSelection();
    }
  }

  goToCategoryPage(): void {
    this.openCreateCategory();
  }

  openCreateCategory(): void {
    this.categoryModalOpen = true;
  }

  closeCategoryModal(): void {
    if (this.savingCategory) {
      return;
    }

    this.categoryModalOpen = false;
  }

  saveCategory(payload: CreateProductCategoryDto): void {
    this.savingCategory = true;
    this.productCategoryService
      .productCategoryControllerCreate(payload)
      .pipe(finalize(() => (this.savingCategory = false)))
      .subscribe({
        next: (response: any) => {
          if (response?.success === false && response?.already_added) {
            this.toastService.error(
              this.getErrorMessage(response, 'This category is already added.'),
            );
            return;
          }

          const createdCategory = this.normalizeCategoryResponse(response);
          this.categories = [createdCategory, ...this.categories];
          this.selectedCategoryLabel = createdCategory.category_name;
          this.assignForm.patchValue({ categoryId: String(createdCategory.category_id) });
          this.categoryModalOpen = false;
          this.toastService.success('Category created successfully.');
        },
        error: (error) => {
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to save category.'),
          );
        },
      });
  }

  onCategoryModalWarning(message: string): void {
    this.toastService.warning(message);
  }

  onCategoryModalError(message: string): void {
    this.toastService.error(message);
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
      next: (response) => {
        const result = response as any;
        if (result?.success === false && result?.already_added) {
          this.toastService.error(
            this.getErrorMessage(result, 'This attribute name already exists.'),
          );
          return;
        }

        this.toastService.success(
          this.attrMode === 'create'
            ? 'Attribute created successfully.'
            : 'Attribute updated successfully.',
        );
        this.attrModalOpen = false;
        this.selectedAttr = null;

        if (this.attrMode === 'create') {
          const createdAttribute = this.normalizeAttributeResponse(response);
          this.attributes = [createdAttribute, ...this.attributes];
          this.applyFilters();
          return;
        }

        if (response) {
          const updatedAttribute = this.normalizeAttributeResponse(response);
          this.attributes = this.attributes.map((attribute) =>
            attribute.attribute_id === updatedAttribute.attribute_id
              ? {
                  ...attribute,
                  ...updatedAttribute,
                }
              : attribute,
          );
          this.applyFilters();
          return;
        }

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

  addAttributeToCategory(attribute: ProductAttributeResponseDto): void {
    const categoryId = Number(this.assignForm.get('categoryId')!.value);
    const categoryName = this.selectedCategoryName;

    if (!categoryId) {
      window.alert('You need to select category to add attribute into category.');
      return;
    }

    if (this.isSelectedAttr(attribute.attribute_id)) {
      window.alert(
        `"${attribute.attribute_name}" is already selected for "${categoryName}".`,
      );
      return;
    }

    this.pendingAssignAttribute = attribute;
    this.assignConfirmOpen = true;
  }

  closeAssignConfirm(): void {
    this.assignConfirmOpen = false;
    this.pendingAssignAttribute = null;
  }

  confirmAssignAttribute(): void {
    const categoryId = Number(this.assignForm.get('categoryId')!.value);
    const attribute = this.pendingAssignAttribute;
    if (!attribute || !categoryId || this.savingAssignment) {
      this.closeAssignConfirm();
      return;
    }

    const nextAttributeIds = [...this.selectedAttributeIds, attribute.attribute_id];
    const payload: SaveProductCategoryAttributeAssignmentDto = {
      category_id: categoryId,
      attribute_ids: nextAttributeIds,
      is_active: true,
    };

    this.savingAssignment = true;
    this.productCategoryAttributeService
      .productCategoryAttributeControllerSaveAssignment(payload)
      .pipe(finalize(() => (this.savingAssignment = false)))
      .subscribe({
        next: (response: any) => {
          if (response?.success === false && response?.already_added) {
            this.toastService.error(
              this.getAlreadyAssignedMessage(response),
            );
            this.closeAssignConfirm();
            return;
          }

          this.assignForm.patchValue({ attributeIds: nextAttributeIds });
          if (
            !this.workspaceAttributes.some(
              (item) => item.attribute_id === attribute.attribute_id,
            )
          ) {
            this.workspaceAttributes = [...this.workspaceAttributes, attribute];
          }
          this.toastService.success('Attribute assigned successfully.');
          this.closeAssignConfirm();
        },
        error: (error) => {
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to assign attribute.'),
          );
        },
      });
  }

  getAttributeValueCount(attributeId: number): number {
    const draftAttributeId = this.selectedValueAttribute?.attribute_id;
    if (this.valuesModalOpen && draftAttributeId === attributeId) {
      return this.valueDraftItems.length;
    }

    return (
      this.attributes.find((item) => item.attribute_id === attributeId)?.value_count ??
      this.attributeValuesByAttributeId.get(attributeId)?.length ??
      0
    );
  }

  getAttributeValuePreview(attributeId: number, limit = 3): string {
    const draftAttributeId = this.selectedValueAttribute?.attribute_id;
    if (this.valuesModalOpen && draftAttributeId === attributeId) {
      const draftPreview = this.valueDraftItems
        .slice(0, limit)
        .map((item) => item.label)
        .filter(Boolean)
        .join(', ');

      return draftPreview || 'No values added';
    }

    const attribute = this.attributes.find((item) => item.attribute_id === attributeId);
    const preview = attribute?.values?.slice(0, limit).join(', ');
    return preview || 'No values added';
  }

  getCategoryValueCount(attributeId: number): number {
    const categoryId = Number(this.assignForm.get('categoryId')!.value);
    if (!categoryId) {
      return 0;
    }

    return this.getCategorySelectedValueIds(categoryId, attributeId).length;
  }

  getCategoryValuePreview(attributeId: number, limit = 3): string {
    const categoryId = Number(this.assignForm.get('categoryId')!.value);
    if (!categoryId) {
      return 'Select category first';
    }

    const selectedIds = this.getCategorySelectedValueIds(categoryId, attributeId);
    if (selectedIds.length === 0) {
      return 'No values selected';
    }

    const values = this.attributeValuesByAttributeId.get(attributeId) ?? [];
    const preview = selectedIds
      .map((id) => values.find((item) => item.value_id === id)?.attribute_value)
      .filter((value): value is string => !!value)
      .slice(0, limit)
      .join(', ');

    return preview || 'No values selected';
  }

  getAssignedCategoryNames(attributeId: number, limit = 2): string {
    const attribute = this.attributes.find((item) => item.attribute_id === attributeId);
    const assignedCategoryCount = attribute?.assigned_category_count ?? 0;
    if (assignedCategoryCount > 0) {
      return `${assignedCategoryCount} categor${assignedCategoryCount === 1 ? 'y' : 'ies'} assigned`;
    }

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
    const categoryId = Number(this.assignForm.get('categoryId')!.value);
    if (!categoryId) {
      this.toastService.warning('Select a category first.');
      return;
    }

    this.selectedValueAttribute = attribute;
    this.valueOriginalItems = [];
    this.valueDraftItems = [];
    this.valueSearch = '';
    this.valueSelectionFilter = 'all';
    this.valueSortBy = 'new_first';
    this.valueDateFrom = '';
    this.valueDateTo = '';
    this.newValueLabel = '';
    this.closeAddValuesModal();
    this.editingValueId = null;
    this.editingValueLabel = '';
    this.selectedValueIdsDraft = [];
    this.valuePage = 1;
    this.valueTotalItems = 0;
    this.valuesModalOpen = true;
    this.loadAttributeValuesWorkspace(categoryId, attribute.attribute_id);
  }

  closeValuesModal(): void {
    this.valuesModalOpen = false;
    this.selectedValueAttribute = null;
    this.duplicateValueConfirmOpen = false;
    this.pendingDuplicateValue = null;
    this.closeAddValuesModal();
    this.valueOriginalItems = [];
    this.valueDraftItems = [];
    this.selectedValueIdsDraft = [];
    this.valueSearch = '';
    this.valueSelectionFilter = 'all';
    this.valueSortBy = 'new_first';
    this.valueDateFrom = '';
    this.valueDateTo = '';
    this.newValueLabel = '';
    this.editingValueId = null;
    this.editingValueLabel = '';
    this.valuePage = 1;
    this.valueTotalItems = 0;
  }

  applyValueFilters(): void {
    this.applyingValueFilters = true;
    this.valuePage = 1;
    this.reloadAttributeValuesWorkspace();
  }

  prevValuePage(): void {
    if (this.valuePage > 1) {
      this.valuePage -= 1;
      this.reloadAttributeValuesWorkspace();
    }
  }

  nextValuePage(): void {
    if (this.valuePage < this.valueTotalPages) {
      this.valuePage += 1;
      this.reloadAttributeValuesWorkspace();
    }
  }

  saveValueSelections(): void {
    const attributeId = this.selectedValueAttribute?.attribute_id;
    const categoryId = Number(this.assignForm.get('categoryId')!.value);
    if (!attributeId || !categoryId || this.savingValues) {
      return;
    }

    const originalById = new Map(
      this.valueOriginalItems
        .filter((item) => item.persisted)
        .map((item) => [item.id, item]),
    );
    const draftIds = new Set(
      this.valueDraftItems.filter((item) => item.persisted).map((item) => item.id),
    );

    const requests = [
      ...this.valueDraftItems
        .filter((item) => !item.persisted)
        .map((item) =>
          this.productAttributeValuesService.productAttributeValuesControllerCreate({
            attribute_id: attributeId,
            attribute_value: item.label,
            is_active: item.selected,
          }),
        ),
      ...this.valueDraftItems
        .filter((item) => item.persisted)
        .filter((item) => {
          const original = originalById.get(item.id);
          return !!original && original.label !== item.label;
        })
        .map((item) =>
          this.productAttributeValuesService.productAttributeValuesControllerUpdate(
            String(item.id),
            {
              attribute_id: attributeId,
              attribute_value: item.label,
              is_active: true,
            },
          ),
        ),
      ...this.valueOriginalItems
        .filter((item) => item.persisted && !draftIds.has(item.id))
        .map((item) =>
          this.productAttributeValuesService.productAttributeValuesControllerRemove(
            String(item.id),
          ),
        ),
    ];

    const saveSelectionPayload: SaveProductCategoryAttributeValuesDto = {
      category_id: categoryId,
      attribute_id: attributeId,
      value_ids: this.selectedValueIdsDraft,
      is_active: true,
    };

    this.savingValues = true;
    forkJoin([
      ...(requests.length ? requests : [of([])]),
      this.productCategoryAttributeService.productCategoryAttributeControllerSaveAttributeValues(
        saveSelectionPayload,
      ),
    ])
      .pipe(finalize(() => (this.savingValues = false)))
      .subscribe({
        next: () => {
          this.toastService.success('Attribute values saved successfully.');
          this.categoryAttributeValueIds.set(
            this.getCategoryAttributeKey(categoryId, attributeId),
            saveSelectionPayload.value_ids,
          );
          this.syncAttributeValueState(attributeId);
          this.closeValuesModal();
          this.loadAttributes();
        },
        error: (error) => {
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to save attribute values.'),
          );
        },
      });
  }

  addValueToServer(): void {
    const label = this.newValueLabel.trim();
    const attributeId = this.selectedValueAttribute?.attribute_id;

    if (!attributeId || !label || this.addingValue) {
      return;
    }

    this.addingValue = true;
    this.productAttributeValuesService
      .productAttributeValuesControllerCreate({
        attribute_id: attributeId,
        attribute_value: label,
        is_active: true,
      })
      .pipe(finalize(() => (this.addingValue = false)))
      .subscribe({
        next: (createdValue) => {
          const existingValue = this.extractAlreadyAddedValue(
            createdValue,
            attributeId,
            label,
          );
          if (existingValue) {
            this.pendingDuplicateValue = existingValue;
            this.duplicateValueConfirmOpen = true;
            return;
          }

          const newItem = this.toDraftValueItem(createdValue, true);
          this.valueDraftItems = [
            newItem,
            ...this.valueDraftItems.filter((item) => item.id !== newItem.id),
          ];
          this.valueOriginalItems = [
            newItem,
            ...this.valueOriginalItems.filter((item) => item.id !== newItem.id),
          ];
          this.selectedValueIdsDraft = [
            newItem.id,
            ...this.selectedValueIdsDraft.filter((id) => id !== newItem.id),
          ];
          this.valueTotalItems += 1;
          this.newValueLabel = '';
          this.syncAttributeValueState(attributeId);
          this.toastService.success('Value added successfully.');
        },
        error: (error) => {
          const existingValue = this.extractAlreadyAddedValue(
            error,
            attributeId,
            label,
          );
          if (existingValue) {
            this.pendingDuplicateValue = existingValue;
            this.duplicateValueConfirmOpen = true;
            return;
          }

          this.toastService.error(
            this.getErrorMessage(error, 'Failed to add value.'),
          );
        },
      });
  }

  openAddValuesModal(mode: AddValuesMode = 'year_range'): void {
    if (!this.selectedValueAttribute?.attribute_id) return;
    this.addValuesModalOpen = true;
    this.setAddValuesMode(mode);
  }

  closeAddValuesModal(): void {
    this.addValuesModalOpen = false;
    this.addValuesBusy = false;
    this.addValuesProgress = null;
    this.addValuesBrandSearchInput = '';
    this.addValuesCategorySearchInput = '';
    this.addValuesModelSearchInput = '';
    this.addValuesBrandSearchApplied = '';
    this.addValuesCategorySearchApplied = '';
    this.addValuesModelSearchApplied = '';
    this.addValuesSelectedBrandIds.clear();
    this.addValuesSelectedCategoryIds.clear();
    this.addValuesSelectedModelIds.clear();
    this.addValuesModels = [];
    this.addValuesBrands = [];
    this.addValuesCategories = [];
    this.addValuesBrandsLoading = false;
    this.addValuesCategoriesLoading = false;
    this.addValuesModelsLoading = false;
    this.addValuesBrandsPage = 1;
    this.addValuesCategoriesPage = 1;
    this.addValuesModelsPage = 1;
    this.addValuesBrandsTotalPages = 1;
    this.addValuesCategoriesTotalPages = 1;
    this.addValuesModelsTotalPages = 1;
    this.addValuesBrandsHasNext = false;
    this.addValuesCategoriesHasNext = false;
    this.addValuesModelsHasNext = false;
    this.addValuesBrandNameById.clear();
    this.addValuesCategoryNameById.clear();
    this.addValuesModelNameById.clear();
    this.addValuesYearFrom = new Date().getFullYear();
    this.addValuesYearTo = new Date().getFullYear();
    this.clearAddValuesSearchTimers();
  }

  setAddValuesMode(mode: AddValuesMode): void {
    this.addValuesMode = mode;
    this.addValuesProgress = null;
    this.addValuesSelectedBrandIds.clear();
    this.addValuesSelectedCategoryIds.clear();
    this.addValuesSelectedModelIds.clear();
    this.addValuesBrandNameById.clear();
    this.addValuesCategoryNameById.clear();
    this.addValuesModelNameById.clear();

    if (mode === 'brands') {
      this.addValuesBrandsPage = 1;
      this.loadAddValuesBrands(1, this.addValuesBrandSearchApplied);
    }

    if (mode === 'categories') {
      this.addValuesCategoriesPage = 1;
      this.loadAddValuesCategories(1, this.addValuesCategorySearchApplied);
    }

    if (mode === 'models') {
      this.addValuesModelsPage = 1;
      this.loadAddValuesModels(1, this.addValuesModelSearchApplied);
    }
  }

  onAddValuesBrandSearchChange(value: string): void {
    this.addValuesBrandSearchInput = value;
    if (this.addValuesBrandSearchHandle) {
      clearTimeout(this.addValuesBrandSearchHandle);
    }
    this.addValuesBrandSearchHandle = window.setTimeout(() => {
      this.addValuesBrandSearchApplied = this.addValuesBrandSearchInput.trim();
      this.addValuesBrandsPage = 1;
      this.loadAddValuesBrands(1, this.addValuesBrandSearchApplied);
    }, 2000);
  }

  onAddValuesCategorySearchChange(value: string): void {
    this.addValuesCategorySearchInput = value;
    if (this.addValuesCategorySearchHandle) {
      clearTimeout(this.addValuesCategorySearchHandle);
    }
    this.addValuesCategorySearchHandle = window.setTimeout(() => {
      this.addValuesCategorySearchApplied = this.addValuesCategorySearchInput.trim();
      this.addValuesCategoriesPage = 1;
      this.loadAddValuesCategories(1, this.addValuesCategorySearchApplied);
    }, 2000);
  }

  onAddValuesModelSearchChange(value: string): void {
    this.addValuesModelSearchInput = value;
    if (this.addValuesModelSearchHandle) {
      clearTimeout(this.addValuesModelSearchHandle);
    }
    this.addValuesModelSearchHandle = window.setTimeout(() => {
      this.addValuesModelSearchApplied = this.addValuesModelSearchInput.trim();
      this.addValuesModelsPage = 1;
      this.loadAddValuesModels(1, this.addValuesModelSearchApplied);
    }, 2000);
  }

  toggleAddValuesBrand(brand: CarBrandResponseDto): void {
    const id = Number((brand as any).car_brand_id ?? 0);
    const name = String((brand as any).car_brand_name ?? '').trim();
    if (!id) return;
    if (name) this.addValuesBrandNameById.set(id, name);

    const next = new Set(this.addValuesSelectedBrandIds);
    next.has(id) ? next.delete(id) : next.add(id);
    this.addValuesSelectedBrandIds = next;
  }

  toggleAddValuesCategory(category: ProductCategoryResponseDto): void {
    const id = Number((category as any).category_id ?? 0);
    const name = String((category as any).category_name ?? '').trim();
    if (!id) return;
    if (name) this.addValuesCategoryNameById.set(id, name);

    const next = new Set(this.addValuesSelectedCategoryIds);
    next.has(id) ? next.delete(id) : next.add(id);
    this.addValuesSelectedCategoryIds = next;
  }

  toggleAddValuesModel(model: CarBrandModelResponseDto): void {
    const id = Number((model as any).model_id ?? 0);
    const name = String((model as any).model_name ?? '').trim();
    if (!id) return;
    if (name) this.addValuesModelNameById.set(id, name);

    const next = new Set(this.addValuesSelectedModelIds);
    next.has(id) ? next.delete(id) : next.add(id);
    this.addValuesSelectedModelIds = next;
  }

  prevAddValuesBrandsPage(): void {
    if (this.addValuesBrandsPage <= 1 || this.addValuesBrandsLoading) return;
    this.addValuesBrandsPage -= 1;
    this.loadAddValuesBrands(this.addValuesBrandsPage, this.addValuesBrandSearchApplied);
  }

  nextAddValuesBrandsPage(): void {
    if (!this.addValuesBrandsHasNext || this.addValuesBrandsLoading) return;
    this.addValuesBrandsPage += 1;
    this.loadAddValuesBrands(this.addValuesBrandsPage, this.addValuesBrandSearchApplied);
  }

  prevAddValuesCategoriesPage(): void {
    if (this.addValuesCategoriesPage <= 1 || this.addValuesCategoriesLoading) return;
    this.addValuesCategoriesPage -= 1;
    this.loadAddValuesCategories(this.addValuesCategoriesPage, this.addValuesCategorySearchApplied);
  }

  nextAddValuesCategoriesPage(): void {
    if (!this.addValuesCategoriesHasNext || this.addValuesCategoriesLoading) return;
    this.addValuesCategoriesPage += 1;
    this.loadAddValuesCategories(this.addValuesCategoriesPage, this.addValuesCategorySearchApplied);
  }

  prevAddValuesModelsPage(): void {
    if (this.addValuesModelsPage <= 1 || this.addValuesModelsLoading) return;
    this.addValuesModelsPage -= 1;
    this.loadAddValuesModels(this.addValuesModelsPage, this.addValuesModelSearchApplied);
  }

  nextAddValuesModelsPage(): void {
    if (!this.addValuesModelsHasNext || this.addValuesModelsLoading) return;
    this.addValuesModelsPage += 1;
    this.loadAddValuesModels(this.addValuesModelsPage, this.addValuesModelSearchApplied);
  }

  confirmAddValuesFromDialog(): void {
    const attributeId = this.selectedValueAttribute?.attribute_id;
    if (!attributeId || this.addValuesBusy) return;

    const labels = this.buildAddValuesLabels();
    if (labels.length === 0) {
      this.toastService.warning('Select at least one value to add.');
      return;
    }

    const uniqueLabels = this.uniqueLabels(labels);
    this.addValuesBusy = true;
    this.addValuesProgress = { total: uniqueLabels.length, done: 0 };

    from(uniqueLabels)
      .pipe(
        mergeMap((label) => this.createOrSelectValueByLabel(attributeId, label), 5),
        finalize(() => {
          this.addValuesBusy = false;
          this.addValuesProgress = null;
          this.reloadAttributeValuesWorkspace();
        }),
      )
      .subscribe({
        next: () => {
          if (!this.addValuesProgress) return;
          this.addValuesProgress = {
            ...this.addValuesProgress,
            done: Math.min(this.addValuesProgress.done + 1, this.addValuesProgress.total),
          };
        },
        error: (error) => {
          this.toastService.error(this.getErrorMessage(error, 'Failed to add values.'));
        },
        complete: () => {
          this.toastService.success('Values added successfully.');
          this.closeAddValuesModal();
        },
      });
  }

  onAddValuesYearFromChange(value: number): void {
    this.addValuesYearFrom = Number(value);
    this.ensureAddValuesYearOrder();
  }

  onAddValuesYearToChange(value: number): void {
    this.addValuesYearTo = Number(value);
    this.ensureAddValuesYearOrder();
  }

  private buildAddValuesLabels(): string[] {
    switch (this.addValuesMode) {
      case 'year_range':
        return this.buildYearRange(this.addValuesYearFrom, this.addValuesYearTo).map(String);
      case 'brands': {
        return [...this.addValuesSelectedBrandIds]
          .map((id) => this.addValuesBrandNameById.get(id) ?? '')
          .map((item) => item.trim())
          .filter(Boolean);
      }
      case 'categories': {
        return [...this.addValuesSelectedCategoryIds]
          .map((id) => this.addValuesCategoryNameById.get(id) ?? '')
          .map((item) => item.trim())
          .filter(Boolean);
      }
      case 'models': {
        return [...this.addValuesSelectedModelIds]
          .map((id) => this.addValuesModelNameById.get(id) ?? '')
          .map((item) => item.trim())
          .filter(Boolean);
      }
      default:
        return [];
    }
  }

  private uniqueLabels(labels: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const label of labels) {
      const normalized = this.normalizeValueLabel(label);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(label.trim());
    }
    return result;
  }

  private normalizeValueLabel(label: string): string {
    return String(label ?? '').trim().toLowerCase();
  }

  private buildYearRange(fromYear: number, toYear: number): number[] {
    const a = Number(fromYear);
    const b = Number(toYear);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    const years: number[] = [];
    for (let y = start; y <= end; y += 1) years.push(y);
    return years;
  }

  private createOrSelectValueByLabel(attributeId: number, label: string) {
    const trimmed = label.trim();
    if (!trimmed) return of(null);

    const existing = this.valueDraftItems.find(
      (item) => item.label.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      if (!existing.selected) {
        this.toggleValueDraft(existing.id);
      }
      return of(null);
    }

    return this.productAttributeValuesService
      .productAttributeValuesControllerCreate({
        attribute_id: attributeId,
        attribute_value: trimmed,
        is_active: true,
      })
      .pipe(
        catchError((error) => {
          const existingValue = this.extractAlreadyAddedValue(error, attributeId, trimmed);
          if (existingValue) {
            this.selectExistingDraftValue(existingValue);
            return of(existingValue);
          }
          this.toastService.error(this.getErrorMessage(error, `Failed to add "${trimmed}".`));
          return of(null);
        }),
      );
  }

  private ensureAddValuesYearOrder(): void {
    if (!Number.isFinite(this.addValuesYearFrom) || !Number.isFinite(this.addValuesYearTo)) {
      return;
    }
    if (this.addValuesYearFrom <= this.addValuesYearTo) return;
    const from = this.addValuesYearFrom;
    this.addValuesYearFrom = this.addValuesYearTo;
    this.addValuesYearTo = from;
  }

  private clearAddValuesSearchTimers(): void {
    if (this.addValuesBrandSearchHandle) {
      clearTimeout(this.addValuesBrandSearchHandle);
      this.addValuesBrandSearchHandle = null;
    }
    if (this.addValuesCategorySearchHandle) {
      clearTimeout(this.addValuesCategorySearchHandle);
      this.addValuesCategorySearchHandle = null;
    }
    if (this.addValuesModelSearchHandle) {
      clearTimeout(this.addValuesModelSearchHandle);
      this.addValuesModelSearchHandle = null;
    }
  }

  private normalizeListMeta(meta: unknown, page: number, limit: number): { total: number; totalPages: number } {
    const source = (meta ?? {}) as Record<string, unknown>;
    const total =
      this.toNumber(source['total']) ??
      this.toNumber(source['count']) ??
      this.toNumber(source['itemCount']) ??
      this.toNumber(source['totalItems']) ??
      0;
    const totalPages =
      this.toNumber(source['totalPages']) ??
      this.toNumber(source['pageCount']) ??
      Math.max(1, Math.ceil((total || 0) / Math.max(limit, 1)));
    const normalizedPages = Math.max(1, totalPages);
    const normalizedTotal = total || normalizedPages * limit;
    return { total: normalizedTotal, totalPages: normalizedPages };
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const normalized = String(value ?? '').trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private loadAddValuesBrands(page: number, search?: string): void {
    const params: Record<string, string | number | boolean> = {
      page,
      limit: this.addValuesPageSize,
      is_active: true,
    };
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      params['search'] = normalizedSearch;
      params['q'] = normalizedSearch;
    }

    this.addValuesBrandsLoading = true;
    this.carBrandService
      .carBrandControllerList({
        params,
      })
      .pipe(finalize(() => (this.addValuesBrandsLoading = false)))
      .subscribe({
        next: (response: any) => {
          this.addValuesBrands = response?.data ?? [];
          const meta = this.normalizeListMeta(response?.meta, page, this.addValuesPageSize);
          this.addValuesBrandsTotalPages = meta.totalPages;
          this.addValuesBrandsHasNext =
            this.addValuesBrandsTotalPages > 1
              ? page < this.addValuesBrandsTotalPages
              : this.addValuesBrands.length >= this.addValuesPageSize;
          for (const brand of this.addValuesBrands) {
            const id = Number((brand as any).car_brand_id ?? 0);
            const name = String((brand as any).car_brand_name ?? '').trim();
            if (id && name) this.addValuesBrandNameById.set(id, name);
          }
        },
        error: () => {
          this.addValuesBrands = [];
          this.addValuesBrandsTotalPages = 1;
          this.addValuesBrandsHasNext = false;
          this.toastService.error('Failed to load brands.');
        },
      });
  }

  private loadAddValuesCategories(page: number, search?: string): void {
    const params: Record<string, string | number | boolean> = {
      page,
      limit: this.addValuesPageSize,
      is_active: true,
      is_deleted: false,
    };
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      params['search'] = normalizedSearch;
      params['q'] = normalizedSearch;
    }

    this.addValuesCategoriesLoading = true;
    this.productCategoryService
      .productCategoryControllerList({
        params,
      })
      .pipe(finalize(() => (this.addValuesCategoriesLoading = false)))
      .subscribe({
        next: (response: any) => {
          this.addValuesCategories = response?.data ?? [];
          const meta = this.normalizeListMeta(response?.meta, page, this.addValuesPageSize);
          this.addValuesCategoriesTotalPages = meta.totalPages;
          this.addValuesCategoriesHasNext =
            this.addValuesCategoriesTotalPages > 1
              ? page < this.addValuesCategoriesTotalPages
              : this.addValuesCategories.length >= this.addValuesPageSize;
          for (const category of this.addValuesCategories) {
            const id = Number((category as any).category_id ?? 0);
            const name = String((category as any).category_name ?? '').trim();
            if (id && name) this.addValuesCategoryNameById.set(id, name);
          }
        },
        error: () => {
          this.addValuesCategories = [];
          this.addValuesCategoriesTotalPages = 1;
          this.addValuesCategoriesHasNext = false;
          this.toastService.error('Failed to load categories.');
        },
      });
  }

  private loadAddValuesModels(page: number, search?: string): void {
    this.addValuesModelsLoading = true;
    this.carBrandModelService
      .carBrandModelControllerList({
        page,
        limit: this.addValuesPageSize,
        search: search?.trim() || undefined,
        is_active: true,
      })
      .pipe(finalize(() => (this.addValuesModelsLoading = false)))
      .subscribe({
        next: (response: PaginatedCarBrandModelResponseDto) => {
          this.addValuesModels = response.data ?? [];
          const meta = this.normalizeListMeta(response.meta, page, this.addValuesPageSize);
          this.addValuesModelsTotalPages = meta.totalPages;
          this.addValuesModelsHasNext =
            this.addValuesModelsTotalPages > 1
              ? page < this.addValuesModelsTotalPages
              : this.addValuesModels.length >= this.addValuesPageSize;
          for (const model of this.addValuesModels) {
            const id = Number((model as any).model_id ?? 0);
            const name = String((model as any).model_name ?? '').trim();
            if (id && name) this.addValuesModelNameById.set(id, name);
          }
        },
        error: () => {
          this.addValuesModels = [];
          this.addValuesModelsTotalPages = 1;
          this.addValuesModelsHasNext = false;
          this.toastService.error('Failed to load models.');
        },
      });
  }

  toggleValueDraft(valueId: number): void {
    if (!this.selectedValueAttribute?.attribute_id) {
      return;
    }

    this.valueDraftItems = this.valueDraftItems.map((item) =>
      item.id === valueId ? { ...item, selected: !item.selected } : item,
    );
    this.selectedValueIdsDraft = this.selectedValueIdsDraft.includes(valueId)
      ? this.selectedValueIdsDraft.filter((id) => id !== valueId)
      : [valueId, ...this.selectedValueIdsDraft];
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
    const label = this.editingValueLabel.trim();
    if (!this.selectedValueAttribute?.attribute_id || !label) {
      return;
    }

    this.valueDraftItems = this.valueDraftItems.map((item) =>
      item.id === valueId ? { ...item, label } : item,
    );
    this.cancelEditingValue();
  }

  deleteValueDraft(valueId: number): void {
    if (!this.selectedValueAttribute?.attribute_id) {
      return;
    }

    this.valueDraftItems = this.valueDraftItems.filter((item) => item.id !== valueId);
    this.selectedValueIdsDraft = this.selectedValueIdsDraft.filter(
      (id) => id !== valueId,
    );
    if (this.editingValueId === valueId) {
      this.cancelEditingValue();
    }
  }

  closeDuplicateValueConfirm(): void {
    this.duplicateValueConfirmOpen = false;
    this.pendingDuplicateValue = null;
  }

  confirmSelectDuplicateValue(): void {
    const attributeId = this.selectedValueAttribute?.attribute_id;
    const duplicateValue = this.pendingDuplicateValue;
    if (!attributeId || !duplicateValue) {
      this.closeDuplicateValueConfirm();
      return;
    }

    this.selectExistingDraftValue(duplicateValue);
    this.newValueLabel = '';
    this.syncAttributeValueState(attributeId);
    this.closeDuplicateValueConfirm();
  }

  saveAssignment(): void {
    if (this.assignForm.invalid || this.savingAssignment) {
      this.assignForm.markAllAsTouched();
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
        this.categories = (response.data ?? []).filter((item) => item.is_active);
        this.selectedCategoryLabel = this.resolveSelectedCategoryName();
      },
      error: () => {
        this.toastService.error('Failed to load categories.');
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
        category_id: Number(categoryId),
        brand_id: Number(brandId),
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
      this.workspaceAttributes = [];
      return;
    }

    const params: ProductCategoryAttributeControllerWorkspaceParams = {
      page: this.assignmentPage,
      limit: this.assignmentPageSize,
      category_id: value.categoryId ? Number(value.categoryId) : undefined,
    };

    this.assignmentLoading = true;
    this.productCategoryAttributeService
      .productCategoryAttributeControllerWorkspace<any>(params)
      .pipe(finalize(() => (this.assignmentLoading = false)))
      .subscribe({
        next: (response) => {
          const categoryId = Number(value.categoryId);
          this.selectedCategoryLabel =
            String(response?.category_name ?? '').trim() || this.selectedCategoryName;
          this.workspaceAttributes = this.extractWorkspaceAttributes(response);
          this.assignmentTotalItems = this.extractWorkspaceTotal(
            response,
            this.workspaceAttributes.length,
          );
          this.hydrateWorkspaceAttributeValues(response, categoryId);
          const selectedIds = this.mergeSelectedAttributeIds(
            this.selectedAttributeIds,
            this.workspaceAttributes.map((item) => item.attribute_id),
            this.extractWorkspaceAttributeIds(response),
          );
          this.assignForm.patchValue(
            { attributeIds: selectedIds },
            { emitEvent: false },
          );
        },
        error: () => {
          this.workspaceAttributes = [];
          this.assignmentTotalItems = 0;
          this.assignForm.patchValue(
            { attributeIds: [] },
            { emitEvent: false },
          );
        },
      });
  }

  private extractWorkspaceAttributes(response: any): ProductAttributeResponseDto[] {
    const candidates = [
      response?.attributes,
      response?.data?.attributes,
      response?.workspace?.attributes,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        const mappedAttributes: Array<ProductAttributeResponseDto | null> = candidate.map(
          (item: any) => {
            const attributeId = Number(item?.attribute_id ?? item?.id ?? 0);
            if (!attributeId) {
              return null;
            }

            const existing = this.attributes.find(
              (attribute) => attribute.attribute_id === attributeId,
            );

            const normalizedValues = Array.isArray(item?.values)
              ? item.values
                  .map((value: any) => String(value?.attribute_value ?? value?.value ?? ''))
                  .filter((value: string) => !!value)
              : existing?.values ?? [];

            return (
              existing
                ? {
                    ...existing,
                    attribute_name: String(
                      item?.attribute_name ?? existing.attribute_name ?? 'Attribute',
                    ),
                    is_active: Boolean(item?.is_active ?? existing.is_active ?? true),
                    values: normalizedValues,
                    value_count: Number(item?.value_count ?? normalizedValues.length ?? 0),
                  }
                : {
                    attribute_id: attributeId,
                    attribute_name: String(
                      item?.attribute_name ?? item?.name ?? 'Attribute',
                    ),
                    is_active: Boolean(item?.is_active ?? true),
                    is_deleted: Boolean(item?.is_deleted ?? false),
                    created_by: undefined,
                    values: normalizedValues,
                    value_count: Number(item?.value_count ?? normalizedValues.length ?? 0),
                    assigned_category_count: 0,
                  }
            );
          },
        );

        return mappedAttributes.filter(
          (item): item is ProductAttributeResponseDto => item !== null,
        );
      }
    }

    return [];
  }

  private hydrateWorkspaceAttributeValues(response: any, categoryId: number): void {
    const candidates = [
      response?.attributes,
      response?.data?.attributes,
      response?.workspace?.attributes,
    ];

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }

      candidate.forEach((item: any) => {
        const attributeId = Number(item?.attribute_id ?? item?.id ?? 0);
        if (!attributeId) {
          return;
        }

        const values = Array.isArray(item?.values)
          ? item.values
              .map((value: any) => ({
                value_id: Number(value?.value_id ?? value?.id ?? 0),
                attribute_id: attributeId,
                attribute_name: String(
                  item?.attribute_name ??
                    this.workspaceAttributes.find(
                      (attribute) => attribute.attribute_id === attributeId,
                    )?.attribute_name ??
                    '',
                ),
                attribute_value: String(
                  value?.attribute_value ?? value?.value ?? value?.label ?? '',
                ),
                is_active: Boolean(value?.is_active ?? true),
                is_deleted: Boolean(value?.is_deleted ?? false),
              }))
              .filter(
                (value: ProductAttributeValuesResponseDto) =>
                  value.value_id > 0 && !!value.attribute_value,
              )
          : [];

        this.attributeValuesByAttributeId.set(attributeId, values);
        this.categoryAttributeValueIds.set(
          this.getCategoryAttributeKey(categoryId, attributeId),
          values.map((value: ProductAttributeValuesResponseDto) => value.value_id),
        );
      });

      return;
    }
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

    const attributeCandidates = [
      response?.attributes,
      response?.data?.attributes,
      response?.workspace?.attributes,
    ];

    for (const candidate of attributeCandidates) {
      if (Array.isArray(candidate)) {
        return candidate
          .filter((item: any) => Boolean(item?.is_assigned))
          .map((item: any) => Number(item?.attribute_id ?? item?.id ?? 0))
          .filter((value) => Number.isFinite(value) && value > 0);
      }
    }

    return [];
  }

  private resolveSelectedCategoryName(): string {
    const id = Number(this.assignForm.get('categoryId')!.value);
    if (!id) {
      return '';
    }

    return (
      this.categories.find((item) => item.category_id === id)?.category_name || ''
    );
  }

  private getAlreadyAssignedMessage(response: any): string {
    const baseMessage =
      typeof response?.message === 'string' && response.message.trim()
        ? response.message.trim()
        : 'One or more attributes are already assigned to this category.';

    const attributeNames = Array.isArray(response?.data)
      ? response.data
          .map((item: any) => String(item?.attribute_name ?? '').trim())
          .filter((name: string) => !!name)
      : [];

    if (attributeNames.length === 0) {
      return baseMessage;
    }

    return `${baseMessage}: ${attributeNames.join(', ')}`;
  }

  private mergeSelectedAttributeIds(
    existingIds: number[],
    pageAttributeIds: number[],
    pageSelectedIds: number[],
  ): number[] {
    const pageSet = new Set(pageAttributeIds);
    const merged = existingIds.filter((id) => !pageSet.has(id));
    return [...merged, ...pageSelectedIds];
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

  private syncAttributeValueState(attributeId: number): void {
    const persistedItems = this.valueDraftItems.filter((item) => item.persisted);
    const attributeName =
      this.attributes.find((attribute) => attribute.attribute_id === attributeId)
        ?.attribute_name ?? '';
    const normalizedValues: ProductAttributeValuesResponseDto[] = persistedItems.map(
      (item) => ({
        attribute_id: attributeId,
        attribute_name: attributeName,
        attribute_value: item.label,
        is_active: item.selected,
        is_deleted: false,
        value_id: item.id,
      }),
    );

    this.attributeValuesByAttributeId.set(attributeId, normalizedValues);
    this.attributes = this.attributes.map((attribute) =>
      attribute.attribute_id === attributeId
        ? {
            ...attribute,
            values: persistedItems.map((item) => item.label),
            value_count: persistedItems.length,
          }
        : attribute,
    );
    this.applyFilters();
  }

  private reloadAttributeValuesWorkspace(): void {
    const categoryId = Number(this.assignForm.get('categoryId')!.value);
    const attributeId = this.selectedValueAttribute?.attribute_id;
    if (!categoryId || !attributeId) {
      return;
    }

    this.loadAttributeValuesWorkspace(categoryId, attributeId);
  }

  private loadAttributeValuesWorkspace(
    categoryId: number,
    attributeId: number,
  ): void {
    this.loadingValueSelection = true;
    this.productCategoryAttributeService
      .productCategoryAttributeControllerAttributeValuesWorkspace<any>({
        page: this.valuePage,
        limit: this.valuePageSize,
        category_id: categoryId,
        attribute_id: attributeId,
        search: this.valueSearch.trim() || undefined,
        selection:
          this.valueSelectionFilter === 'all'
            ? undefined
            : this.valueSelectionFilter,
        sortBy: this.valueSortBy || undefined,
        dateFrom: this.valueDateFrom || undefined,
        dateTo: this.valueDateTo || undefined,
      })
      .pipe(
        finalize(() => {
          this.loadingValueSelection = false;
          this.applyingValueFilters = false;
        }),
      )
      .subscribe({
        next: (response) => {
          const workspaceValues = this.extractWorkspaceValueItems(response, attributeId);
          const selectedIds = this.extractSelectedValueIds(response);
          this.attributeValuesByAttributeId.set(attributeId, workspaceValues);

          const draftItems = workspaceValues.map((item) => ({
            id: item.value_id,
            label: item.attribute_value,
            selected: selectedIds.includes(item.value_id),
            persisted: true,
          }));

          this.valueOriginalItems = draftItems.map((item) => ({ ...item }));
          this.valueDraftItems = draftItems.map((item) => ({ ...item }));

          this.selectedValueIdsDraft = selectedIds;
          this.categoryAttributeValueIds.set(
            this.getCategoryAttributeKey(categoryId, attributeId),
            selectedIds,
          );
          this.applyCategorySelectionToDraft(selectedIds);
          this.valueTotalItems = this.extractWorkspaceTotal(
            response,
            workspaceValues.length,
          );
        },
        error: () => {
          const attribute = this.attributes.find((item) => item.attribute_id === attributeId);
          const fallbackItems = (attribute?.values ?? []).map((value, index) => ({
            id: index + 1,
            label: value,
            selected: false,
            persisted: true,
          }));
          this.valueOriginalItems = fallbackItems.map((item) => ({ ...item }));
          this.valueDraftItems = fallbackItems.map((item) => ({ ...item }));
          this.selectedValueIdsDraft = [];
          this.valueTotalItems = fallbackItems.length;
          this.categoryAttributeValueIds.set(
            this.getCategoryAttributeKey(categoryId, attributeId),
            [],
          );
          this.applyCategorySelectionToDraft([]);
        },
      });
  }

  private extractWorkspaceValueItems(
    response: any,
    attributeId: number,
  ): ProductAttributeValuesResponseDto[] {
    const candidates = [
      response?.values,
      response?.value_items,
      response?.items,
      response?.data?.values,
      response?.data?.value_items,
      response?.data?.items,
      response?.workspace?.values,
      response?.workspace?.value_items,
      response?.workspace?.items,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate
          .map((item: any, index: number) => ({
            value_id: Number(item?.value_id ?? item?.id ?? index + 1),
            attribute_id: Number(item?.attribute_id ?? attributeId),
            attribute_name: String(
              item?.attribute_name ??
                this.selectedValueAttribute?.attribute_name ??
                '',
            ),
            attribute_value: String(
              item?.attribute_value ?? item?.value ?? item?.label ?? '',
            ),
            is_active: Boolean(
              item?.is_active ?? true,
            ),
            is_deleted: Boolean(item?.is_deleted ?? false),
            created_at: item?.created_at,
            created_by: item?.created_by,
            updated_by: item?.updated_by,
          }))
          .filter((item) => !!item.attribute_value);
      }
    }

    const attribute = this.attributes.find((item) => item.attribute_id === attributeId);
    return (attribute?.values ?? []).map((value, index) => ({
      value_id: index + 1,
      attribute_id: attributeId,
      attribute_name: attribute?.attribute_name ?? '',
      attribute_value: value,
      is_active: false,
      is_deleted: false,
    }));
  }

  private applyCategorySelectionToDraft(selectedIds: number[]): void {
    const selected = new Set(selectedIds);
    this.valueOriginalItems = this.valueOriginalItems.map((item) => ({
      ...item,
      selected: selected.has(item.id),
    }));
    this.valueDraftItems = this.valueDraftItems.map((item) => ({
      ...item,
      selected: selected.has(item.id),
    }));
  }

  private selectExistingDraftValue(
    value: ProductAttributeValuesResponseDto,
  ): void {
    const existingItem = this.valueDraftItems.find((item) => item.id === value.value_id);
    const selectedItem: DummyAttributeValueItem = {
      ...(existingItem ?? this.toDraftValueItem(value, true)),
      id: value.value_id,
      label: value.attribute_value || existingItem?.label || '',
      selected: true,
      persisted: true,
    };

    this.valueDraftItems = [
      selectedItem,
      ...this.valueDraftItems.filter((item) => item.id !== selectedItem.id),
    ];
    this.valueOriginalItems = this.valueOriginalItems.some(
      (item) => item.id === selectedItem.id,
    )
      ? this.valueOriginalItems.map((item) =>
          item.id === selectedItem.id ? selectedItem : item,
        )
      : [selectedItem, ...this.valueOriginalItems];
    this.selectedValueIdsDraft = [
      selectedItem.id,
      ...this.selectedValueIdsDraft.filter((id) => id !== selectedItem.id),
    ];
    this.valueTotalItems = Math.max(this.valueTotalItems, this.valueDraftItems.length);
  }

  private extractAlreadyAddedValue(
    payloadSource: unknown,
    attributeId: number,
    fallbackLabel: string,
  ): ProductAttributeValuesResponseDto | null {
    const payload = this.extractAlreadyAddedPayload(payloadSource);
    if (!payload) {
      return null;
    }

    const duplicatePayload = payload as {
      already_added?: unknown;
      data?: Record<string, unknown>;
    };

    if (!duplicatePayload.already_added || !duplicatePayload.data) {
      return null;
    }

    const rawValueId = Number(duplicatePayload.data['value_id'] ?? 0);
    const normalizedLabel = String(
      duplicatePayload.data['attribute_value'] ??
        duplicatePayload.data['value'] ??
        fallbackLabel,
    ).trim();
    const existingValue =
      this.attributeValuesByAttributeId
        .get(attributeId)
        ?.find(
          (item) =>
            item.value_id === rawValueId ||
            item.attribute_value.toLowerCase() === normalizedLabel.toLowerCase(),
        ) ?? null;

    return {
      value_id: existingValue?.value_id ?? rawValueId,
      attribute_id:
        existingValue?.attribute_id ??
        Number(duplicatePayload.data['attribute_id'] ?? attributeId),
      attribute_name: String(
        duplicatePayload.data['attribute_name'] ??
          existingValue?.attribute_name ??
          this.selectedValueAttribute?.attribute_name ??
          '',
      ),
      attribute_value: existingValue?.attribute_value ?? normalizedLabel,
      is_active:
        existingValue?.is_active ??
        Boolean(duplicatePayload.data['is_active'] ?? true),
      is_deleted:
        existingValue?.is_deleted ??
        Boolean(duplicatePayload.data['is_deleted'] ?? false),
    };
  }

  private extractAlreadyAddedPayload(payloadSource: unknown): Record<string, unknown> | null {
    if (typeof payloadSource !== 'object' || payloadSource === null) {
      return null;
    }

    if (
      'already_added' in payloadSource &&
      typeof payloadSource['already_added'] !== 'undefined'
    ) {
      return payloadSource as Record<string, unknown>;
    }

    if (
      'error' in payloadSource &&
      typeof payloadSource.error === 'object' &&
      payloadSource.error !== null &&
      'already_added' in payloadSource.error
    ) {
      return payloadSource.error as Record<string, unknown>;
    }

    return null;
  }

  private toDraftValueItem(
    value: ProductAttributeValuesResponseDto,
    selected: boolean,
  ): DummyAttributeValueItem {
    return {
      id: value.value_id,
      label: value.attribute_value,
      selected,
      persisted: true,
    };
  }

  private extractSelectedValueIds(response: any): number[] {
    const candidates = [
      response?.value_ids,
      response?.selected_value_ids,
      response?.attribute_value_ids,
      response?.data?.value_ids,
      response?.data?.selected_value_ids,
      response?.data?.attribute_value_ids,
      response?.workspace?.value_ids,
      response?.workspace?.selected_value_ids,
      response?.workspace?.attribute_value_ids,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value));
      }
    }

    const valueCandidates = [
      response?.values,
      response?.data?.values,
      response?.workspace?.values,
    ];

    for (const candidate of valueCandidates) {
      if (Array.isArray(candidate)) {
        return candidate
          .filter((item: any) => Boolean(item?.is_selected))
          .map((item: any) => Number(item?.value_id ?? item?.id ?? 0))
          .filter((value) => Number.isFinite(value) && value > 0);
      }
    }

    return [];
  }

  private getCategorySelectedValueIds(
    categoryId: number,
    attributeId: number,
  ): number[] {
    return (
      this.categoryAttributeValueIds.get(
        this.getCategoryAttributeKey(categoryId, attributeId),
      ) ?? []
    );
  }

  private getCategoryAttributeKey(categoryId: number, attributeId: number): string {
    return `${categoryId}:${attributeId}`;
  }

  private extractWorkspaceTotal(response: any, fallback: number): number {
    const meta = response?.meta ?? response?.data?.meta ?? response?.workspace?.meta;
    const candidates = [
      meta?.total,
      meta?.totalItems,
      meta?.count,
      response?.total,
      response?.totalItems,
      response?.count,
    ];

    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
    }

    return fallback;
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

  private normalizeCategoryResponse(response: any): ProductCategoryResponseDto {
    return {
      category_id: Number(response?.category_id ?? 0),
      category_name: String(response?.category_name ?? ''),
      category_image: String(response?.category_image ?? ''),
      is_active: Boolean(response?.is_active),
      is_deleted: Boolean(response?.is_deleted),
    };
  }

  private normalizeAttributeResponse(response: any): ProductAttributeResponseDto {
    return {
      attribute_id: Number(response?.attribute_id ?? 0),
      attribute_name: String(response?.attribute_name ?? ''),
      is_active: Boolean(response?.is_active),
      is_deleted: Boolean(response?.is_deleted),
      created_by: response?.created_by,
      updated_by: response?.updated_by,
      created_by_profile: response?.created_by_profile ?? null,
      values: Array.isArray(response?.values) ? response.values.map(String) : [],
      value_count: Number(response?.value_count ?? 0),
      value_items: Array.isArray(response?.value_items)
        ? response.value_items
        : [],
      assigned_category_count: Number(response?.assigned_category_count ?? 0),
      assigned_categories: Array.isArray(response?.assigned_categories)
        ? response.assigned_categories
        : [],
    };
  }

  private toUpdatePayload(
    payload: CreateProductAttributeDto,
  ): UpdateProductAttributeDto {
    return {
      attribute_name: payload.attribute_name,
      is_active: payload.is_active,
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
