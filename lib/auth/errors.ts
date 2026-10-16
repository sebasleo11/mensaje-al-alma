type AuthFailure = { code?: string; status?: number };

export function authErrorMessage(error: AuthFailure, mode: 'login' | 'register') {
  if (error.status === 0) {
    return 'No pudimos conectarnos al servicio de cuentas. Revisá tu conexión y volvé a intentar.';
  }
  if (error.status && error.status >= 500) {
    return 'El servicio de cuentas no está disponible por ahora. Esperá un momento y volvé a intentar.';
  }
  switch (error.code) {
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Revisá el email y los datos ingresados antes de volver a intentar.';
    case 'email_address_not_authorized':
      return 'Por ahora no podemos enviar la confirmación a ese email. Contactá a soporte.';
    case 'email_provider_disabled':
      return 'El acceso con email no está disponible por ahora. Podés volver más tarde.';
    case 'request_timeout':
      return 'La conexión tardó demasiado. Esperá un momento y volvé a intentar.';
    case 'invalid_credentials':
      return 'El email o la contraseña no coinciden. Revisalos y volvé a intentar.';
    case 'email_not_confirmed':
      return 'Primero confirmá tu email desde el enlace que recibiste en tu correo.';
    case 'user_already_exists':
    case 'email_exists':
      return 'No pudimos crear la cuenta. Si ya te registraste, probá iniciar sesión.';
    case 'weak_password':
      return 'Elegí una contraseña más segura. Probá combinar letras, números y símbolos.';
    case 'signup_disabled':
      return 'El registro no está disponible por ahora. Podés volver más tarde.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Hubo varios intentos seguidos. Esperá un momento antes de volver a intentar.';
    default:
      if (error.status === 429) return 'Esperá un momento antes de volver a intentar.';
      return mode === 'login'
        ? 'No pudimos iniciar sesión. Revisá tu conexión y volvé a intentar.'
        : 'No pudimos crear tu cuenta. Revisá tus datos y volvé a intentar.';
  }
}
