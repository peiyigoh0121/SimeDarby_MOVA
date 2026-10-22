import assert from 'node:assert/strict'
import test from 'node:test'
import { getAuthErrorMessage, getConfirmationRequiredNotice } from './authFeedback.js'

test('confirmation-required sign-up gives clear inbox and spam guidance', () => {
  assert.equal(
    getConfirmationRequiredNotice(),
    'Account created. Please check your inbox and spam folder to confirm your email before signing in.',
  )
})

test('failed sign-up exposes the Supabase error and has a safe fallback', () => {
  assert.equal(getAuthErrorMessage(new Error('Email rate limit exceeded')), 'Email rate limit exceeded')
  assert.equal(getAuthErrorMessage(null), 'Authentication failed. Please try again.')
})
