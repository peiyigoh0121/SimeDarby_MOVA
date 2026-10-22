export function getConfirmationRequiredNotice() {
  return 'Account created. Please check your inbox and spam folder to confirm your email before signing in.'
}

export function getAuthErrorMessage(error) {
  return error instanceof Error ? error.message : 'Authentication failed. Please try again.'
}
