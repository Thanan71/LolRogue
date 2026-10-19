import { RepositoryContainerFactory } from '@/services/container';
import type { IRepositoryContainer } from '@/services/interfaces/IRepositoryContainer';
import { supabase } from '@/services/supabaseClient';

/** One application container, composed with the existing shared Supabase client. */
export const applicationRepositories: IRepositoryContainer =
  RepositoryContainerFactory.create(supabase);
