import { Metadata } from 'next';
import { redirect } from 'next/navigation';

interface MediaPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Watch on HomeStream', description: 'Your cinema. Your collection.' };
}

export default async function MediaPage({ params }: MediaPageProps) {
  // Seamlessly route into the main app with the media modal opened
  redirect(`/?media=${encodeURIComponent((await params).id)}`);
}
