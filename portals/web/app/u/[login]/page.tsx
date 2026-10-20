import { ProfileView } from './ProfileView';

export default async function ProfilePage({ params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  return <ProfileView login={decodeURIComponent(login)} />;
}
