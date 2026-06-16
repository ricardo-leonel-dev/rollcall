import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressSpinnerModule],
  selector: 'app-loading-spinner',
  template: `
    <div class="flex flex-col items-center justify-center py-12 gap-4">
      <mat-spinner [diameter]="48" />
      @if (message) { <p class="text-gray-500 text-sm">{{message}}</p> }
    </div>
  `,
})
export class LoadingSpinnerComponent {
  @Input() message = '';
}
