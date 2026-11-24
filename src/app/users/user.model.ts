export interface User {
  readonly id: number;
  readonly name: string;
  readonly surname: string;
  readonly mail: string;
  readonly updated_at: Date | null;
  readonly deleted: boolean;
}
