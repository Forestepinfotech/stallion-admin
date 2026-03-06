export interface Review {
  review_id: string;
  product_id: string;

  name: string;
  email: string;
  rating: number; // 1..5
  comment: string;

  images?: string[]; // URLs (optional)

  created_at?: string;
}
