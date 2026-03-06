import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
type CarModel = {
  id: string;
  name: string;
  brand: string;
  year: number;
  price: number;
  status: 'Active' | 'Inactive';
  description: string;
  imageUrl?: string; // base64 preview
  createdAt: string;
};
@Component({
  selector: 'app-admin-carmodel',
  imports: [CommonModule, ReactiveFormsModule,FormsModule],
  templateUrl: './admin-carmodel.component.html',
  styleUrl: './admin-carmodel.component.css',
})
export class AdminCarmodelComponent {
  // UI state
  query = '';
  sortBy: 'newest' | 'name' | 'year' = 'newest';
  form;
  // modal state
  modalOpen = false;
  confirmOpen = false;
  mode: 'create' | 'edit' = 'create';
  selectedId: string | null = null;

  // demo data
  items: CarModel[] = [
    {
      id: crypto.randomUUID(),
      name: 'Civic LX',
      brand: 'Honda',
      year: 2022,
      price: 24500,
      status: 'Active',
      description: 'Reliable compact sedan with excellent fuel economy.',
      imageUrl: '',
      createdAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      name: 'Corolla SE',
      brand: 'Toyota',
      year: 2023,
      price: 26900,
      status: 'Active',
      description: 'Sporty trim with modern safety and infotainment.',
      imageUrl: '',
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    },
    {
      id: crypto.randomUUID(),
      name: 'Model 3',
      brand: 'Tesla',
      year: 2021,
      price: 38900,
      status: 'Inactive',
      description: 'Electric sedan with strong performance and range.',
      imageUrl: '',
      createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    },
  ];

 

  constructor(private fb: FormBuilder) {
     this.form = this.fb.group({
       name: ['', [Validators.required, Validators.minLength(2)]],
       brand: ['', [Validators.required, Validators.minLength(2)]],
       year: [
         new Date().getFullYear(),
         [Validators.required, Validators.min(1990), Validators.max(2100)],
       ],
       price: [0, [Validators.required, Validators.min(0)]],
       status: ['Active' as CarModel['status'], [Validators.required]],
       description: ['', [Validators.required, Validators.minLength(10)]],
       imageUrl: [''],
     });
  }

  // derived data
  get filtered(): CarModel[] {
    const q = this.query.trim().toLowerCase();
    let list = this.items.filter((x) => {
      if (!q) return true;
      return (
        x.name.toLowerCase().includes(q) ||
        x.brand.toLowerCase().includes(q) ||
        String(x.year).includes(q)
      );
    });

    list = list.sort((a, b) => {
      if (this.sortBy === 'name') return a.name.localeCompare(b.name);
      if (this.sortBy === 'year') return b.year - a.year;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  }

  // top stats
  get totalCount() {
    return this.items.length;
  }
  get activeCount() {
    return this.items.filter((x) => x.status === 'Active').length;
  }
  get inactiveCount() {
    return this.items.filter((x) => x.status === 'Inactive').length;
  }

  // modal openers
  openCreate() {
    this.mode = 'create';
    this.selectedId = null;
    this.form.reset({
      name: '',
      brand: '',
      year: new Date().getFullYear(),
      price: 0,
      status: 'Active',
      description: '',
      imageUrl: '',
    });
    this.modalOpen = true;
  }

  openEdit(item: CarModel) {
    this.mode = 'edit';
    this.selectedId = item.id;
    this.form.reset({
      name: item.name,
      brand: item.brand,
      year: item.year,
      price: item.price,
      status: item.status,
      description: item.description,
      imageUrl: item.imageUrl ?? '',
    });
    this.modalOpen = true;
  }

  closeModal() {
    this.modalOpen = false;
  }

  // delete confirm
  openDelete(item: CarModel) {
    this.selectedId = item.id;
    this.confirmOpen = true;
  }
  closeConfirm() {
    this.confirmOpen = false;
    this.selectedId = null;
  }
  confirmDelete() {
    if (!this.selectedId) return;
    this.items = this.items.filter((x) => x.id !== this.selectedId);
    this.closeConfirm();
  }

  // save
  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();

    if (this.mode === 'create') {
      const newItem: CarModel = {
        id: crypto.randomUUID(),
        name: v.name!,
        brand: v.brand!,
        year: Number(v.year),
        price: Number(v.price),
        status: v.status!,
        description: v.description!,
        imageUrl: v.imageUrl ?? '',
        createdAt: new Date().toISOString(),
      };
      this.items = [newItem, ...this.items];
    } else {
      const id = this.selectedId!;
      this.items = this.items.map((x) =>
        x.id === id
          ? {
              ...x,
              name: v.name!,
              brand: v.brand!,
              year: Number(v.year),
              price: Number(v.price),
              status: v.status!,
              description: v.description!,
              imageUrl: v.imageUrl ?? '',
            }
          : x,
      );
    }

    this.closeModal();
  }

  // file upload -> base64 preview
  async onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // basic validation
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) return; // 2MB

    const base64 = await this.fileToBase64(file);
    this.form.patchValue({ imageUrl: base64 });
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // helpers
  isInvalid(name: keyof typeof this.form.controls) {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}