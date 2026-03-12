import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { CarBrandService } from '../../../core/api/generated/car-brand/car-brand.service';
import { CarBrandModelService } from '../../../core/api/generated/car-brand-model/car-brand-model.service';
import { ProductCategoryService } from '../../../core/api/generated/product-category/product-category.service';
import { ProductCategoryAttributeService } from '../../../core/api/generated/product-category-attribute/product-category-attribute.service';
import { ProductSubCategoryService } from '../../../core/api/generated/product-sub-category/product-sub-category.service';
import { ProductsService } from '../../../core/api/generated/products/products.service';
import type {
  CarBrandModelResponseDto,
  CarBrandResponseDto,
  CreateProductsDto,
  ProductCategoryResponseDto,
  ProductDetailDto,
  ProductSubCategoryResponseDto,
  UpdateProductsDto,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';

interface AttributeRow {
  key: string;
  value: string;
}

interface CategoryAttributeItem {
  attribute_id: number;
  attribute_name: string;
  values: string[];
}

@Component({
  selector: 'app-admin-products',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './admin-products.component.html',
  styleUrl: './admin-products.component.css',
})
export class AdminProductsComponent implements OnInit {
  readonly conditionOptions = ['new', 'refurbished', 'open_box'];
  readonly visibilityOptions = ['catalog_search', 'catalog_only', 'draft'];
  readonly stockStatusOptions = ['in_stock', 'backorder', 'preorder'];
  readonly shippingClassOptions = ['standard', 'oversize', 'hazmat'];
  readonly statusOptions = ['draft', 'active', 'inactive'];
  readonly currencyOptions = ['CAD', 'USD', 'EUR'];

  loadingCategories = true;
  loadingSubCategories = false;
  loadingAttributes = false;
  loadingBrands = false;
  loadingModels = false;
  loadingProduct = false;
  saving = false;
  editingProductId: number | null = null;
  pendingCategoryId: number | null = null;
  pendingSubCategoryId: number | null = null;

  categories: ProductCategoryResponseDto[] = [];
  subCategories: ProductSubCategoryResponseDto[] = [];
  categoryAttributes: CategoryAttributeItem[] = [];
  brands: CarBrandResponseDto[] = [];
  models: CarBrandModelResponseDto[] = [];

  brandSearch = '';
  modelSearch = '';
  brandPage = 1;
  modelPage = 1;
  showBrandDropdown = false;
  showModelDropdown = false;

  tagInput = '';
  fitmentInput = '';
  packageItemInput = '';
  noteInput = '';

  tags: string[] = [];
  fitments: string[] = [];
  packageItems: string[] = [];
  notes: string[] = [];
  galleryImages: string[] = [];
  videoUrls: string[] = [];
  attributeRows: AttributeRow[] = [
    { key: 'material', value: '' },
    { key: 'color', value: '' },
    { key: 'compatibility', value: '' },
  ];

  readonly form;

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly carBrandService: CarBrandService,
    private readonly carBrandModelService: CarBrandModelService,
    private readonly productCategoryService: ProductCategoryService,
    private readonly productCategoryAttributeService: ProductCategoryAttributeService,
    private readonly productSubCategoryService: ProductSubCategoryService,
    private readonly productsService: ProductsService,
    private readonly toastService: ToastService,
  ) {
    this.form = this.fb.group({
      categoryId: [this.getDefaultFormValue().categoryId, Validators.required],
      subCategoryId: [this.getDefaultFormValue().subCategoryId, Validators.required],
      title: [this.getDefaultFormValue().title, [Validators.required, Validators.minLength(3)]],
      slug: [this.getDefaultFormValue().slug],
      sku: [this.getDefaultFormValue().sku, [Validators.required, Validators.minLength(3)]],
      mpn: [this.getDefaultFormValue().mpn],
      upc: [this.getDefaultFormValue().upc],
      brandId: [this.getDefaultFormValue().brandId],
      modelId: [this.getDefaultFormValue().modelId],
      status: [this.getDefaultFormValue().status, Validators.required],
      visibility: [this.getDefaultFormValue().visibility, Validators.required],
      condition: [this.getDefaultFormValue().condition, Validators.required],
      shortDescription: [this.getDefaultFormValue().shortDescription, [Validators.required, Validators.minLength(10)]],
      longDescription: [this.getDefaultFormValue().longDescription, [Validators.required, Validators.minLength(20)]],
      price: [this.getDefaultFormValue().price, [Validators.required, Validators.min(0)]],
      compareAtPrice: [this.getDefaultFormValue().compareAtPrice, [Validators.min(0)]],
      cost: [this.getDefaultFormValue().cost, [Validators.min(0)]],
      currency: [this.getDefaultFormValue().currency, Validators.required],
      stockStatus: [this.getDefaultFormValue().stockStatus, Validators.required],
      stockQty: [this.getDefaultFormValue().stockQty, [Validators.required, Validators.min(0)]],
      safetyStock: [this.getDefaultFormValue().safetyStock, [Validators.min(0)]],
      supplier: [this.getDefaultFormValue().supplier],
      warehouseBin: [this.getDefaultFormValue().warehouseBin],
      leadTimeDays: [this.getDefaultFormValue().leadTimeDays, [Validators.min(0)]],
      shippingClass: [this.getDefaultFormValue().shippingClass, Validators.required],
      weightKg: [this.getDefaultFormValue().weightKg, [Validators.min(0)]],
      lengthCm: [this.getDefaultFormValue().lengthCm, [Validators.min(0)]],
      widthCm: [this.getDefaultFormValue().widthCm, [Validators.min(0)]],
      heightCm: [this.getDefaultFormValue().heightCm, [Validators.min(0)]],
      warranty: [this.getDefaultFormValue().warranty],
      featured: [this.getDefaultFormValue().featured],
      universalFit: [this.getDefaultFormValue().universalFit],
      requiresSerial: [this.getDefaultFormValue().requiresSerial],
      returnable: [this.getDefaultFormValue().returnable],
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
        slugControl?.setValue(this.slugify(String(title ?? '')), { emitEvent: false });
      }
    });

    this.route.queryParamMap.subscribe((params) => {
      const productId = this.toNumberOrNull(params.get('edit'));
      this.editingProductId = productId;

      if (productId === null) {
        this.pendingCategoryId = null;
        this.pendingSubCategoryId = null;
        this.resetProductForm();
        return;
      }

      this.loadProductForEdit(productId);
    });

    this.loadCategories();
    this.loadBrands();
  }

  get isEditMode(): boolean {
    return this.editingProductId !== null;
  }

  get selectedCategoryName(): string {
    const id = this.toNumberOrNull(this.form.get('categoryId')!.value);
    return this.categories.find((item) => item.category_id === id)?.category_name ?? 'No category selected';
  }

  get selectedSubCategoryName(): string {
    const id = this.toNumberOrNull(this.form.get('subCategoryId')!.value);
    return this.subCategories.find((item) => item.sub_category_id === id)?.sub_category ?? 'No sub category selected';
  }

  get marginValue(): number {
    const price = Number(this.form.get('price')!.value ?? 0);
    const cost = Number(this.form.get('cost')!.value ?? 0);
    return price > 0 ? Number((((price - cost) / price) * 100).toFixed(1)) : 0;
  }

  get attributeCount(): number {
    return this.attributeRows.filter((item) => item.key.trim() && String(item.value).trim()).length;
  }

  get publishChecklist(): string[] {
    const checklist: string[] = [];

    if (this.form.get('categoryId')!.value) checklist.push('Category selected');
    if (this.form.get('subCategoryId')!.value) checklist.push('Sub category selected');
    if (this.form.get('sku')!.value) checklist.push('SKU ready');
    if (this.form.get('title')!.value) checklist.push('Title added');
    if (this.form.get('shortDescription')!.value) checklist.push('Short copy ready');
    if (this.form.get('imageUrl')!.value) checklist.push('Primary media attached');
    if (Number(this.form.get('price')!.value ?? 0) > 0) checklist.push('Price configured');
    if (this.attributeCount > 0) checklist.push('Attributes prepared');

    return checklist;
  }

  hasError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return Boolean(control && control.invalid && (control.touched || control.dirty));
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
    const subCategory = this.selectedSubCategoryName.toLowerCase();
    const suggestions = [
      `${subCategory || 'product'}_spec`,
      `${subCategory || 'product'}_size`,
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
    return this.brands.find((item) => item.car_brand_id === brandId)?.car_brand_name ?? '';
  }

  get selectedModelName(): string {
    const modelId = this.toNumberOrNull(this.form.get('modelId')!.value);
    return this.models.find((item) => item.model_id === modelId)?.model_name ?? '';
  }

  goBack(): void {
    this.router.navigateByUrl('/admin/products-list');
  }

  async onFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
      this.toastService.warning('Please choose an image file smaller than 2 MB.');
      return;
    }

    const base64 = await this.fileToBase64(file);
    this.form.patchValue({ imageUrl: base64 });
  }

  removeImage(): void {
    this.form.patchValue({ imageUrl: '' });
  }

  async onGalleryFilesChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) {
      return;
    }

    const invalidFile = files.find((file) => !file.type.startsWith('image/'));
    if (invalidFile) {
      this.toastService.warning('Gallery accepts image files only.');
      return;
    }

    const base64Files = await Promise.all(files.map((file) => this.fileToBase64(file)));
    this.galleryImages = [...this.galleryImages, ...base64Files];
    input.value = '';
  }

  removeGalleryImage(index: number): void {
    this.galleryImages = this.galleryImages.filter((_, itemIndex) => itemIndex !== index);
  }

  async onVideoFilesChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) {
      return;
    }

    const invalidFile = files.find((file) => !file.type.startsWith('video/'));
    if (invalidFile) {
      this.toastService.warning('Video upload accepts video files only.');
      return;
    }

    const base64Files = await Promise.all(files.map((file) => this.fileToBase64(file)));
    this.videoUrls = [...this.videoUrls, ...base64Files];
    input.value = '';
  }

  removeVideo(index: number): void {
    this.videoUrls = this.videoUrls.filter((_, itemIndex) => itemIndex !== index);
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

  addAttributeRow(key = '', value = ''): void {
    this.attributeRows = [...this.attributeRows, { key, value }];
  }

  removeAttributeRow(index: number): void {
    this.attributeRows = this.attributeRows.filter((_, itemIndex) => itemIndex !== index);
  }

  addSuggestedAttribute(key: string): void {
    const normalizedKey = key.trim();
    if (!normalizedKey || this.attributeRows.some((item) => item.key === normalizedKey)) {
      return;
    }

    this.addAttributeRow(normalizedKey, '');
  }

  addTag(): void {
    this.pushUniqueValue(this.tagInput, this.tags, () => (this.tagInput = ''));
  }

  addFitment(): void {
    this.pushUniqueValue(this.fitmentInput, this.fitments, () => (this.fitmentInput = ''));
  }

  addPackageItem(): void {
    this.pushUniqueValue(this.packageItemInput, this.packageItems, () => (this.packageItemInput = ''));
  }

  addNote(): void {
    this.pushUniqueValue(this.noteInput, this.notes, () => (this.noteInput = ''));
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

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.warning('Fill the required product fields before saving.');
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

    this.saving = true;
    const request =
      this.isEditMode && this.editingProductId !== null
        ? this.productsService.productsControllerUpdate(
            String(this.editingProductId),
            this.toUpdatePayload(payload),
          )
        : this.productsService.productsControllerCreate(this.toCreatePayload(payload));

    request
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: (response) => {
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
          this.toastService.error(
            this.getApiErrorMessage(
              error,
              this.isEditMode ? 'Failed to update product.' : 'Failed to create product.',
            ),
          );
        },
      });
  }

  private handleCategoryChange(categoryId: number | null): void {
    this.subCategories = [];
    this.categoryAttributes = [];
    this.form.patchValue({ subCategoryId: null }, { emitEvent: false });

    if (categoryId === null) {
      return;
    }

    this.loadSubCategories(categoryId);
    this.loadCategoryAttributes(categoryId);
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
              this.categories.find((item) => item.category_id === this.pendingCategoryId)?.category_id ??
              this.pendingCategoryId;
            this.form.patchValue({ categoryId: matchedCategoryId }, { emitEvent: false });
            return;
          }

          if (!this.isEditMode && firstCategoryId !== null && !this.form.get('categoryId')!.value) {
            this.form.patchValue({ categoryId: firstCategoryId });
          }
        },
        error: (error) => {
          this.toastService.error(this.getApiErrorMessage(error, 'Failed to load categories.'));
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
          ...(this.brandSearch.trim() ? { search: this.brandSearch.trim() } : {}),
        } as Record<string, string | number>,
      })
      .pipe(finalize(() => (this.loadingBrands = false)))
      .subscribe({
        next: (response: any) => {
          const rows = (response.data ?? []).filter((item: CarBrandResponseDto) => !item.is_deleted);
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

  private loadSubCategories(categoryId: number, selectedSubCategoryId?: number | null): void {
    this.loadingSubCategories = true;
    this.productSubCategoryService
      .productSubCategoryControllerList({
        params: {
          page: 1,
          limit: 500,
          category_id: categoryId,
          is_deleted: false,
        },
      })
      .pipe(finalize(() => (this.loadingSubCategories = false)))
      .subscribe({
        next: (response) => {
          this.subCategories = (response.data ?? [])
            .map((item) => this.normalizeSubCategory(item))
            .filter((item) => !item.is_deleted);
          const matchedSubCategory = this.subCategories.find(
            (item) => item.sub_category_id === selectedSubCategoryId,
          );
          const nextSubCategoryId = matchedSubCategory?.sub_category_id ?? this.subCategories[0]?.sub_category_id ?? null;
          this.form.patchValue({ subCategoryId: nextSubCategoryId }, { emitEvent: false });
        },
        error: (error) => {
          this.toastService.error(this.getApiErrorMessage(error, 'Failed to load sub categories.'));
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
            const key = this.slugify(String(item.attribute_name ?? 'attribute')).replace(/-/g, '_');
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
            Object.entries(existingAttributes ?? {}).map(([key, value]) => ({ key, value })) ||
            this.getDefaultAttributeRows();
        },
      });
  }

  private buildAttributesObject(): Record<string, string> {
    return this.attributeRows.reduce<Record<string, string>>((accumulator, item) => {
      const key = item.key.trim();
      const value = item.value.trim();
      if (!key || !value) {
        return accumulator;
      }

      accumulator[key] = value;
      return accumulator;
    }, {});
  }

  private toCreatePayload(payload: ReturnType<typeof this.form.getRawValue> & {
    tags: string[];
    fitments: string[];
    packageItems: string[];
    notes: string[];
    attributes: Record<string, string>;
  }): CreateProductsDto {
    return {
      title: payload.title ?? '',
      slug: payload.slug || undefined,
      sku: payload.sku ?? '',
      barcode: payload.upc || undefined,
      brand_id: payload.brandId ?? undefined,
      model_id: payload.modelId ?? undefined,
      category_id: Number(payload.categoryId),
      sub_category_id: Number(payload.subCategoryId),
      short_description: payload.shortDescription || undefined,
      description: payload.longDescription || undefined,
      status: payload.status ?? 'draft',
      visibility: payload.visibility ?? 'draft',
      featured: payload.featured ?? false,
      is_active: (payload.status ?? 'draft') !== 'inactive',
      is_deleted: false,
      price: Number(payload.price) || 0,
      compare_at_price: Number(payload.compareAtPrice) || 0,
      cost_price: Number(payload.cost) || 0,
      currency: payload.currency ?? 'CAD',
      stock_qty: Number(payload.stockQty) || 0,
      low_stock_threshold: Number(payload.safetyStock) || 0,
      stock_status: payload.stockStatus ?? 'in_stock',
      supplier: payload.supplier || undefined,
      warehouse_bin: payload.warehouseBin || undefined,
      lead_time_days: Number(payload.leadTimeDays) || 0,
      shipping_class: payload.shippingClass || undefined,
      weight: Number(payload.weightKg) || 0,
      length: Number(payload.lengthCm) || 0,
      width: Number(payload.widthCm) || 0,
      height: Number(payload.heightCm) || 0,
      warranty: payload.warranty || undefined,
      returnable: payload.returnable ?? true,
      thumbnail_image: payload.imageUrl || this.galleryImages[0] || undefined,
      gallery_images: this.buildGalleryImages(payload.imageUrl),
      video_urls: this.videoUrls,
      media: this.buildMediaItems(payload.imageUrl),
      seo_title: payload.seoTitle || undefined,
      seo_description: payload.seoDescription || undefined,
      tags: payload.tags,
      attributes: {
        ...payload.attributes,
        fitments: payload.fitments,
        package_items: payload.packageItems,
        notes: payload.notes,
      },
    };
  }

  private toUpdatePayload(payload: ReturnType<typeof this.form.getRawValue> & {
    tags: string[];
    fitments: string[];
    packageItems: string[];
    notes: string[];
    attributes: Record<string, string>;
  }): UpdateProductsDto {
    return {
      ...this.toCreatePayload(payload),
    };
  }

  private loadProductForEdit(productId: number): void {
    this.loadingProduct = true;
    this.productsService
      .productsControllerGet(String(productId))
      .pipe(finalize(() => (this.loadingProduct = false)))
      .subscribe({
        next: (response) => {
          this.patchFormFromDetail(response.data);
        },
        error: (error) => {
          this.toastService.error(this.getApiErrorMessage(error, 'Failed to load product.'));
          this.router.navigate(['/admin/products-list']);
        },
      });
  }

  private patchFormFromDetail(detail: ProductDetailDto): void {
    const categoryId = this.toNumberOrNull(detail.category_id);
    const subCategoryId = this.toNumberOrNull(detail.sub_category_id);
    const brandId = this.toNumberOrNull(detail.brand_id);
    const modelId = this.toNumberOrNull(detail.model_id);
    const attributes = this.extractEditableAttributes(detail.attributes);

    this.pendingCategoryId = categoryId;
    this.pendingSubCategoryId = subCategoryId;

    this.tags = Array.isArray(detail.tags) ? detail.tags.filter((item) => typeof item === 'string') : [];
    this.packageItems = this.extractStringArray(attributes['package_items']);
    this.notes = this.extractStringArray(attributes['notes']);
    this.fitments = this.extractFitments(detail.fitments, attributes['fitments']);
    this.galleryImages = Array.isArray(detail.gallery_images) ? detail.gallery_images.filter((item) => typeof item === 'string') : [];
    this.videoUrls = Array.isArray(detail.video_urls) ? detail.video_urls.filter((item) => typeof item === 'string') : [];
    delete attributes['package_items'];
    delete attributes['notes'];
    delete attributes['fitments'];

    this.brandSearch = this.toText(detail.brand_name);
    this.modelSearch = this.toText(detail.model_name);
    this.showBrandDropdown = false;
    this.showModelDropdown = false;

    this.form.patchValue(
      {
        categoryId,
        subCategoryId,
        title: detail.title ?? '',
        slug: detail.slug ?? '',
        sku: detail.sku ?? '',
        mpn: '',
        upc: this.toText(detail.barcode),
        brandId,
        modelId,
        status: this.toText(detail.status) || 'draft',
        visibility: this.toText(detail.visibility) || 'catalog_search',
        condition: 'new',
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
        shippingClass: this.toText(detail.shipping_class) || 'standard',
        weightKg: this.toNumberOrZero(detail.weight),
        lengthCm: this.toNumberOrZero(detail.length),
        widthCm: this.toNumberOrZero(detail.width),
        heightCm: this.toNumberOrZero(detail.height),
        warranty: this.toText(detail.warranty) || '12 Months',
        featured: Boolean(detail.featured),
        universalFit: false,
        requiresSerial: false,
        returnable: this.toBooleanValue(detail.returnable, true),
        imageUrl: this.toText(detail.thumbnail_image),
        seoTitle: this.toText(detail.seo_title),
        seoDescription: this.toText(detail.seo_description),
      },
      { emitEvent: false },
    );

    if (categoryId !== null) {
      this.loadSubCategories(categoryId, subCategoryId);
      this.loadCategoryAttributes(categoryId, attributes);
    } else {
      this.attributeRows = Object.entries(attributes).map(([key, value]) => ({ key, value }));
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
              attribute_name: String(item?.attribute_name ?? item?.name ?? 'Attribute'),
              values: Array.isArray(item?.values)
                ? item.values.map((value: any) => String(value?.attribute_value ?? value?.value ?? value))
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

  private pushUniqueValue(source: string, collection: string[], reset: () => void): void {
    const normalized = source.trim();
    if (!normalized || collection.includes(normalized)) {
      reset();
      return;
    }

    collection.unshift(normalized);
    reset();
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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

  private normalizeCategory(item: ProductCategoryResponseDto): ProductCategoryResponseDto {
    return {
      ...item,
      category_id: this.toNumberOrNull(item.category_id) ?? 0,
    };
  }

  private normalizeSubCategory(
    item: ProductSubCategoryResponseDto,
  ): ProductSubCategoryResponseDto {
    return {
      ...item,
      sub_category_id: this.toNumberOrNull(item.sub_category_id) ?? 0,
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

    return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
      (accumulator, [key, itemValue]) => {
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
      },
      {},
    );
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

  private extractFitments(detailFitments: unknown[], attributeFitments?: string): string[] {
    if (Array.isArray(detailFitments) && detailFitments.length > 0) {
      return detailFitments
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }

          if (item && typeof item === 'object') {
            return Object.values(item as Record<string, unknown>)
              .filter((value) => typeof value === 'string' || typeof value === 'number')
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

  private getDefaultAttributeRows(): AttributeRow[] {
    return [
      { key: 'material', value: '' },
      { key: 'color', value: '' },
      { key: 'compatibility', value: '' },
    ];
  }

  private buildGalleryImages(primaryImage: string | null | undefined): string[] {
    return Array.from(
      new Set(
        [primaryImage, ...this.galleryImages].filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0,
        ),
      ),
    );
  }

  private buildMediaItems(primaryImage: string | null | undefined) {
    const images = this.buildGalleryImages(primaryImage);

    return [
      ...images.map((url, index) => ({
        type: 'image',
        url,
        is_primary: index === 0,
        sort_order: index,
      })),
      ...this.videoUrls.map((url, index) => ({
        type: 'video',
        url,
        is_primary: false,
        sort_order: images.length + index,
      })),
    ];
  }

  private getDefaultFormValue() {
    return {
      categoryId: null as number | null,
      subCategoryId: null as number | null,
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
      shippingClass: 'standard',
      weightKg: 0,
      lengthCm: 0,
      widthCm: 0,
      heightCm: 0,
      warranty: '12 Months',
      featured: false,
      universalFit: false,
      requiresSerial: false,
      returnable: true,
      imageUrl: '',
      seoTitle: '',
      seoDescription: '',
    };
  }

  private resetProductForm(): void {
    const firstCategoryId = this.categories[0]?.category_id ?? null;
    this.pendingCategoryId = null;
    this.pendingSubCategoryId = null;

    this.tagInput = '';
    this.fitmentInput = '';
    this.packageItemInput = '';
    this.noteInput = '';
    this.tags = [];
    this.fitments = [];
    this.packageItems = [];
    this.notes = [];
    this.galleryImages = [];
    this.videoUrls = [];
    this.brandSearch = '';
    this.modelSearch = '';
    this.brandPage = 1;
    this.modelPage = 1;
    this.showBrandDropdown = false;
    this.showModelDropdown = false;
    this.models = [];
    this.subCategories = [];
    this.categoryAttributes = [];
    this.attributeRows = this.getDefaultAttributeRows();

    this.form.reset({
      ...this.getDefaultFormValue(),
      categoryId: firstCategoryId,
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }
}
