import type { Prisma, User } from '@prisma/client'

export type UserEntityRepo = User
export type UserCreateEntityRepo = Pick<
  UserEntityRepo,
  'email' | 'password' | 'firstName' | 'lastName'
>
export type UserUpdateEntityRepo = Pick<
  Prisma.UserUncheckedUpdateInput,
  'email' | 'role' | 'firstName' | 'lastName'
>

export interface UserRepositoryInterface {
  findAll: () => Promise<UserEntityRepo[]>
  findByID: (userId: string) => Promise<UserEntityRepo>
  findByEmail: (email: string) => Promise<UserEntityRepo>
  create: (user: UserCreateEntityRepo) => Promise<UserEntityRepo>
  update: (
    userID: string,
    userUpdateParams: UserUpdateEntityRepo,
  ) => Promise<UserEntityRepo>
  delete: (userID: string) => Promise<UserEntityRepo>
}
