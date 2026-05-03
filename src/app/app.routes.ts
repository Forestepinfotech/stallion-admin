import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./core/auth/landing-redirect.component').then((m) => m.LandingRedirectComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent),
  },
  {
    loadComponent: () =>
      import('./admin/layout/admin-layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./admin/pages/admin-dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
      },
      {
        path: 'car-brand',
        loadComponent: () =>
          import('./admin/pages/admin-carbrand/admin-carbrand.component').then((m) => m.AdminCarbrandComponent),
      },
      {
        path: 'car-model',
        loadComponent: () =>
          import('./admin/pages/admin-carmodel/admin-carmodel.component').then((m) => m.AdminCarmodelComponent),
      },
      {
        path: 'products',
        loadComponent: () =>
          import('./admin/pages/admin-products/admin-products.component').then((m) => m.AdminProductsComponent),
      },
      {
        path: 'products-list',
        loadComponent: () =>
          import('./admin/pages/admin-product-list/admin-product-list.component').then((m) => m.AdminProductListComponent),
      },
      {
        path: 'products-list/:id',
        loadComponent: () =>
          import('./admin/pages/admin-product-detail/admin-product-detail.component').then((m) => m.AdminProductDetailComponent),
      },
      {
        path: 'products-reviews',
        loadComponent: () =>
          import('./admin/pages/admin-product-review/admin-product-review.component').then((m) => m.AdminProductReviewComponent),
      },
      {
        path: 'buyer',
        loadComponent: () =>
          import('./admin/pages/admin-product-buyer/admin-product-buyer.component').then((m) => m.AdminProductBuyerComponent),
      },
      {
        path: 'coupons',
        loadComponent: () =>
          import('./admin/pages/admin-coupons/admin-coupons.component').then((m) => m.AdminCouponsComponent),
      },
      {
        path: 'coupons/:id',
        loadComponent: () =>
          import('./admin/pages/admin-coupons/admin-coupon-detail.component').then((m) => m.AdminCouponDetailComponent),
      },
      {
        path: 'product-return',
        loadComponent: () =>
          import('./admin/pages/admin-product-return/admin-product-return.component').then((m) => m.AdminProductReturnComponent),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./admin/pages/admin-orders/admin-orders.component').then((m) => m.AdminOrdersComponent),
      },
      {
        path: 'orders/:id',
        loadComponent: () =>
          import('./admin/pages/admin-order-detail/admin-order-detail.component').then((m) => m.AdminOrderDetailComponent),
      },
      {
        path: 'return-reasons',
        loadComponent: () =>
          import('./admin/pages/admin-return-reasons/admin-return-reasons.component').then((m) => m.AdminReturnReasonsComponent),
      },
      {
        path: 'inventory',
        loadComponent: () =>
          import('./admin/pages/admin-inventory/admin-inventory.component').then((m) => m.AdminInventoryComponent),
      },

      {
        path: 'profile',
        loadComponent: () =>
          import('./admin/pages/admin-profile/admin-profile.component').then((m) => m.AdminProfileComponent),
      },
      {
        path: 'attributes',
        loadComponent: () =>
          import('./admin/pages/admin-attributes/admin-attributes.component').then((m) => m.AdminAttributesComponent),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./admin/pages/admin-user/admin-user.component').then((m) => m.AdminUserComponent),
      },
      {
        path: 'users/:id',
        loadComponent: () =>
          import('./admin/pages/admin-user-detail/admin-user-detail.component').then((m) => m.AdminUserDetailComponent),
      },
      {
        path: 'category',
        loadComponent: () =>
          import('./admin/pages/admin-category/admin-category.component').then((m) => m.AdminCategoryComponent),
      },
      {
        path: 'gallery',
        loadComponent: () =>
          import('./admin/pages/admin-gallery/admin-gallery.component').then((m) => m.AdminGalleryComponent),
      },
      {
        path: 'excel-import',
        loadComponent: () =>
          import('./admin/pages/admin-excel-import/admin-excel-import.component').then((m) => m.AdminExcelImportComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
