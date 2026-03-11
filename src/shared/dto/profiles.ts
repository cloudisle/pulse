import { ProfileOverride } from '../models/profile'

export interface CreateProfileInput {
  systemId: string;
  name: string;
  description?: string;
  overrides: ProfileOverride[];
}

export interface UpdateProfileInput {
  name?: string;
  description?: string;
  overrides?: ProfileOverride[];
}
