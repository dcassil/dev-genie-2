export interface VersionedRolePrompt {
  readonly id: string;
  readonly version: string;
  readonly ref: string;
  readonly text: string;
}
