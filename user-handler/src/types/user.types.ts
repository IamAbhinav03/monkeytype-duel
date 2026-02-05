export type User = {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserDto = {
  username: string;
  email: string;
};

export type UpdateUserDto = {
  username?: string;
  email?: string;
};
