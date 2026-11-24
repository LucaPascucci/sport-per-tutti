import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface ListItem {
  readonly id: string | number;
  readonly title: string;
  readonly subtitle?: string;
}

/**
 * Lista generica di elementi con titolo e sottotitolo opzionale.
 * Quando non ci sono elementi mostra `emptyMessage` al posto della lista.
 */
@Component({
  selector: 'app-item-list',
  templateUrl: './item-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemList {
  readonly items = input.required<readonly ListItem[]>();
  readonly emptyMessage = input<string>('Non ci sono elementi da mostrare');
  readonly ariaLabel = input<string | undefined>(undefined);
}
