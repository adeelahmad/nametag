import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Navigation from '@/components/Navigation';
import AssistantApp from '@/components/assistant/AssistantApp';
import { getOrCreateSettings, toView } from '@/lib/assistant/settings';

export const dynamic = 'force-dynamic';

export default async function AssistantPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const settings = await getOrCreateSettings(session.user.id);
  const view = toView(settings);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation
        userEmail={session.user.email || undefined}
        userName={session.user.name}
        userNickname={session.user.nickname}
        userPhoto={session.user.photo}
        currentPath="/assistant"
      />
      <AssistantApp settingsView={view} />
    </div>
  );
}
