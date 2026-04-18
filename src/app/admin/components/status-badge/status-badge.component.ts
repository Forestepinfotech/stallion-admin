import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type StatusBadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './status-badge.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  @Input({ required: true }) label!: string;
  @Input() variant: StatusBadgeVariant = 'neutral';
  @Input() size: 'sm' | 'md' = 'sm';

  get classes(): string {
    const base =
      this.size === 'md'
        ? 'text-xs px-3 py-1.5 rounded-full border font-medium inline-flex items-center gap-1'
        : 'text-[11px] px-2.5 py-1 rounded-full border font-medium inline-flex items-center gap-1';

    switch (this.variant) {
      case 'success':
        return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
      case 'warning':
        return `${base} bg-amber-50 text-amber-800 border-amber-200`;
      case 'danger':
        return `${base} bg-red-50 text-red-700 border-red-200`;
      case 'info':
        return `${base} bg-sky-50 text-sky-700 border-sky-200`;
      default:
        return `${base} bg-white text-gray-800 border-gray-200`;
    }
  }
}

