// Diri kuhaon ang label sa approval sa owner.
export function getOwnerApprovalLabel(user?: {
  approval_status?: string | null;
  approval_label?: string | null;
  account_under_review?: boolean;
} | null): string | null {
  if (!user) return null;
  if (user.approval_label) return user.approval_label;
  if (user.account_under_review || user.approval_status === 'pending') return 'Under Review';
  if (user.approval_status === 'approved') return 'Approved';
  if (user.approval_status === 'rejected') return 'Rejected';
  return null;
}

// Diri i-format ang ngalan sa owner nga ipakita.
export function formatOwnerDisplayName(
  name: string,
  user?: {
    approval_status?: string | null;
    approval_label?: string | null;
    account_under_review?: boolean;
  } | null
): string {
  const label = getOwnerApprovalLabel(user);
  if (!label || label === 'Approved') return name;
  return `${name} (${label})`;
}

// Diri susihon kung gi-review pa ang account.
export function isAccountUnderReview(user?: {
  approval_status?: string | null;
  account_under_review?: boolean;
} | null): boolean {
  return Boolean(user?.account_under_review || user?.approval_status === 'pending');
}
