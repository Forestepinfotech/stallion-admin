import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Review } from './review.model';

const STORAGE_KEY = 'reviews_admin_v1';

function uid() {
  return (
    'r_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16)
  );
}
function nowIso() {
  return new Date().toISOString();
}

@Injectable({ providedIn: 'root' })
export class ReviewStoreService {
  private readonly _reviews$ = new BehaviorSubject<Review[]>(this.load());
  readonly reviews$ = this._reviews$.asObservable();

  get snapshot() {
    return this._reviews$.value;
  }

  seedIfEmpty() {
    if (this.snapshot.length) return;

    const seed: Review[] = [
      {
        review_id: uid(),
        product_id: 'p_001',
        name: 'Amanpreet Singh',
        email: 'aman@example.com',
        rating: 5,
        comment: 'Solid build quality. Works perfectly on my impact driver.',
        images: [
          'https://picsum.photos/seed/rev1/600/400',
          'https://picsum.photos/seed/rev2/600/400',
        ],
        created_at: nowIso(),
      },
      {
        review_id: uid(),
        product_id: 'p_001',
        name: 'Sarah M.',
        email: 'sarah@example.com',
        rating: 4,
        comment: 'Good value for money. Delivery was fast.',
        created_at: nowIso(),
      },
      {
        review_id: uid(),
        product_id: 'p_002',
        name: 'John D.',
        email: 'john@example.com',
        rating: 3,
        comment: 'Okay tool. Expected slightly better finishing.',
        images: ['https://picsum.photos/seed/rev3/600/400'],
        created_at: nowIso(),
      },
    ];

    this.set(seed);
  }

  add(review: Omit<Review, 'review_id' | 'created_at'>) {
    const r: Review = { ...review, review_id: uid(), created_at: nowIso() };
    this.set([r, ...this.snapshot]);
  }

  private set(reviews: Review[]) {
    this._reviews$.next(reviews);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
  }

  private load(): Review[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
