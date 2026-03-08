export interface Product {
  product_id: string;

  model_id?: string | null;
  category_id?: string | null;
  attribute_id?: string | null;

  sku: string;
  title: string;
  description?: string;
  long_description?: string;

  product_image_url?: string;
  product_gallary_url?: string;

  old_cost?: number | null;
  new_cost?: number | null;
  actual_cost?: number | null;

  stock_qty?: number | null;
  min_retail_qty?: number | null;
  min_dealer_qty?: number | null;

  banner_desktop_image?: string;
  banner_mobile_image?: string;

  is_fast?: boolean;
  is_active?: boolean;
  is_deleted?: boolean;
  low_stock_qty?: number | null;
  is_popular?: boolean;

  product_attributes?: string;
  is_returnable?: boolean;
  bar_code?: string;

  created_at?: string;
  created_by?: string;
  updated_at?: string;
  updated_by?: string;
}
