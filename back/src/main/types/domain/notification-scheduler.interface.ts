// Appele par le setInterval de application/starter.ts et par les tests avec une date fixe,
// sous le mode systeme du contexte de tenant (Task 5).
export interface NotificationSchedulerInterface {
  runOnce: (now: Date) => Promise<{ created: number; purged: number }>
}
