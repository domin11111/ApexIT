import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/** Link и навигация с учётом текущей локали. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
