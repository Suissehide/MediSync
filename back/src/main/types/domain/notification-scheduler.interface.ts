// Appele par application/starter.ts et par les tests, sous runAsSystem.
export interface NotificationSchedulerInterface {
  runOnce: (now: Date) => Promise<{ created: number; purged: number }>
}
