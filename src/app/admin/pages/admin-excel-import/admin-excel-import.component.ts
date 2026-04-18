import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ExcelImportService } from '../../../core/import/excel-import.service';
import { ToastService } from '../../../core/notification/toast.service';

@Component({
  selector: 'app-admin-excel-import',
  imports: [CommonModule],
  templateUrl: './admin-excel-import.component.html',
  styleUrl: './admin-excel-import.component.css',
})
export class AdminExcelImportComponent implements OnDestroy {
  private readonly excelImportService = inject(ExcelImportService);
  private readonly toastService = inject(ToastService);

  dragActive = false;
  uploading = false;
  uploadProgress = signal<number | null>(null);
  selectedFile = signal<File | null>(null);
  responseJson = signal<string>('');
  errorMessage = signal<string>('');

  ngOnDestroy(): void {
    // no-op (kept for parity if we later add object URLs)
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    if (event.currentTarget === event.target) {
      this.dragActive = false;
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive = false;
    const file = event.dataTransfer?.files?.[0] ?? null;
    this.trySetSelectedFile(file);
  }

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (input) input.value = '';
    this.trySetSelectedFile(file);
  }

  clear(): void {
    this.selectedFile.set(null);
    this.uploadProgress.set(null);
    this.responseJson.set('');
    this.errorMessage.set('');
  }

  async upload(): Promise<void> {
    const file = this.selectedFile();
    if (!file || this.uploading) return;

    this.uploading = true;
    this.uploadProgress.set(0);
    this.responseJson.set('');
    this.errorMessage.set('');

    try {
      const response = await this.excelImportService.uploadExcel(file, (p) => {
        this.uploadProgress.set(p);
      });
      this.responseJson.set(JSON.stringify(response, null, 2));
      this.toastService.success('Excel uploaded.');
    } catch (error) {
      const message = this.getErrorMessage(error, 'Upload failed.');
      this.errorMessage.set(message);
      this.toastService.error(message);
    } finally {
      this.uploading = false;
      this.uploadProgress.set(null);
    }
  }

  private trySetSelectedFile(file: File | null): void {
    this.responseJson.set('');
    this.errorMessage.set('');

    if (!file) {
      return;
    }

    if (!this.isExcelFile(file)) {
      this.toastService.warning('Please select an Excel file (.xls or .xlsx).');
      return;
    }

    this.selectedFile.set(file);
  }

  private isExcelFile(file: File): boolean {
    const name = String(file.name ?? '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return true;

    const type = String(file.type ?? '').toLowerCase();
    return (
      type === 'application/vnd.ms-excel' ||
      type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  }

  private getErrorMessage(error: any, fallback: string): string {
    return error?.error?.message || error?.message || fallback;
  }
}

