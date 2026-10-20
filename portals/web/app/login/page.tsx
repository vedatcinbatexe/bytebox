import { LoginCard } from './LoginCard';

interface Props {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { returnTo, error } = await searchParams;
  // Only come back to a page of Bytebox itself
  const safeReturnTo = returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
  return <LoginCard returnTo={safeReturnTo} error={error} />;
}
