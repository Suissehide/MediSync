import { createFileRoute } from '@tanstack/react-router'
import { Button } from '../../components/ui/button.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Form } from 'radix-ui'
import type React from 'react'
import { useState } from 'react'
import { useLogin } from '../../hooks/queries/useAuth.ts'

export const Route = createFileRoute('/auth/login')({
  component: Login,
})

function Login() {
  const { loginMutation, isPending } = useLogin()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    loginMutation({ email, password })
  }

  return (
    <div className="w-[100%]">
      <div className="flex justify-center">
        <div className="z-1 w-[500px] bg-card/35 flex flex-col items-center px-16 py-8 mt-20 rounded-2xl border border-gray-100 backdrop-blur-sm">
          <h1>S’identifier</h1>

          <Form.Root onSubmit={handleSubmit}>
            <Field
              type="email"
              name="email"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Field
              type="password"
              name="password"
              label="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" className="w-100 mt-4">
              {isPending ? 'Connexion...' : 'S’identifier'}
            </Button>
          </Form.Root>
        </div>
        <div className="absolute left-[-200px] top-[200px] animate-bounce subtle-bounce">
          <div className=" rotate-[60deg] w-[500px] h-[500px] bg-gradient-to-b from-primary to-primary-foreground p-6 rounded-[5rem]" />
        </div>
        <div
          className="absolute right-[-250px] top-[-75px] animate-bounce subtle-bounce"
          style={{ animationDelay: '-1.7s' }}
        >
          <div className="rotate-[210deg] w-[500px] h-[500px] bg-gradient-to-b from-primary to-primary-foreground p-6 rounded-[5rem]" />
        </div>
      </div>
    </div>
  )
}

export default Login
