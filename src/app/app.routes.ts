import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { AdminLayoutComponent } from './admin/layout/admin-layout/admin-layout.component';
import { AdminDashboardComponent } from './admin/pages/admin-dashboard/admin-dashboard.component';
import { AdminCarmodelComponent } from './admin/pages/admin-carmodel/admin-carmodel.component';
import { AdminProductsComponent } from './admin/pages/admin-products/admin-products.component';
import { AdminCouponsComponent } from './admin/pages/admin-coupons/admin-coupons.component';
import { AdminProfileComponent } from './admin/pages/admin-profile/admin-profile.component';
import { AdminProductReturnComponent } from './admin/pages/admin-product-return/admin-product-return.component';
import { AdminInventoryComponent } from './admin/pages/admin-inventory/admin-inventory.component';
import { AdminUserComponent } from './admin/pages/admin-user/admin-user.component';
import { AdminAttributesComponent } from './admin/pages/admin-attributes/admin-attributes.component';
import { AdminProductListComponent } from './admin/pages/admin-product-list/admin-product-list.component';
import { AdminProductReviewComponent } from './admin/pages/admin-product-review/admin-product-review.component';
import { AdminProductBuyerComponent } from './admin/pages/admin-product-buyer/admin-product-buyer.component';
import { AdminCategoryComponent } from './admin/pages/admin-category/admin-category.component';
import { LandingRedirectComponent } from './core/auth/landing-redirect.component';

export const routes: Routes = [
  { path: '', component: LandingRedirectComponent },
  { path: 'login', component: LoginComponent },
  {
    path: 'admin',
    component: AdminLayoutComponent,
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        component: AdminDashboardComponent,
      },
      {
        path: 'car-model',
        component: AdminCarmodelComponent,
      },
      {
        path: 'products',
        component: AdminProductsComponent,
      },
      {
        path: 'products-list',
        component: AdminProductListComponent,
      },
      {
        path: 'products-reviews',
        component: AdminProductReviewComponent,
      },
      {
        path: 'buyer',
        component: AdminProductBuyerComponent,
      },
      {
        path: 'coupons',
        component: AdminCouponsComponent,
      },
      {
        path: 'product-return',
        component: AdminProductReturnComponent,
      },
      { path: 'inventory', component: AdminInventoryComponent },

      {
        path: 'profile',
        component: AdminProfileComponent,
      },
      {
        path: 'attributes',
        component: AdminAttributesComponent,
      },
      { path: 'users', component: AdminUserComponent },
      { path: 'category', component: AdminCategoryComponent },
    ],
  },

  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
