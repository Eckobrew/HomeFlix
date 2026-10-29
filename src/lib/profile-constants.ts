export const PROFILE_PALETTES = [
  { avatarColor: 'from-red-600 to-red-800', avatarBg: 'bg-red-600' },
  { avatarColor: 'from-purple-600 to-pink-600', avatarBg: 'bg-purple-600' },
  { avatarColor: 'from-sky-500 to-blue-700', avatarBg: 'bg-blue-600' },
  { avatarColor: 'from-emerald-500 to-teal-700', avatarBg: 'bg-emerald-600' },
  { avatarColor: 'from-amber-500 to-orange-700', avatarBg: 'bg-amber-600' },
  { avatarColor: 'from-rose-500 to-red-700', avatarBg: 'bg-rose-600' },
  { avatarColor: 'from-indigo-500 to-purple-700', avatarBg: 'bg-indigo-600' },
  { avatarColor: 'from-teal-500 to-emerald-700', avatarBg: 'bg-teal-600' },
  { avatarColor: 'from-fuchsia-500 to-pink-700', avatarBg: 'bg-fuchsia-600' },
];

export function getInitials(name: string): string {
  if (!name) return 'HF';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
