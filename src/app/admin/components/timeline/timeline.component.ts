import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type TimelineItem = {
  id?: string | number;
  at: string | Date;
  title: string;
  description?: string | null;
  meta?: unknown;
};

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './timeline.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineComponent {
  @Input({ required: true }) items: TimelineItem[] = [];
}

