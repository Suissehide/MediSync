import type { User } from '@prisma/client'

export type UserEntityRepo = User
export type UserEntityCreate = Pick<
  UserEntityRepo,
  'email' | 'password' | 'firstname' | 'lastname'
>

export interface UserRepositoryInterface {
  findById: (userId: string) => Promise<UserEntityRepo>
  findByEmail: (email: string) => Promise<UserEntityRepo>
  create: (user: UserEntityCreate) => Promise<UserEntityRepo>
}
