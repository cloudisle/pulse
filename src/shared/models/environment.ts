export interface EnvironmentVariable {
  key: string;
  value: string;
  sensitive: boolean; // masked in UI; omitted on export
}

export interface Environment {
  id: string; // UUID
  systemId: string; // FK → System
  name: string;
  variables: EnvironmentVariable[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
