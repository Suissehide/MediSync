import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import {
  AUTH_CARD_CLASS,
  AuthLayout,
} from '../../components/custom/authLayout.tsx'
import { Button } from '../../components/ui/button.tsx'
import { useAppForm } from '../../hooks/formConfig.tsx'
import { passwordError } from '../../libs/password.ts'
import { cn } from '../../libs/utils.ts'
import { useLogin, useRegister } from '../../queries/useAuth.ts'

export const Route = createFileRoute('/auth/')({
  component: Index,
})

function Index() {
  const navigate = useNavigate()

  const { loginMutation, isPending: isLoginPending } = useLogin()
  const { registerMutation, isPending: isRegisterPending } = useRegister()

  const [mode, setMode] = useState<'login' | 'register'>('login')

  // Form de connexion
  const loginForm = useAppForm({
    defaultValues: {
      email: '',
      password: '',
    },
    onSubmit: ({ value }) => {
      loginMutation(
        { email: value.email, password: value.password },
        {
          onSuccess: async () => {
            const redirect = new URLSearchParams(window.location.search).get(
              'redirect',
            )
            // `/dashboard` a demenage sous /e/:establishmentId/s/:serviceId ;
            // `/` redirige vers le tableau de bord du
            // contexte par defaut sans avoir a le connaitre ici.
            await navigate({ to: redirect || '/' })
          },
        },
      )
    },
  })

  // Form d'inscription
  const registerForm = useAppForm({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        if (value.password !== value.confirmPassword) {
          return {
            form: 'Les mots de passe ne correspondent pas',
            fields: {
              confirmPassword: 'Les mots de passe ne correspondent pas',
            },
          }
        }
        return undefined
      },
    },
    onSubmit: ({ value }) => {
      registerMutation(
        {
          email: value.email,
          password: value.password,
          firstName: value.firstName,
          lastName: value.lastName,
        },
        {
          onSuccess: () => {
            setMode('login')
            registerForm.reset()
          },
        },
      )
    },
  })

  const toggleLogin = () => {
    loginForm.reset()
    setMode('login')
  }

  const toggleRegister = () => {
    registerForm.reset()
    setMode('register')
  }

  return (
    <AuthLayout>
      {/* Login Card */}
      <div
        className={`${AUTH_CARD_CLASS} transition-all duration-700 ease-in-out ${
          mode === 'login'
            ? 'sm:right-8'
            : 'translate-x-[110%] sm:translate-x-0 sm:right-[-600px] opacity-0 pointer-events-none'
        }`}
      >
        <h2 className="text-left w-full text-2xl font-bold mb-8">
          S'identifier
        </h2>

        <form
          onSubmit={async (e) => {
            e.preventDefault()
            await loginForm.handleSubmit()
          }}
          className="w-full flex flex-col gap-2"
        >
          <loginForm.AppField name="email">
            {(field) => <field.Input type="email" label="Email" />}
          </loginForm.AppField>

          <loginForm.AppField name="password">
            {(field) => <field.Password label="Mot de passe" />}
          </loginForm.AppField>

          <div className="w-full text-right -mt-2">
            <button
              type="button"
              onClick={() => navigate({ to: '/auth/forgot-password' })}
              className="cursor-pointer text-sm text-text-light hover:underline"
            >
              Mot de passe oublié ?
            </button>
          </div>

          <Button
            type="submit"
            className="w-full mt-2"
            disabled={isLoginPending}
          >
            {isLoginPending ? 'Connexion...' : "S'identifier"}
          </Button>
        </form>

        <div className="text-sm text-text-light mt-4 text-center">
          Vous n'avez pas de compte ?{' '}
          <button
            type="button"
            onClick={toggleRegister}
            className="cursor-pointer text-primary hover:underline font-semibold"
          >
            Inscrivez-vous ici
          </button>
        </div>
      </div>

      {/* Register Card */}
      <div
        className={`${cn(AUTH_CARD_CLASS, 'bg-card/35')} transition-all duration-700 ease-in-out ${
          mode === 'register'
            ? 'sm:right-8'
            : 'translate-x-[110%] sm:translate-x-0 sm:right-[-600px] opacity-0 pointer-events-none'
        }`}
      >
        <h2 className="text-left w-full text-2xl font-bold mb-4">S'inscrire</h2>

        <form
          onSubmit={async (e) => {
            e.preventDefault()
            await registerForm.handleSubmit()
          }}
          className="w-full flex flex-col gap-2"
        >
          <registerForm.AppField name="email">
            {(field) => <field.Input label="Email" />}
          </registerForm.AppField>

          <registerForm.AppField name="firstName">
            {(field) => <field.Input label="Prénom" />}
          </registerForm.AppField>

          <registerForm.AppField name="lastName">
            {(field) => <field.Input label="Nom" />}
          </registerForm.AppField>

          <registerForm.AppField
            name="password"
            validators={{ onChange: ({ value }) => passwordError(value) }}
          >
            {(field) => <field.Password label="Mot de passe" />}
          </registerForm.AppField>

          <registerForm.AppField name="confirmPassword">
            {(field) => <field.Password label="Confirmer le mot de passe" />}
          </registerForm.AppField>

          <Button
            type="submit"
            className="w-full mt-2"
            disabled={isRegisterPending}
          >
            {isRegisterPending ? 'Inscription...' : "S'inscrire"}
          </Button>
        </form>

        <div className="text-sm text-text-light mt-4 text-center">
          Vous avez déjà un compte ?{' '}
          <button
            type="button"
            onClick={toggleLogin}
            className="cursor-pointer text-primary hover:underline font-semibold"
          >
            Connectez-vous ici
          </button>
        </div>
      </div>
    </AuthLayout>
  )
}

export default Index
