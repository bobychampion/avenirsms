import React from 'react';

const SIZE_CLASSES = {
  xs: 'w-9 h-9 text-sm',
  sm: 'w-11 h-11 text-lg',
  md: 'w-14 h-14 text-xl',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-20 h-20 text-3xl',
} as const;

const ROUNDED_CLASSES = {
  full: 'rounded-full',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl',
} as const;

export interface AvatarProps {
  photoUrl?: string | null;
  /** Used to derive the initials fallback when there's no photo. */
  name?: string;
  /** Character shown when `name` is empty (default '?'). */
  fallbackChar?: string;
  size?: keyof typeof SIZE_CLASSES;
  rounded?: keyof typeof ROUNDED_CLASSES;
  /** Tailwind gradient stop classes, e.g. 'from-indigo-500'. Ignored when photoUrl is set. */
  gradientFrom?: string;
  gradientTo?: string;
  className?: string;
}

/**
 * Photo-or-initials avatar used wherever a person (user, staff, student) is
 * shown across the app. Renders the photo if present, otherwise a gradient
 * circle/square with their first initial — matching the look every render
 * site already had before photos existed.
 */
export default function Avatar({
  photoUrl,
  name = '',
  fallbackChar = '?',
  size = 'sm',
  rounded = 'xl',
  gradientFrom = 'from-indigo-500',
  gradientTo = 'to-purple-600',
  className = '',
}: AvatarProps) {
  const sizeClass = SIZE_CLASSES[size];
  const roundedClass = ROUNDED_CLASSES[rounded];
  const initial = name?.[0]?.toUpperCase() || fallbackChar;

  return (
    <div className={`${sizeClass} ${roundedClass} overflow-hidden flex-shrink-0 ${className}`}>
      {photoUrl ? (
        <img src={photoUrl} alt={name || 'Avatar'} className="w-full h-full object-cover" />
      ) : (
        <div className={`w-full h-full bg-gradient-to-br ${gradientFrom} ${gradientTo} flex items-center justify-center text-white font-bold`}>
          {initial}
        </div>
      )}
    </div>
  );
}
