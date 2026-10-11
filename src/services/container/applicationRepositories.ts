import type { IRepositoryContainer } from '../interfaces/IRepositoryContainer';
import { supabase } from '../supabaseClient';
import { RepositoryContainerFactory } from './index';

/** The application composition root: one container, using the existing shared client. */
export const applicationRepositories: IRepositoryContainer =
  RepositoryContainerFactory.create(supabase);
