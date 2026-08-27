export interface UserAccount {
  id: number;
  username: string;
  is_admin: boolean;
}

export interface UserFormState extends UserAccount {
  password: string;
}

export interface UserUpdatePayload {
  username: string;
  is_admin: boolean;
  password?: string;
}
