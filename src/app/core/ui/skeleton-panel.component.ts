import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-skeleton-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="rounded-3xl border bg-white shadow-sm p-6 space-y-4 animate-pulse"
      [ngClass]="extraClasses"
      [style.minHeight.px]="minHeight"
    >
      <ng-content></ng-content>
    </div>
  `,
})
export class SkeletonPanelComponent {
  @Input() minHeight = 120;
  @Input() extraClasses = '';
}
