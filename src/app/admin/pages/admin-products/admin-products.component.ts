import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminCarBrandService as CarBrandService } from '../../../core/api/generated/admin-car-brand/admin-car-brand.service';
import { AdminCarBrandModelService as CarBrandModelService } from '../../../core/api/generated/admin-car-brand-model/admin-car-brand-model.service';
import { AdminProductCategoryService as ProductCategoryService } from '../../../core/api/generated/admin-product-category/admin-product-category.service';
import { AdminProductCategoryAttributeService as ProductCategoryAttributeService } from '../../../core/api/generated/admin-product-category-attribute/admin-product-category-attribute.service';
import { AdminProductsService as ProductsService } from '../../../core/api/generated/admin-products/admin-products.service';
import type {
  CarBrandModelResponseDto,
  CarBrandResponseDto,
  CreateUploadUrlDtoFolder,
  CreateProductsDto,
  ProductCategoryResponseDto,
  ProductCrossSellDto,
  ProductCrossSellItemDto,
  ProductSearchSuggestionDto,
  ProductDetailDto,
  UpdateProductsDto,
} from '../../../core/api/generated/schemas';
import { MediaUrlService } from '../../../core/media/media-url.service';
import { ToastService } from '../../../core/notification/toast.service';
import { AssetUploadService } from '../../../core/upload/asset-upload.service';

interface AttributeRow {
  key: string;
  value: string;
}

interface CategoryAttributeItem {
  attribute_id: number;
  attribute_name: string;
  values: string[];
}

interface PendingAssetItem {
  file: File;
  previewUrl: string;
}

interface CrossSellFormItem extends ProductCrossSellItemDto {
  title: string;
  sku: string;
  thumbnail_image?: string | null;
  currency?: string | null;
  price?: number | null;
}

interface CrossSellSearchOption {
  id: number;
  title: string;
  sku: string;
  thumbnail_image?: string | null;
  currency?: string | null;
  price?: number | null;
}

const RESERVED_ATTRIBUTE_FIELDS = [
  'fitments',
  'fitment_notes',
  'package_items',
  'notes',
  'universal_fit',
  'requires_serial',
  'supplier_sku',
  'procurement_type',
  'min_order_qty',
  'min_retail_qty',
  'min_dealer_qty',
  'return_window_days',
  'return_policy_note',
  'non_returnable_reason',
  'serial_tracking_note',
  'fulfillment_note',
] as const;

const CROSS_SELL_SEARCH_DEBOUNCE_MS = 2000;
const COPY_FROM_SEARCH_DEBOUNCE_MS = 2000;

@Component({
  selector: 'app-admin-products',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './admin-products.component.html',
  styleUrl: './admin-products.component.css',
})
export class AdminProductsComponent implements OnInit, OnDestroy {
  readonly conditionOptions = ['new', 'refurbished', 'open_box'];
  readonly visibilityOptions = ['catalog_search', 'catalog_only', 'draft'];
  readonly stockStatusOptions = ['in_stock', 'backorder', 'preorder'];
  readonly statusOptions = ['draft', 'active', 'inactive'];
  readonly currencyOptions = ['CAD', 'USD', 'EUR'];
  readonly procurementTypeOptions = [
    { value: 'stocked', label: 'Stocked' },
    { value: 'special_order', label: 'Special Order' },
    { value: 'made_to_order', label: 'Made to Order' },
    { value: 'warehouse_transfer', label: 'Warehouse Transfer' },
  ];

  loadingCategories = true;
  loadingAttributes = false;
  loadingBrands = false;
  loadingModels = false;
  loadingProduct = false;
  loadingCrossSells = false;
  saving = false;
  editingProductId: number | null = null;
  pendingCategoryId: number | null = null;

  categories: ProductCategoryResponseDto[] = [];
  categoryAttributes: CategoryAttributeItem[] = [];
  brands: CarBrandResponseDto[] = [];
  models: CarBrandModelResponseDto[] = [];

  brandSearch = '';
  modelSearch = '';
  brandPage = 1;
  modelPage = 1;
  showBrandDropdown = false;
  showModelDropdown = false;
  primaryImageDragActive = false;
  galleryImagesDragActive = false;
  videoDragActive = false;
  primaryImageUploadProgress: number | null = null;
  galleryUploadProgress: number | null = null;
  videoUploadProgress: number | null = null;
  crossSellSearch = '';
  crossSellSearchLoading = false;
  crossSellSearchError = '';
  crossSellHydrationError = '';
  crossSellValidationError = '';
  crossSellSearchResults: CrossSellSearchOption[] = [];
  crossSellItems: CrossSellFormItem[] = [];
  copyFromSearch = '';
  copyFromSearchPending = false;
  copyFromSearchLoading = false;
  copyFromSearchError = '';
  copyFromSearchResults: CrossSellSearchOption[] = [];
  showCopyFromDropdown = false;
  private pendingPrimaryImageFile: File | null = null;
  private pendingPrimaryImagePreviewUrl: string | null = null;
  private pendingGalleryFiles: PendingAssetItem[] = [];
  private pendingVideoFiles: PendingAssetItem[] = [];
  private crossSellSearchHandle: ReturnType<typeof setTimeout> | null = null;
  private copyFromSearchHandle: ReturnType<typeof setTimeout> | null = null;

  tagInput = '';
  fitmentInput = '';
  packageItemInput = '';
  noteInput = '';
  nonReturnReasonInput = '';

  tags: string[] = [];
  fitments: string[] = [];
  packageItems: string[] = [];
  notes: string[] = [];
  nonReturnableReasons: string[] = [];
  galleryImages: string[] = [];
  videoUrls: string[] = [];
  attributeRows: AttributeRow[] = [];

  readonly form;

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly carBrandService: CarBrandService,
    private readonly carBrandModelService: CarBrandModelService,
    private readonly productCategoryService: ProductCategoryService,
    private readonly productCategoryAttributeService: ProductCategoryAttributeService,
    private readonly productsService: ProductsService,
    private readonly toastService: ToastService,
    private readonly assetUploadService: AssetUploadService,
    private readonly mediaUrlService: MediaUrlService,
  ) {
    this.form = this.fb.group({
      categoryId: [this.getDefaultFormValue().categoryId, Validators.required],
      title: [
        this.getDefaultFormValue().title,
        [Validators.required, Validators.minLength(3)],
      ],
      slug: [this.getDefaultFormValue().slug],
      sku: [
        this.getDefaultFormValue().sku,
        [Validators.required, Validators.minLength(3)],
      ],
      mpn: [this.getDefaultFormValue().mpn],
      upc: [this.getDefaultFormValue().upc],
      brandId: [this.getDefaultFormValue().brandId],
      modelId: [this.getDefaultFormValue().modelId],
      status: [this.getDefaultFormValue().status, Validators.required],
      visibility: [this.getDefaultFormValue().visibility, Validators.required],
      condition: [this.getDefaultFormValue().condition, Validators.required],
      shortDescription: [
        this.getDefaultFormValue().shortDescription,
        [Validators.required, Validators.minLength(10)],
      ],
      longDescription: [
        this.getDefaultFormValue().longDescription,
        [Validators.required, Validators.minLength(20)],
      ],
      price: [
        this.getDefaultFormValue().price,
        [Validators.required, Validators.min(0)],
      ],
      compareAtPrice: [
        this.getDefaultFormValue().compareAtPrice,
        [Validators.min(0)],
      ],
      cost: [this.getDefaultFormValue().cost, [Validators.min(0)]],
      currency: [this.getDefaultFormValue().currency, Validators.required],
      stockStatus: [
        this.getDefaultFormValue().stockStatus,
        Validators.required,
      ],
      stockQty: [
        this.getDefaultFormValue().stockQty,
        [Validators.required, Validators.min(0)],
      ],
      safetyStock: [
        this.getDefaultFormValue().safetyStock,
        [Validators.min(0)],
      ],
      supplier: [this.getDefaultFormValue().supplier],
      warehouseBin: [this.getDefaultFormValue().warehouseBin],
      leadTimeDays: [
        this.getDefaultFormValue().leadTimeDays,
        [Validators.min(0)],
      ],
      weightKg: [this.getDefaultFormValue().weightKg, [Validators.min(0)]],
      lengthCm: [this.getDefaultFormValue().lengthCm, [Validators.min(0)]],
      widthCm: [this.getDefaultFormValue().widthCm, [Validators.min(0)]],
      heightCm: [this.getDefaultFormValue().heightCm, [Validators.min(0)]],
      warranty: [this.getDefaultFormValue().warranty],
      featured: [this.getDefaultFormValue().featured],
      universalFit: [this.getDefaultFormValue().universalFit],
      requiresSerial: [this.getDefaultFormValue().requiresSerial],
      returnable: [this.getDefaultFormValue().returnable],
      supplierSku: [this.getDefaultFormValue().supplierSku],
      procurementType: [this.getDefaultFormValue().procurementType],
      minRetailQty: [
        this.getDefaultFormValue().minRetailQty,
        [Validators.min(1)],
      ],
      minDealerQty: [
        this.getDefaultFormValue().minDealerQty,
        [Validators.min(1)],
      ],
      returnWindowDays: [
        this.getDefaultFormValue().returnWindowDays,
        [Validators.min(1)],
      ],
      returnPolicyNote: [this.getDefaultFormValue().returnPolicyNote],
      serialTrackingNote: [this.getDefaultFormValue().serialTrackingNote],
      fulfillmentNote: [this.getDefaultFormValue().fulfillmentNote],
      imageUrl: [this.getDefaultFormValue().imageUrl],
      seoTitle: [this.getDefaultFormValue().seoTitle],
      seoDescription: [this.getDefaultFormValue().seoDescription],
    });
  }

  ngOnInit(): void {
    this.form.get('categoryId')!.valueChanges.subscribe((categoryId) => {
      this.handleCategoryChange(this.toNumberOrNull(categoryId));
    });

    this.form.get('brandId')!.valueChanges.subscribe((brandId) => {
      const parsedBrandId = this.toNumberOrNull(brandId);
      this.form.patchValue({ modelId: null }, { emitEvent: false });
      this.models = [];
      this.modelSearch = '';

      if (parsedBrandId === null) {
        return;
      }

      this.modelPage = 1;
      this.loadModels(parsedBrandId);
    });

    this.form.get('title')!.valueChanges.subscribe((title) => {
      const slugControl = this.form.get('slug');
      if (!slugControl?.dirty) {
        slugControl?.setValue(this.slugify(String(title ?? '')), {
          emitEvent: false,
        });
      }
    });

    this.route.queryParamMap.subscribe((params) => {
      const productId = this.toNumberOrNull(params.get('edit'));
      this.editingProductId = productId;

      if (productId === null) {
        this.pendingCategoryId = null;
        this.resetProductForm();
        return;
      }

      this.loadProductForEdit(productId);
    });

    this.loadCategories();
    this.loadBrands();
  }

  ngOnDestroy(): void {
    if (this.crossSellSearchHandle) {
      clearTimeout(this.crossSellSearchHandle);
      this.crossSellSearchHandle = null;
    }

    if (this.copyFromSearchHandle) {
      clearTimeout(this.copyFromSearchHandle);
      this.copyFromSearchHandle = null;
    }

    this.copyFromSearchPending = false;
  }

  get isEditMode(): boolean {
    return this.editingProductId !== null;
  }

  get selectedCategoryName(): string {
    const id = this.toNumberOrNull(this.form.get('categoryId')!.value);
    return (
      this.categories.find((item) => item.category_id === id)?.category_name ??
      'No category selected'
    );
  }

  get marginValue(): number {
    const price = Number(this.form.get('price')!.value ?? 0);
    const cost = Number(this.form.get('cost')!.value ?? 0);
    return price > 0 ? Number((((price - cost) / price) * 100).toFixed(1)) : 0;
  }

  get attributeCount(): number {
    return this.attributeRows.filter(
      (item) => item.key.trim() && String(item.value).trim(),
    ).length;
  }

  get hasIncompleteAttributeRows(): boolean {
    return this.attributeRows.some((item) => {
      const key = item.key.trim();
      const value = String(item.value).trim();
      return (key.length > 0 || value.length > 0) && (!key || !value);
    });
  }

  get publishChecklist(): string[] {
    const checklist: string[] = [];

    if (this.form.get('categoryId')!.value) checklist.push('Category selected');
    if (this.form.get('sku')!.value) checklist.push('SKU ready');
    if (this.form.get('title')!.value) checklist.push('Title added');
    if (this.form.get('shortDescription')!.value)
      checklist.push('Short copy ready');
    if (this.form.get('imageUrl')!.value)
      checklist.push('Primary media attached');
    if (Number(this.form.get('price')!.value ?? 0) > 0)
      checklist.push('Price configured');
    if (this.attributeCount > 0) checklist.push('Attributes prepared');
    if (this.crossSellItems.length > 0)
      checklist.push(
        `${this.crossSellItems.length} cross-sell products linked`,
      );
    if (this.hasReturnPolicyConfigured())
      checklist.push('Return policy configured');

    return checklist;
  }

  hasError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return Boolean(
      control && control.invalid && (control.touched || control.dirty),
    );
  }

  getErrorMessage(controlName: string, label: string): string {
    const control = this.form.get(controlName);
    if (!control?.errors) {
      return '';
    }

    if (control.errors['required']) {
      return `${label} is required.`;
    }

    if (control.errors['minlength']) {
      return `${label} is too short.`;
    }

    if (control.errors['min']) {
      return `${label} cannot be negative.`;
    }

    return `${label} is invalid.`;
  }

  get suggestedAttributeKeys(): string[] {
    if (this.categoryAttributes.length > 0) {
      return Array.from(
        new Set(
          this.categoryAttributes
            .map((item) => String(item.attribute_name ?? '').trim())
            .filter(Boolean)
            .map((item) => this.slugify(item).replace(/-/g, '_')),
        ),
      );
    }

    const category = this.selectedCategoryName.toLowerCase();
    const suggestions = [
      `${category || 'product'}_spec`,
      `${category || 'product'}_size`,
      `${category || 'category'}_fitment`,
      'material',
      'color',
      'compatibility',
      'package_contents',
      'origin_country',
    ];

    return Array.from(
      new Set(
        suggestions
          .map((item) => this.slugify(item).replace(/-/g, '_'))
          .filter(Boolean),
      ),
    );
  }

  get selectedBrandName(): string {
    const brandId = this.toNumberOrNull(this.form.get('brandId')!.value);
    return (
      this.brands.find((item) => item.car_brand_id === brandId)
        ?.car_brand_name ?? ''
    );
  }

  get selectedModelName(): string {
    const modelId = this.toNumberOrNull(this.form.get('modelId')!.value);
    return (
      this.models.find((item) => item.model_id === modelId)?.model_name ?? ''
    );
  }

  get selectedProcurementTypeLabel(): string {
    const value = String(this.form.get('procurementType')!.value ?? '');
    return (
      this.procurementTypeOptions.find((item) => item.value === value)?.label ??
      (value || '-')
    );
  }

  get hasCrossSellSearchTerm(): boolean {
    return this.crossSellSearch.trim().length > 0;
  }

  goBack(): void {
    this.router.navigateByUrl('/admin/products-list');
  }

  async onFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    if (!this.isValidPrimaryImage(file)) {
      this.toastService.warning(
        'Please choose an image file smaller than 50 MB.',
      );
      return;
    }

    if (!this.confirmPrimaryImageReplacement()) {
      return;
    }

    this.setPendingPrimaryImage(file);
  }

  onPrimaryImageDragOver(event: DragEvent): void {
    event.preventDefault();
    this.primaryImageDragActive = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onPrimaryImageDragLeave(event: DragEvent): void {
    if (event.currentTarget === event.target) {
      this.primaryImageDragActive = false;
    }
  }

  async onPrimaryImageDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.primaryImageDragActive = false;

    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }

    if (!this.isValidPrimaryImage(file)) {
      this.toastService.warning(
        'Please choose an image file smaller than 50 MB.',
      );
      return;
    }

    if (!this.confirmPrimaryImageReplacement()) {
      return;
    }

    this.setPendingPrimaryImage(file);
  }

  removeImage(): void {
    this.clearPendingPrimaryImageState();
    this.form.patchValue({ imageUrl: '' });
  }

  async onGalleryFilesChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';

    if (files.length === 0) {
      return;
    }

    const invalidFile = files.find((file) => !this.isImageFile(file));
    if (invalidFile) {
      this.toastService.warning('Gallery accepts image files only.');
      return;
    }

    this.addPendingGalleryFiles(files);
  }

  onGalleryImagesDragOver(event: DragEvent): void {
    event.preventDefault();
    this.galleryImagesDragActive = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onGalleryImagesDragLeave(event: DragEvent): void {
    if (event.currentTarget === event.target) {
      this.galleryImagesDragActive = false;
    }
  }

  async onGalleryImagesDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.galleryImagesDragActive = false;

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) {
      return;
    }

    const invalidFile = files.find((file) => !this.isImageFile(file));
    if (invalidFile) {
      this.toastService.warning('Gallery accepts image files only.');
      return;
    }

    this.addPendingGalleryFiles(files);
  }

  removeGalleryImage(index: number): void {
    if (!this.confirmGalleryImageDeletion()) {
      return;
    }

    this.removePendingAssetByPreview(
      this.pendingGalleryFiles,
      this.galleryImages[index],
    );
    this.galleryImages = this.galleryImages.filter(
      (_, itemIndex) => itemIndex !== index,
    );
  }

  async onVideoFilesChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';

    if (files.length === 0) {
      return;
    }

    const invalidFile = files.find((file) => !file.type.startsWith('video/'));
    if (invalidFile) {
      this.toastService.warning('Video upload accepts video files only.');
      return;
    }

    if (!this.confirmVideoReplacement()) {
      return;
    }

    this.setPendingVideoFiles(files);
  }

  onVideoDragOver(event: DragEvent): void {
    event.preventDefault();
    this.videoDragActive = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onVideoDragLeave(event: DragEvent): void {
    if (event.currentTarget === event.target) {
      this.videoDragActive = false;
    }
  }

  async onVideoDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.videoDragActive = false;

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) {
      return;
    }

    const invalidFile = files.find((file) => !file.type.startsWith('video/'));
    if (invalidFile) {
      this.toastService.warning('Video upload accepts video files only.');
      return;
    }

    if (!this.confirmVideoReplacement()) {
      return;
    }

    this.setPendingVideoFiles(files);
  }

  removeVideo(index: number): void {
    this.removePendingAssetByPreview(
      this.pendingVideoFiles,
      this.videoUrls[index],
    );
    this.videoUrls = this.videoUrls.filter(
      (_, itemIndex) => itemIndex !== index,
    );
  }

  onBrandSearchChange(value: string): void {
    this.brandSearch = value;
    this.brandPage = 1;
    this.showBrandDropdown = true;
    this.loadBrands();
  }

  selectBrand(brand: CarBrandResponseDto): void {
    this.form.patchValue({
      brandId: brand.car_brand_id,
      modelId: null,
    });
    this.brandSearch = brand.car_brand_name;
    this.modelSearch = '';
    this.showBrandDropdown = false;
  }

  loadMoreBrands(): void {
    this.brandPage += 1;
    this.loadBrands(true);
  }

  onModelSearchChange(value: string): void {
    this.modelSearch = value;
    this.modelPage = 1;
    this.showModelDropdown = true;

    const brandId = this.toNumberOrNull(this.form.get('brandId')!.value);
    if (brandId !== null) {
      this.loadModels(brandId);
    }
  }

  selectModel(model: CarBrandModelResponseDto): void {
    this.form.patchValue({ modelId: model.model_id });
    this.modelSearch = model.model_name;
    this.showModelDropdown = false;
  }

  loadMoreModels(): void {
    const brandId = this.toNumberOrNull(this.form.get('brandId')!.value);
    if (brandId === null) {
      return;
    }

    this.modelPage += 1;
    this.loadModels(brandId, true);
  }

  hideBrandDropdown(): void {
    setTimeout(() => {
      this.showBrandDropdown = false;
      if (!this.form.get('brandId')!.value) {
        this.brandSearch = '';
      }
    }, 150);
  }

  hideModelDropdown(): void {
    setTimeout(() => {
      this.showModelDropdown = false;
      if (!this.form.get('modelId')!.value) {
        this.modelSearch = '';
      }
    }, 150);
  }

  hideCopyFromDropdown(): void {
    setTimeout(() => {
      this.showCopyFromDropdown = false;
    }, 150);
  }

  onCopyFromSearchChange(value: string): void {
    this.copyFromSearch = value;
    this.copyFromSearchError = '';

    if (this.copyFromSearchHandle) {
      clearTimeout(this.copyFromSearchHandle);
      this.copyFromSearchHandle = null;
    }

    const term = value.trim();
    if (!term) {
      this.copyFromSearchPending = false;
      this.copyFromSearchLoading = false;
      this.copyFromSearchResults = [];
      return;
    }

    this.copyFromSearchHandle = setTimeout(() => {
      this.copyFromSearchPending = false;
      this.copyFromSearchLoading = true;
      this.productsService
        .productsControllerSearchSuggestions({ term, limit: 8 })
        .subscribe({
          next: (response) => {
            this.copyFromSearchLoading = false;
            if (!Array.isArray(response)) {
              this.copyFromSearchResults = [];
              this.copyFromSearchError = 'Invalid response from server.';
              return;
            }
            this.copyFromSearchResults = response
              .filter(
                (item: ProductSearchSuggestionDto) => item.type === 'product',
              )
              .map((item: ProductSearchSuggestionDto) =>
                this.mapCrossSellSuggestion(item),
              )
              .filter((item): item is CrossSellSearchOption => item !== null);
          },
          error: (error) => {
            this.copyFromSearchLoading = false;
            this.copyFromSearchResults = [];
            this.copyFromSearchError = this.getApiErrorMessage(
              error,
              'Unable to search products right now.',
            );
          },
        });
    }, COPY_FROM_SEARCH_DEBOUNCE_MS);

    this.copyFromSearchPending = true;
  }

  selectCopyFromProduct(option: CrossSellSearchOption): void {
    if (this.isEditMode) {
      return;
    }

    if (!this.confirmCopyOverwrite()) {
      return;
    }

    this.copyFromSearchPending = false;
    this.copyFromSearch = option.sku
      ? `${option.title} · ${option.sku}`
      : option.title;
    this.copyFromSearchResults = [];
    this.showCopyFromDropdown = false;
    this.copyProductFromExisting(option.id);
  }

  clearCopyFromProduct(): void {
    this.copyFromSearch = '';
    this.copyFromSearchError = '';
    this.copyFromSearchResults = [];
    this.copyFromSearchPending = false;
  }

  addAttributeRow(key = '', value = ''): void {
    this.attributeRows = [...this.attributeRows, { key, value }];
  }

  removeAttributeRow(index: number): void {
    this.attributeRows = this.attributeRows.filter(
      (_, itemIndex) => itemIndex !== index,
    );
  }

  addSuggestedAttribute(key: string): void {
    const normalizedKey = key.trim();
    if (
      !normalizedKey ||
      this.attributeRows.some((item) => item.key === normalizedKey)
    ) {
      return;
    }

    this.addAttributeRow(normalizedKey, '');
  }

  addTag(): void {
    this.pushUniqueValue(this.tagInput, this.tags, () => (this.tagInput = ''));
  }

  addFitment(): void {
    this.pushUniqueValue(
      this.fitmentInput,
      this.fitments,
      () => (this.fitmentInput = ''),
    );
  }

  addPackageItem(): void {
    this.pushUniqueValue(
      this.packageItemInput,
      this.packageItems,
      () => (this.packageItemInput = ''),
    );
  }

  addNote(): void {
    this.pushUniqueValue(
      this.noteInput,
      this.notes,
      () => (this.noteInput = ''),
    );
  }

  addNonReturnableReason(): void {
    this.pushUniqueValue(
      this.nonReturnReasonInput,
      this.nonReturnableReasons,
      () => (this.nonReturnReasonInput = ''),
    );
  }

  removeTag(value: string): void {
    this.tags = this.tags.filter((item) => item !== value);
  }

  removeFitment(value: string): void {
    this.fitments = this.fitments.filter((item) => item !== value);
  }

  removePackageItem(value: string): void {
    this.packageItems = this.packageItems.filter((item) => item !== value);
  }

  removeNote(value: string): void {
    this.notes = this.notes.filter((item) => item !== value);
  }

  removeNonReturnableReason(value: string): void {
    this.nonReturnableReasons = this.nonReturnableReasons.filter(
      (item) => item !== value,
    );
  }

  onCrossSellSearchChange(value: string): void {
    this.crossSellSearch = value;
    this.crossSellSearchError = '';

    if (this.crossSellSearchHandle) {
      clearTimeout(this.crossSellSearchHandle);
      this.crossSellSearchHandle = null;
    }

    const term = value.trim();
    if (!term) {
      this.crossSellSearchLoading = false;
      this.crossSellSearchResults = [];
      return;
    }

    this.crossSellSearchHandle = setTimeout(() => {
      this.crossSellSearchLoading = true;
      this.productsService
        .productsControllerSearchSuggestions({ term, limit: 8 })
        .subscribe({
          next: (response) => {
            this.crossSellSearchLoading = false;
            if (!Array.isArray(response)) {
              this.crossSellSearchResults = [];
              this.crossSellSearchError = 'Invalid response from server.';
              return;
            }
            this.crossSellSearchResults = response
              .filter(
                (item: ProductSearchSuggestionDto) => item.type === 'product',
              )
              .map((item: ProductSearchSuggestionDto) =>
                this.mapCrossSellSuggestion(item),
              )
              .filter((item): item is CrossSellSearchOption => item !== null)
              .filter(
                (item) =>
                  !this.isCurrentProductCrossSell(item.id) &&
                  !this.hasCrossSellProduct(item.id),
              );
          },
          error: (error) => {
            this.crossSellSearchLoading = false;
            this.crossSellSearchResults = [];
            this.crossSellSearchError = this.getApiErrorMessage(
              error,
              'Unable to search products right now.',
            );
          },
        });
    }, CROSS_SELL_SEARCH_DEBOUNCE_MS);
  }

  addCrossSell(option: CrossSellSearchOption): void {
    if (this.isCurrentProductCrossSell(option.id)) {
      this.crossSellValidationError =
        'A product cannot be assigned as its own cross-sell.';
      return;
    }

    if (this.hasCrossSellProduct(option.id)) {
      this.crossSellValidationError =
        'This product is already selected as a cross-sell.';
      return;
    }

    this.crossSellValidationError = '';
    this.crossSellItems = [
      ...this.crossSellItems,
      {
        recommended_product_id: option.id,
        sort_order: this.crossSellItems.length,
        is_active: true,
        title: option.title,
        sku: option.sku,
        thumbnail_image: option.thumbnail_image ?? null,
        currency: option.currency ?? null,
        price: option.price ?? null,
      },
    ];
    this.crossSellSearch = '';
    this.crossSellSearchResults = [];
  }

  removeCrossSell(index: number): void {
    this.crossSellValidationError = '';
    this.crossSellItems = this.crossSellItems
      .filter((_, itemIndex) => itemIndex !== index)
      .map((item, itemIndex) => ({ ...item, sort_order: itemIndex }));
  }

  moveCrossSell(index: number, direction: -1 | 1): void {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= this.crossSellItems.length) {
      return;
    }

    const items = [...this.crossSellItems];
    const [movedItem] = items.splice(index, 1);
    items.splice(targetIndex, 0, movedItem);
    this.crossSellItems = items.map((item, itemIndex) => ({
      ...item,
      sort_order: itemIndex,
    }));
  }

  trackCrossSellByProductId(_: number, item: CrossSellFormItem): number {
    return item.recommended_product_id;
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.warning(
        'Fill the required product fields before saving.',
      );
      return;
    }

    if (this.hasIncompleteAttributeRows) {
      this.toastService.warning(
        'Each dynamic attribute row must have both a key and a value, or be removed.',
      );
      return;
    }

    if (!this.validateOperationalPolicies()) {
      return;
    }

    if (!this.validateCrossSells()) {
      return;
    }

    const payload = {
      ...this.form.getRawValue(),
      tags: this.tags,
      fitments: this.fitments,
      packageItems: this.packageItems,
      notes: this.notes,
      attributes: this.buildAttributesObject(),
    };

    try {
      await this.uploadPendingAssetsForSave(payload);
    } catch (error) {
      this.toastService.error(
        this.getApiErrorMessage(
          error,
          this.isEditMode
            ? 'Failed to upload product media.'
            : 'Failed to upload product media.',
        ),
      );
      this.clearUploadProgress();
      return;
    }

    this.saving = true;
    const request =
      this.isEditMode && this.editingProductId !== null
        ? this.productsService.productsControllerUpdate(
            String(this.editingProductId),
            this.toUpdatePayload(payload),
          )
        : this.productsService.productsControllerCreate(
            this.toCreatePayload(payload),
          );

    request.pipe(finalize(() => (this.saving = false))).subscribe({
      next: (response) => {
        this.clearPendingProductMediaState();
        this.toastService.success(
          response.message ||
            (this.isEditMode
              ? 'Product updated successfully.'
              : 'Product created successfully.'),
        );

        if (this.isEditMode) {
          this.goBack();
          return;
        }

        this.resetProductForm();
      },
      error: (error) => {
        this.clearUploadProgress();
        this.toastService.error(
          this.getApiErrorMessage(
            error,
            this.isEditMode
              ? 'Failed to update product.'
              : 'Failed to create product.',
          ),
        );
      },
    });
  }

  private handleCategoryChange(categoryId: number | null): void {
    this.categoryAttributes = [];

    if (categoryId === null) {
      return;
    }

    const existingAttributes = this.isEditMode
      ? this.getCurrentCustomAttributes()
      : undefined;
    this.loadCategoryAttributes(categoryId, existingAttributes);
  }

  private getCurrentCustomAttributes(): Record<string, string> {
    return this.attributeRows.reduce<Record<string, string>>((accumulator, row) => {
      const key = row.key.trim();
      const value = String(row.value ?? '').trim();
      if (!key || !value) {
        return accumulator;
      }

      accumulator[key] = value;
      return accumulator;
    }, {});
  }

  private loadCategories(): void {
    this.loadingCategories = true;
    this.productCategoryService
      .productCategoryControllerList({
        params: {
          page: 1,
          limit: 500,
          is_deleted: false,
        },
      })
      .pipe(finalize(() => (this.loadingCategories = false)))
      .subscribe({
        next: (response) => {
          this.categories = (response.data ?? [])
            .map((item) => this.normalizeCategory(item))
            .filter((item) => !item.is_deleted);
          const firstCategoryId = this.categories[0]?.category_id ?? null;
          if (this.isEditMode && this.pendingCategoryId !== null) {
            const matchedCategoryId =
              this.categories.find(
                (item) => item.category_id === this.pendingCategoryId,
              )?.category_id ?? this.pendingCategoryId;
            this.form.patchValue(
              { categoryId: matchedCategoryId },
              { emitEvent: false },
            );
            return;
          }

          if (
            !this.isEditMode &&
            firstCategoryId !== null &&
            !this.form.get('categoryId')!.value
          ) {
            this.form.patchValue({ categoryId: firstCategoryId });
          }
        },
        error: (error) => {
          this.toastService.error(
            this.getApiErrorMessage(error, 'Failed to load categories.'),
          );
        },
      });
  }

  private loadBrands(append = false): void {
    this.loadingBrands = true;
    this.carBrandService
      .carBrandControllerList({
        params: {
          page: this.brandPage,
          limit: 20,
          ...(this.brandSearch.trim()
            ? { search: this.brandSearch.trim() }
            : {}),
        } as Record<string, string | number>,
      })
      .pipe(finalize(() => (this.loadingBrands = false)))
      .subscribe({
        next: (response: any) => {
          const rows = (response.data ?? []).filter(
            (item: CarBrandResponseDto) => !item.is_deleted,
          );
          this.brands = append ? [...this.brands, ...rows] : rows;
        },
        error: () => {
          this.brands = [];
        },
      });
  }

  private loadModels(brandId: number, append = false): void {
    this.loadingModels = true;
    this.carBrandModelService
      .carBrandModelControllerList({
        page: this.modelPage,
        limit: 20,
        car_brand_id: brandId,
        ...(this.modelSearch.trim() ? { search: this.modelSearch.trim() } : {}),
      })
      .pipe(finalize(() => (this.loadingModels = false)))
      .subscribe({
        next: (response) => {
          const rows = (response.data ?? []).filter((item) => !item.is_deleted);
          this.models = append ? [...this.models, ...rows] : rows;
        },
        error: () => {
          this.models = [];
        },
      });
  }

  private loadCategoryAttributes(
    categoryId: number,
    existingAttributes?: Record<string, string>,
  ): void {
    this.loadingAttributes = true;
    this.productCategoryAttributeService
      .productCategoryAttributeControllerWorkspace<any>({
        page: 1,
        limit: 200,
        category_id: categoryId,
      })
      .pipe(finalize(() => (this.loadingAttributes = false)))
      .subscribe({
        next: (response) => {
          this.categoryAttributes = this.extractWorkspaceAttributes(response);
          const mappedRows = this.categoryAttributes.map((item) => {
            const key = this.slugify(
              String(item.attribute_name ?? 'attribute'),
            ).replace(/-/g, '_');
            return {
              key,
              value: existingAttributes?.[key] ?? '',
            };
          });

          const extraRows = Object.entries(existingAttributes ?? {})
            .filter(([key]) => !mappedRows.some((item) => item.key === key))
            .map(([key, value]) => ({ key, value }));

          this.attributeRows =
            mappedRows.length > 0 || extraRows.length > 0
              ? [...mappedRows, ...extraRows]
              : this.getDefaultAttributeRows();
        },
        error: () => {
          this.categoryAttributes = [];
          this.attributeRows =
            Object.entries(existingAttributes ?? {}).map(([key, value]) => ({
              key,
              value,
            })) || this.getDefaultAttributeRows();
        },
      });
  }

  private buildAttributesObject(): Record<string, unknown> {
    return this.attributeRows.reduce<Record<string, unknown>>(
      (accumulator, item) => {
        const key = item.key.trim();
        const value = item.value.trim();
        if (!key || !value) {
          return accumulator;
        }

        accumulator[key] = value;
        return accumulator;
      },
      {},
    );
  }

  private toCreatePayload(
    payload: ReturnType<typeof this.form.getRawValue> & {
      tags: string[];
      fitments: string[];
      packageItems: string[];
      notes: string[];
      attributes: Record<string, unknown>;
    },
  ): CreateProductsDto {
    const minRetailQty = this.toNumberOrNull(payload.minRetailQty) ?? 1;
    const minDealerQty = this.toNumberOrNull(payload.minDealerQty) ?? 1;

    return {
      title: payload.title ?? '',
      slug: payload.slug || undefined,
      sku: payload.sku ?? '',
      mpn: payload.mpn || undefined,
      barcode: payload.upc || undefined,
      brand_id: payload.brandId ?? undefined,
      model_id: payload.modelId ?? undefined,
      category_id: Number(payload.categoryId),
      short_description: payload.shortDescription || undefined,
      description: payload.longDescription || undefined,
      status: payload.status ?? 'draft',
      visibility: payload.visibility ?? 'draft',
      condition: payload.condition ?? 'new',
      featured: payload.featured ?? false,
      is_active: (payload.status ?? 'draft') !== 'inactive',
      is_deleted: false,
      price: Number(payload.price) || 0,
      compare_at_price: Number(payload.compareAtPrice) || 0,
      cost_price: Number(payload.cost) || 0,
      currency: payload.currency ?? 'CAD',
      stock_qty: Number(payload.stockQty) || 0,
      low_stock_threshold: Number(payload.safetyStock) || 0,
      min_retail_qty: minRetailQty,
      min_dealer_qty: minDealerQty,
      stock_status: payload.stockStatus ?? 'in_stock',
      supplier: payload.supplier || undefined,
      inventory_source: undefined,
      internal_reference_code: String(payload.supplierSku ?? '').trim() || undefined,
      stock_strategy: String(payload.procurementType ?? '').trim() || undefined,
      warehouse_bin: payload.warehouseBin || undefined,
      lead_time_days: Number(payload.leadTimeDays) || 0,
      weight: Number(payload.weightKg) || 0,
      length: Number(payload.lengthCm) || 0,
      width: Number(payload.widthCm) || 0,
      height: Number(payload.heightCm) || 0,
      warranty: payload.warranty || undefined,
      returnable: payload.returnable ?? true,
      return_window_days: payload.returnable
        ? (this.toNumberOrNull(payload.returnWindowDays) ?? undefined)
        : undefined,
      non_returnable_reasons:
        payload.returnable || this.nonReturnableReasons.length === 0
          ? undefined
          : [...this.nonReturnableReasons],
      return_policy_note: payload.returnPolicyNote || undefined,
      serial_tracking_note: payload.serialTrackingNote || undefined,
      fulfillment_note: payload.fulfillmentNote || undefined,
      universal_fit: Boolean(payload.universalFit),
      requires_serial: Boolean(payload.requiresSerial),
      thumbnail_image:
        this.mediaUrlService.toStoredValue(payload.imageUrl) ||
        this.mediaUrlService.toStoredValue(this.galleryImages[0]) ||
        undefined,
      gallery_images: this.buildGalleryImages(payload.imageUrl),
      video_urls: this.videoUrls
        .map((url) => this.mediaUrlService.toStoredValue(url))
        .filter((url) => url.length > 0),
      media: this.buildMediaItems(payload.imageUrl),
      cross_sells: this.buildCrossSellPayload(),
      seo_title: payload.seoTitle || undefined,
      seo_description: payload.seoDescription || undefined,
      tags: payload.tags,
      package_contents: payload.packageItems,
      notes: payload.notes
        .map((note) => note.trim())
        .filter(Boolean)
        .map((note) => ({ note })),
      attributes: payload.attributes,
      fitment_notes: payload.fitments,
    };
  }

  private toUpdatePayload(
    payload: ReturnType<typeof this.form.getRawValue> & {
      tags: string[];
      fitments: string[];
      packageItems: string[];
      notes: string[];
      attributes: Record<string, unknown>;
    },
  ): UpdateProductsDto {
    return {
      ...this.toCreatePayload(payload),
    };
  }

  private loadProductForEdit(productId: number): void {
    this.loadingProduct = true;
    this.crossSellHydrationError = '';
    this.productsService
      .productsControllerGet(String(productId))
      .pipe(finalize(() => (this.loadingProduct = false)))
      .subscribe({
        next: (response) => {
          this.patchFormFromDetail(response.data);
          this.loadCrossSells(productId);
        },
        error: (error) => {
          this.toastService.error(
            this.getApiErrorMessage(error, 'Failed to load product.'),
          );
          this.router.navigate(['/admin/products-list']);
        },
      });
  }

  private copyProductFromExisting(productId: number): void {
    this.loadingProduct = true;
    this.crossSellHydrationError = '';
    this.productsService
      .productsControllerGet(String(productId))
      .pipe(finalize(() => (this.loadingProduct = false)))
      .subscribe({
        next: (response) => {
          this.applyCopyFromDetail(response.data, productId);
        },
        error: (error) => {
          this.toastService.error(
            this.getApiErrorMessage(error, 'Failed to copy product details.'),
          );
        },
      });
  }

  private applyCopyFromDetail(
    detail: ProductDetailDto,
    productId: number,
  ): void {
    this.patchFormFromDetail(detail);

    // Keep most fields, but clear identifiers that must be unique.
    this.form.patchValue(
      {
        sku: '',
        slug: '',
        upc: '',
      },
      { emitEvent: false },
    );

    // Copy cross-sells as well (if any).
    this.loadingCrossSells = true;
    this.productsService
      .productsControllerListCrossSells(String(productId))
      .pipe(finalize(() => (this.loadingCrossSells = false)))
      .subscribe({
        next: (response) => {
          this.crossSellHydrationError = '';
          this.crossSellValidationError = '';
          this.crossSellItems = (response.data ?? []).map((item) =>
            this.mapCrossSellDto(item),
          );
        },
        error: (error) => {
          this.crossSellItems = [];
          this.crossSellHydrationError = this.getApiErrorMessage(
            error,
            'Failed to load cross-sell products.',
          );
        },
      });

    this.form.markAsDirty();
    this.toastService.success('Product copied. Update SKU/slug before saving.');
  }

  private confirmCopyOverwrite(): boolean {
    if (
      this.form.dirty ||
      this.tags.length > 0 ||
      this.fitments.length > 0 ||
      this.packageItems.length > 0 ||
      this.notes.length > 0 ||
      this.nonReturnableReasons.length > 0 ||
      this.galleryImages.length > 0 ||
      this.videoUrls.length > 0 ||
      this.attributeRows.length > 0 ||
      this.crossSellItems.length > 0
    ) {
      return globalThis.confirm(
        'Copying will overwrite the current product form. Continue?',
      );
    }

    return true;
  }

  private patchFormFromDetail(detail: ProductDetailDto): void {
    this.clearPendingProductMediaState();
    const categoryId = this.toNumberOrNull(detail.category_id);
    const brandId = this.toNumberOrNull(detail.brand_id);
    const modelId = this.toNumberOrNull(detail.model_id);
    const attributeMap = this.extractEditableAttributes(detail.attributes);
    const customAttributes: Record<string, string> = { ...attributeMap };
    const media = this.extractDetailMedia(detail);

    this.pendingCategoryId = categoryId;

    this.tags = Array.isArray(detail.tags)
      ? detail.tags.filter((item) => typeof item === 'string')
      : [];
    this.packageItems = this.extractPackageContents(detail, attributeMap);
    this.notes = this.extractNotes(detail, attributeMap);
    this.fitments = this.extractFitmentNotes(detail, attributeMap);
    this.nonReturnableReasons = this.extractNonReturnableReasons(detail);
    this.galleryImages = media.galleryImages;
    this.videoUrls = media.videoUrls;
    for (const key of RESERVED_ATTRIBUTE_FIELDS) {
      delete customAttributes[key];
    }

    this.brandSearch = this.toText(detail.brand_name);
    this.modelSearch = this.toText(detail.model_name);
    this.showBrandDropdown = false;
    this.showModelDropdown = false;

    this.form.patchValue(
      {
        categoryId,
        title: detail.title ?? '',
        slug: detail.slug ?? '',
        sku: detail.sku ?? '',
        mpn: this.toText(detail.mpn),
        upc: this.toText(detail.barcode),
        brandId,
        modelId,
        status: this.toText(detail.status) || 'draft',
        visibility: this.toText(detail.visibility) || 'catalog_search',
        condition: this.toText(detail.condition) || 'new',
        shortDescription: this.toText(detail.short_description),
        longDescription: this.toText(detail.description),
        price: this.toNumberOrZero(detail.price),
        compareAtPrice: this.toNumberOrZero(detail.compare_at_price),
        cost: this.toNumberOrZero(detail.cost_price),
        currency: this.toText(detail.currency) || 'CAD',
        stockStatus: this.toText(detail.stock_status) || 'in_stock',
        stockQty: this.toNumberOrZero(detail.stock_qty),
        safetyStock: this.toNumberOrZero(detail.low_stock_threshold),
        supplier: this.toText(detail.supplier) || 'Primary Warehouse',
        warehouseBin: this.toText(detail.warehouse_bin) || 'A-01-01',
        leadTimeDays: this.toNumberOrZero(detail.lead_time_days),
        weightKg: this.toNumberOrZero(detail.weight),
        lengthCm: this.toNumberOrZero(detail.length),
        widthCm: this.toNumberOrZero(detail.width),
        heightCm: this.toNumberOrZero(detail.height),
        warranty: this.toText(detail.warranty) || '12 Months',
        featured: Boolean(detail.featured),
        universalFit: this.toBooleanValue(
          detail.universal_fit ?? detail.attributes?.['universal_fit'],
          false,
        ),
        requiresSerial: this.toBooleanValue(
          detail.requires_serial ?? detail.attributes?.['requires_serial'],
          false,
        ),
        returnable: this.toBooleanValue(detail.returnable, true),
        supplierSku:
          this.toText(detail.internal_reference_code) ||
          this.toText(attributeMap['supplier_sku']),
        procurementType:
          this.toText(detail.stock_strategy) ||
          this.toText(attributeMap['procurement_type']) ||
          'stocked',
        minRetailQty:
          this.toNumberOrNull(detail.min_retail_qty) ??
          this.toNumberOrNull(attributeMap['min_retail_qty']) ??
          1,
        minDealerQty:
          this.toNumberOrNull(detail.min_dealer_qty) ??
          this.toNumberOrNull(attributeMap['min_dealer_qty']) ??
          1,
        returnWindowDays:
          this.toNumberOrNull(detail.return_window_days) ??
          this.toNumberOrNull(attributeMap['return_window_days']),
        returnPolicyNote:
          this.toText(detail.return_policy_note) ||
          this.toText(attributeMap['return_policy_note']),
        serialTrackingNote:
          this.toText(detail.serial_tracking_note) ||
          this.toText(attributeMap['serial_tracking_note']),
        fulfillmentNote:
          this.toText(detail.fulfillment_note) ||
          this.toText(attributeMap['fulfillment_note']),
        imageUrl: media.primaryImageUrl,
        seoTitle: this.toText(detail.seo_title),
        seoDescription: this.toText(detail.seo_description),
      },
      { emitEvent: false },
    );

    if (categoryId !== null) {
      this.loadCategoryAttributes(categoryId, customAttributes);
    } else {
      this.attributeRows = Object.entries(customAttributes).map(([key, value]) => ({
        key,
        value,
      }));
    }

    if (brandId !== null) {
      this.modelPage = 1;
      this.loadModels(brandId);
    } else {
      this.models = [];
    }

    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private extractNonReturnableReasons(detail: ProductDetailDto): string[] {
    if (Array.isArray(detail.non_returnable_reasons)) {
      return detail.non_returnable_reasons
        .map((item) => (typeof item === 'string' ? item.trim() : String(item)))
        .filter(Boolean);
    }

    return this.extractAttributeStringArray(
      detail.attributes,
      'non_returnable_reason',
    );
  }

  private extractPackageContents(
    detail: ProductDetailDto,
    attributes: Record<string, string>,
  ): string[] {
    if (Array.isArray(detail.package_contents)) {
      return detail.package_contents
        .map((item) => (typeof item === 'string' ? item.trim() : String(item)))
        .filter(Boolean);
    }

    return this.extractStringArray(attributes['package_items']);
  }

  private extractNotes(
    detail: ProductDetailDto,
    attributes: Record<string, string>,
  ): string[] {
    if (Array.isArray(detail.notes)) {
      return (detail.notes as unknown[])
        .map((item) => this.extractNoteText(item))
        .filter((item) => item.length > 0);
    }

    return this.extractStringArray(attributes['notes']);
  }

  private extractNoteText(item: unknown): string {
    if (typeof item === 'string') {
      return item.trim();
    }

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return '';
    }

    const record = item as Record<string, unknown>;
    const candidates = [
      record['note'],
      record['text'],
      record['message'],
      record['value'],
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    return '';
  }

  private extractDetailMedia(detail: ProductDetailDto): {
    primaryImageUrl: string;
    galleryImages: string[];
    videoUrls: string[];
  } {
    const galleryFromFields = Array.isArray(detail.gallery_images)
      ? detail.gallery_images
          .filter((item): item is string => typeof item === 'string')
          .map((item) => this.mediaUrlService.resolve(item))
      : [];
    const videosFromFields = Array.isArray(detail.video_urls)
      ? detail.video_urls
          .filter((item): item is string => typeof item === 'string')
          .map((item) => this.mediaUrlService.resolve(item))
      : [];

    const mediaItems = Array.isArray(detail.media) ? detail.media : [];
    const mediaImages = mediaItems
      .map((item) => (item && typeof item === 'object' ? item : null))
      .filter((item): item is Record<string, unknown> => item !== null)
      .filter((item) => String(item['type'] ?? '').toLowerCase() === 'image')
      .map((item) => ({
        url: this.toText(item['url']),
        sort_order: this.toNumberOrNull(item['sort_order']),
        is_primary: this.toBooleanValue(item['is_primary'], false),
      }))
      .filter((item) => item.url.trim().length > 0)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((item) => ({ ...item, url: this.mediaUrlService.resolve(item.url) }));

    const mediaVideos = mediaItems
      .map((item) => (item && typeof item === 'object' ? item : null))
      .filter((item): item is Record<string, unknown> => item !== null)
      .filter((item) => String(item['type'] ?? '').toLowerCase() === 'video')
      .map((item) => ({
        url: this.toText(item['url']),
        sort_order: this.toNumberOrNull(item['sort_order']),
      }))
      .filter((item) => item.url.trim().length > 0)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((item) => this.mediaUrlService.resolve(item.url));

    const primaryFromThumbnail = this.mediaUrlService.resolve(
      detail.thumbnail_image,
    );

    const primaryFromMedia =
      mediaImages.find((item) => item.is_primary)?.url ?? mediaImages[0]?.url;

    const primaryFromGallery = galleryFromFields[0];

    const primaryImageUrl =
      primaryFromThumbnail || primaryFromMedia || primaryFromGallery || '';

    const allImages = galleryFromFields.length > 0 ? galleryFromFields : [];
    const fallbackImages =
      allImages.length > 0
        ? allImages
        : mediaImages.map((item) => item.url);

    const galleryImages = fallbackImages.filter((url) => url !== primaryImageUrl);

    const videoUrls = videosFromFields.length > 0 ? videosFromFields : mediaVideos;

    return {
      primaryImageUrl,
      galleryImages,
      videoUrls,
    };
  }

  private loadCrossSells(productId: number): void {
    this.loadingCrossSells = true;
    this.productsService
      .productsControllerListCrossSells(String(productId))
      .pipe(finalize(() => (this.loadingCrossSells = false)))
      .subscribe({
        next: (response) => {
          this.crossSellHydrationError = '';
          this.crossSellValidationError = '';
          this.crossSellItems = (response.data ?? []).map((item) =>
            this.mapCrossSellDto(item),
          );
        },
        error: (error) => {
          this.crossSellItems = [];
          this.crossSellHydrationError = this.getApiErrorMessage(
            error,
            'Failed to load existing cross-sell products.',
          );
        },
      });
  }

  private extractWorkspaceAttributes(response: any): CategoryAttributeItem[] {
    const candidates = [
      response?.attributes,
      response?.data?.attributes,
      response?.workspace?.attributes,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate
          .map((item: any) => {
            const attributeId = Number(item?.attribute_id ?? item?.id ?? 0);
            if (!attributeId) {
              return null;
            }

            return {
              attribute_id: attributeId,
              attribute_name: String(
                item?.attribute_name ?? item?.name ?? 'Attribute',
              ),
              values: Array.isArray(item?.values)
                ? item.values.map((value: any) =>
                    String(value?.attribute_value ?? value?.value ?? value),
                  )
                : [],
            } satisfies CategoryAttributeItem;
          })
          .filter((item): item is CategoryAttributeItem => item !== null);
      }
    }

    return [];
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private toNumberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private pushUniqueValue(
    source: string,
    collection: string[],
    reset: () => void,
  ): void {
    const normalized = source.trim();
    if (!normalized || collection.includes(normalized)) {
      reset();
      return;
    }

    collection.unshift(normalized);
    reset();
  }

  private isImageFile(file: File): boolean {
    return file.type.startsWith('image/');
  }

  private isValidPrimaryImage(file: File): boolean {
    return this.isImageFile(file) && file.size <= 50 * 1024 * 1024;
  }

  private confirmPrimaryImageReplacement(): boolean {
    if (!this.form.get('imageUrl')!.value) {
      return true;
    }

    return globalThis.confirm(
      'Replacing the primary image will remove the current one. Continue?',
    );
  }

  private confirmGalleryImageDeletion(): boolean {
    return globalThis.confirm('Delete this photo from the gallery?');
  }

  private confirmVideoReplacement(): boolean {
    if (!this.isEditMode || this.videoUrls.length === 0) {
      return true;
    }

    return globalThis.confirm(
      'Adding new video files will replace the existing videos. Continue?',
    );
  }

  private async uploadFilesSequentially(
    files: File[],
    folder: CreateUploadUrlDtoFolder,
    onProgress: (progress: number) => void,
  ): Promise<string[]> {
    const uploadedUrls: string[] = [];

    for (const [index, file] of files.entries()) {
      const uploaded = await this.assetUploadService.uploadFile(
        file,
        folder,
        (fileProgress) => {
          const overallProgress = Math.round(
            ((index + fileProgress / 100) / files.length) * 100,
          );
          onProgress(overallProgress);
        },
      );
      uploadedUrls.push(uploaded.endpoint);
    }

    onProgress(100);
    return uploadedUrls;
  }

  private setPendingPrimaryImage(file: File): void {
    this.clearPendingPrimaryImageState();
    const previewUrl = URL.createObjectURL(file);
    this.pendingPrimaryImageFile = file;
    this.pendingPrimaryImagePreviewUrl = previewUrl;
    this.form.patchValue({ imageUrl: previewUrl });
  }

  private addPendingGalleryFiles(files: File[]): void {
    const pendingItems = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    this.pendingGalleryFiles = [...this.pendingGalleryFiles, ...pendingItems];
    this.galleryImages = [
      ...this.galleryImages,
      ...pendingItems.map((item) => item.previewUrl),
    ];
  }

  private setPendingVideoFiles(files: File[]): void {
    this.clearPendingAssetCollection(this.pendingVideoFiles);
    const pendingItems = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    this.pendingVideoFiles = pendingItems;
    this.videoUrls =
      this.isEditMode && this.videoUrls.length > 0
        ? pendingItems.map((item) => item.previewUrl)
        : [...this.videoUrls, ...pendingItems.map((item) => item.previewUrl)];
  }

  private async uploadPendingAssetsForSave(payload: {
    imageUrl: string | null;
    [key: string]: unknown;
  }): Promise<void> {
    if (this.pendingPrimaryImageFile) {
      this.primaryImageUploadProgress = 0;
      const uploaded = await this.assetUploadService.uploadFile(
        this.pendingPrimaryImageFile,
        'product/image',
        (progress) => {
          this.primaryImageUploadProgress = progress;
        },
      );
      payload.imageUrl = uploaded.endpoint;
      this.form.patchValue(
        { imageUrl: this.mediaUrlService.resolve(uploaded.endpoint) },
        { emitEvent: false },
      );
    }

    if (this.pendingGalleryFiles.length > 0) {
      this.galleryUploadProgress = 0;
      const uploadedUrls = await this.uploadFilesSequentially(
        this.pendingGalleryFiles.map((item) => item.file),
        'product/image',
        (progress) => {
          this.galleryUploadProgress = progress;
        },
      );
      const existingUrls = this.galleryImages.filter(
        (url) =>
          !this.pendingGalleryFiles.some((item) => item.previewUrl === url),
      );
      this.galleryImages = [...existingUrls, ...uploadedUrls];
    }

    if (this.pendingVideoFiles.length > 0) {
      this.videoUploadProgress = 0;
      const uploadedUrls = await this.uploadFilesSequentially(
        this.pendingVideoFiles.map((item) => item.file),
        'product/video',
        (progress) => {
          this.videoUploadProgress = progress;
        },
      );
      const existingUrls = this.videoUrls.filter(
        (url) =>
          !this.pendingVideoFiles.some((item) => item.previewUrl === url),
      );
      this.videoUrls =
        this.isEditMode && existingUrls.length > 0
          ? uploadedUrls
          : [...existingUrls, ...uploadedUrls];
    }
  }

  private clearPendingProductMediaState(): void {
    this.clearPendingPrimaryImageState();
    this.clearPendingAssetCollection(this.pendingGalleryFiles);
    this.pendingGalleryFiles = [];
    this.clearPendingAssetCollection(this.pendingVideoFiles);
    this.pendingVideoFiles = [];
    this.clearUploadProgress();
  }

  private clearPendingPrimaryImageState(): void {
    this.pendingPrimaryImageFile = null;
    if (this.pendingPrimaryImagePreviewUrl) {
      URL.revokeObjectURL(this.pendingPrimaryImagePreviewUrl);
      this.pendingPrimaryImagePreviewUrl = null;
    }
  }

  private clearPendingAssetCollection(items: PendingAssetItem[]): void {
    for (const item of items) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }

  private removePendingAssetByPreview(
    items: PendingAssetItem[],
    previewUrl: string | undefined,
  ): void {
    if (!previewUrl) {
      return;
    }

    const index = items.findIndex((item) => item.previewUrl === previewUrl);
    if (index === -1) {
      return;
    }

    URL.revokeObjectURL(items[index].previewUrl);
    items.splice(index, 1);
  }

  private clearUploadProgress(): void {
    this.primaryImageUploadProgress = null;
    this.galleryUploadProgress = null;
    this.videoUploadProgress = null;
  }

  getMediaPreviewSrc(value: string): string {
    return this.mediaUrlService.resolve(value);
  }

  private getApiErrorMessage(error: unknown, fallback: string): string {
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

  private normalizeCategory(
    item: ProductCategoryResponseDto,
  ): ProductCategoryResponseDto {
    return {
      ...item,
      category_id: this.toNumberOrNull(item.category_id) ?? 0,
    };
  }

  private toText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private toNumberOrZero(value: unknown): number {
    return this.toNumberOrNull(value) ?? 0;
  }

  private toBooleanValue(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      if (value === 'true') return true;
      if (value === 'false') return false;
    }

    if (typeof value === 'number') {
      return value === 1;
    }

    return fallback;
  }

  private extractEditableAttributes(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return Object.entries(value as Record<string, unknown>).reduce<
      Record<string, string>
    >((accumulator, [key, itemValue]) => {
      if (typeof itemValue === 'string') {
        accumulator[key] = itemValue;
        return accumulator;
      }

      if (typeof itemValue === 'number' || typeof itemValue === 'boolean') {
        accumulator[key] = String(itemValue);
        return accumulator;
      }

      if (Array.isArray(itemValue)) {
        accumulator[key] = itemValue
          .map((entry) => (typeof entry === 'string' ? entry : String(entry)))
          .join(', ');
      }

      return accumulator;
    }, {});
  }

  private extractStringArray(value: string | undefined): string[] {
    if (!value) {
      return [];
    }

    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private extractFitments(
    detailFitments: unknown[],
    attributeFitments?: string,
  ): string[] {
    if (Array.isArray(detailFitments) && detailFitments.length > 0) {
      return detailFitments
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }

          if (item && typeof item === 'object') {
            return Object.values(item as Record<string, unknown>)
              .filter(
                (value) =>
                  typeof value === 'string' || typeof value === 'number',
              )
              .map((value) => String(value))
              .join(' ')
              .trim();
          }

          return '';
        })
        .filter(Boolean);
    }

    return this.extractStringArray(attributeFitments);
  }

  private extractFitmentNotes(
    detail: ProductDetailDto,
    attributes: Record<string, string>,
  ): string[] {
    if (Array.isArray(detail.fitment_notes) && detail.fitment_notes.length > 0) {
      return detail.fitment_notes
        .map((item) => (typeof item === 'string' ? item.trim() : String(item)))
        .filter(Boolean);
    }

    if (String(attributes['fitment_notes'] ?? '').trim()) {
      return this.extractStringArray(String(attributes['fitment_notes']));
    }

    return this.extractFitments(detail.fitments, attributes['fitments']);
  }

  private extractAttributeStringArray(source: unknown, key: string): string[] {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return [];
    }

    const value = (source as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      return value
        .map((item) =>
          typeof item === 'string' ? item.trim() : String(item).trim(),
        )
        .filter(Boolean);
    }

    if (typeof value === 'string') {
      return this.extractStringArray(value);
    }

    return [];
  }

  private buildCrossSellPayload(): ProductCrossSellItemDto[] {
    return this.crossSellItems.map((item, index) => ({
      recommended_product_id: item.recommended_product_id,
      sort_order: index,
      is_active: Boolean(item.is_active),
    }));
  }

  private hasReturnPolicyConfigured(): boolean {
    const value = this.form.getRawValue();
    if (value.returnable) {
      return (
        this.toNumberOrNull(value.returnWindowDays) !== null ||
        String(value.returnPolicyNote ?? '').trim().length > 0
      );
    }

    return this.nonReturnableReasons.length > 0;
  }

  private validateOperationalPolicies(): boolean {
    const value = this.form.getRawValue();

    if (
      this.toNumberOrNull(value.minRetailQty) === null ||
      Number(value.minRetailQty) < 1
    ) {
      this.toastService.warning(
        'Minimum retail quantity must be at least 1.',
      );
      return false;
    }

    if (
      this.toNumberOrNull(value.minDealerQty) === null ||
      Number(value.minDealerQty) < 1
    ) {
      this.toastService.warning(
        'Minimum dealer quantity must be at least 1.',
      );
      return false;
    }

    if (value.returnable) {
      if (this.toNumberOrNull(value.returnWindowDays) === null) {
        this.toastService.warning(
          'Set a return window in days for returnable products.',
        );
        return false;
      }

      if (!String(value.returnPolicyNote ?? '').trim()) {
        this.toastService.warning(
          'Add a return policy note for returnable products.',
        );
        return false;
      }
    }

    if (!value.returnable && this.nonReturnableReasons.length === 0) {
      this.toastService.warning('Explain why the product is non-returnable.');
      return false;
    }

    if (
      value.requiresSerial &&
      !String(value.serialTrackingNote ?? '').trim()
    ) {
      this.toastService.warning(
        'Add serial or batch handling notes when serial tracking is required.',
      );
      return false;
    }

    return true;
  }

  private validateCrossSells(): boolean {
    const ids = this.crossSellItems.map((item) => item.recommended_product_id);
    const uniqueIds = new Set(ids);

    if (this.editingProductId !== null && ids.includes(this.editingProductId)) {
      this.crossSellValidationError =
        'A product cannot be assigned as its own cross-sell.';
      this.toastService.warning(this.crossSellValidationError);
      return false;
    }

    if (uniqueIds.size !== ids.length) {
      this.crossSellValidationError =
        'Remove duplicate cross-sell products before saving.';
      this.toastService.warning(this.crossSellValidationError);
      return false;
    }

    this.crossSellValidationError = '';
    this.crossSellItems = this.crossSellItems.map((item, index) => ({
      ...item,
      sort_order: index,
      is_active: Boolean(item.is_active),
    }));
    return true;
  }

  private getDefaultAttributeRows(): AttributeRow[] {
    return [];
  }

  private buildGalleryImages(
    primaryImage: string | null | undefined,
  ): string[] {
    return Array.from(
      new Set(
        [primaryImage, ...this.galleryImages]
          .map((item) => this.mediaUrlService.toStoredValue(item))
          .filter(
            (item): item is string =>
              typeof item === 'string' && item.trim().length > 0,
          ),
      ),
    );
  }

  private buildMediaItems(primaryImage: string | null | undefined) {
    const images = this.buildGalleryImages(primaryImage);
    const videos = this.videoUrls
      .map((url) => this.mediaUrlService.toStoredValue(url))
      .filter((url) => url.length > 0);

    return [
      ...images.map((url, index) => ({
        type: 'image',
        url,
        is_primary: index === 0,
        sort_order: index,
      })),
      ...videos.map((url, index) => ({
        type: 'video',
        url,
        is_primary: false,
        sort_order: images.length + index,
      })),
    ];
  }

  private mapCrossSellDto(item: ProductCrossSellDto): CrossSellFormItem {
    return {
      recommended_product_id: item.product_id,
      sort_order: item.sort_order,
      is_active: item.is_active,
      title: item.title,
      sku: item.sku,
      thumbnail_image: this.toNullableText(item.thumbnail_image),
      currency: this.toNullableText(item.currency),
      price: this.toNullableNumber(item.selling_price ?? item.price),
    };
  }

  private mapCrossSellSuggestion(
    item: ProductSearchSuggestionDto,
  ): CrossSellSearchOption | null {
    const id = this.toNumberOrNull(item.id);
    if (id === null) {
      return null;
    }

    const meta =
      item.meta && typeof item.meta === 'object' && !Array.isArray(item.meta)
        ? (item.meta as Record<string, unknown>)
        : {};
    const title = this.toText(meta['title']) || item.label || `Product #${id}`;
    const sku =
      this.toText(meta['sku']) ||
      this.toText(meta['product_sku']) ||
      this.toText(meta['code']) ||
      '';

    return {
      id,
      title,
      sku,
      thumbnail_image:
        this.toText(meta['thumbnail_image']) ||
        this.toText(meta['image']) ||
        null,
      currency: this.toText(meta['currency']) || null,
      price: this.toNullableNumber(meta['selling_price'] ?? meta['price']),
    };
  }

  private isCurrentProductCrossSell(productId: number): boolean {
    return (
      this.editingProductId !== null && this.editingProductId === productId
    );
  }

  private hasCrossSellProduct(productId: number): boolean {
    return this.crossSellItems.some(
      (item) => item.recommended_product_id === productId,
    );
  }

  private getDefaultFormValue() {
    return {
      categoryId: null as number | null,
      title: '',
      slug: '',
      sku: '',
      mpn: '',
      upc: '',
      brandId: null as number | null,
      modelId: null as number | null,
      status: 'draft',
      visibility: 'catalog_search',
      condition: 'new',
      shortDescription: '',
      longDescription: '',
      price: 0,
      compareAtPrice: 0,
      cost: 0,
      currency: 'CAD',
      stockStatus: 'in_stock',
      stockQty: 0,
      safetyStock: 0,
      supplier: 'Primary Warehouse',
      warehouseBin: 'A-01-01',
      leadTimeDays: 2,
      weightKg: 0,
      lengthCm: 0,
      widthCm: 0,
      heightCm: 0,
      warranty: '12 Months',
      featured: false,
      universalFit: false,
      requiresSerial: false,
      returnable: true,
      supplierSku: '',
      procurementType: 'stocked',
      minRetailQty: 1,
      minDealerQty: 4,
      returnWindowDays: 30 as number | null,
      returnPolicyNote:
        'Return accepted within 30 days in unused condition with original packaging.',
      serialTrackingNote: '',
      fulfillmentNote: '',
      imageUrl: '',
      seoTitle: '',
      seoDescription: '',
    };
  }

  private resetProductForm(): void {
    this.clearPendingProductMediaState();
    const firstCategoryId = this.categories[0]?.category_id ?? null;
    this.pendingCategoryId = null;
    if (this.crossSellSearchHandle) {
      clearTimeout(this.crossSellSearchHandle);
      this.crossSellSearchHandle = null;
    }
    if (this.copyFromSearchHandle) {
      clearTimeout(this.copyFromSearchHandle);
      this.copyFromSearchHandle = null;
    }

    this.tagInput = '';
    this.fitmentInput = '';
    this.packageItemInput = '';
    this.noteInput = '';
    this.nonReturnReasonInput = '';
    this.tags = [];
    this.fitments = [];
    this.packageItems = [];
    this.notes = [];
    this.nonReturnableReasons = [];
    this.galleryImages = [];
    this.videoUrls = [];
    this.brandSearch = '';
    this.modelSearch = '';
    this.brandPage = 1;
    this.modelPage = 1;
    this.showBrandDropdown = false;
    this.showModelDropdown = false;
    this.models = [];
    this.categoryAttributes = [];
    this.attributeRows = this.getDefaultAttributeRows();
    this.loadingCrossSells = false;
    this.crossSellSearch = '';
    this.crossSellSearchLoading = false;
    this.crossSellSearchError = '';
    this.crossSellHydrationError = '';
    this.crossSellValidationError = '';
    this.crossSellSearchResults = [];
    this.crossSellItems = [];
    this.copyFromSearch = '';
    this.copyFromSearchPending = false;
    this.copyFromSearchLoading = false;
    this.copyFromSearchError = '';
    this.copyFromSearchResults = [];
    this.showCopyFromDropdown = false;

    this.form.reset({
      ...this.getDefaultFormValue(),
      categoryId: firstCategoryId,
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private toNullableNumber(value: unknown): number | null {
    return this.toNumberOrNull(value);
  }

  private toNullableText(value: unknown): string | null {
    const text = this.toText(value);
    return text || null;
  }
}
