import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type NotificationVariant = 'info' | 'success' | 'warning' | 'error';

const VARIANT_CLASSES: Record<NotificationVariant, string> = {
  info: 'border-blue-300 bg-blue-50 text-blue-800',
  success: 'border-green-300 bg-green-50 text-green-800',
  warning: 'border-amber-300 bg-amber-50 text-amber-800',
  error: 'border-red-300 bg-red-50 text-red-800',
};

/**
 * Notifica in pagina, persistente: non ha timer né pulsante di chiusura.
 * Le varianti `error` e `warning` usano `role="alert"`, le altre `role="status"`.
 */
@Component({
  selector: 'app-notification-banner',
  templateUrl: './notification-banner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationBanner {
  readonly message = input.required<string>();
  readonly variant = input<NotificationVariant>('info');

  protected readonly role = computed(() => {
    const variant = this.variant();
    return variant === 'error' || variant === 'warning' ? 'alert' : 'status';
  });

  protected readonly classes = computed(
    () => `rounded-lg border p-4 ${VARIANT_CLASSES[this.variant()]}`,
  );
}
