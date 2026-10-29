// Appele par application/starter.ts et par les tests, sous runAsSystem.
export interface NotificationMailerInterface {
  runOnce: (
    now: Date,
  ) => Promise<{ sent: number; skipped: number; digests: number }>
}
