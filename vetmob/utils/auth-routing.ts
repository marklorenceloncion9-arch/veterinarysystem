// Diri susihon kung fieldman ang user.
export function isFieldman(user: { role?: string } | null | undefined): boolean {
  return user?.role === 'fieldman';
}

// Diri pilion ang home route base sa role.
export function getHomeRoute(user: { role?: string } | null | undefined): '/(tabs-fm)' | '/(tabs)' {
  return isFieldman(user) ? '/(tabs-fm)' : '/(tabs)';
}
