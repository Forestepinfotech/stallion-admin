export type BuyerType = 'customer' | 'dealer';

export interface BuyerInfo {
  buyer_id: string;
  type: BuyerType;
  name: string;
  email: string;
  phone?: string;

  address_line1: string;
  address_line2?: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
}

export interface OrderItem {
  product_id: string;
  product_title: string;
  sku?: string;
  qty: number;
}

export interface BuyerOrder {
  order_id: string;
  buyer: BuyerInfo;

  order_date: string; // ISO string
  items: OrderItem[]; // multiple items show in same section ✅
}
