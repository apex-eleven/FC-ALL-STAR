import {
  claimOneOfOneCloud,
  listOneOfOneCloud,
  removeOneOfOneCloud,
  setOneOfOneCloud,
} from '@/features/cloud/cloudOneOfOne';
import { isCloudEnabled } from '@/features/cloud/firebase';
import type { OneOfOneRecord, OneOfOneResult } from './oneOfOne';
import {
  claimOneOfOneLocal,
  listOneOfOneLocal,
  removeOneOfOneLocal,
  setOneOfOneLocal,
} from './oneOfOneStore';

/** The shared register when there is a server, this browser's when there is not. */
export async function claimOneOfOne(record: OneOfOneRecord): Promise<OneOfOneResult> {
  return isCloudEnabled() ? claimOneOfOneCloud(record) : claimOneOfOneLocal(record);
}

/** Every title held, or null when the register could not be read. */
export async function listOneOfOne(): Promise<OneOfOneRecord[] | null> {
  return isCloudEnabled() ? listOneOfOneCloud() : listOneOfOneLocal();
}

/** Admin: gives a title to `record.cardId`, taking it from whoever held it. */
export async function setOneOfOne(record: OneOfOneRecord): Promise<boolean> {
  return isCloudEnabled() ? setOneOfOneCloud(record) : setOneOfOneLocal(record);
}

/** Admin: frees a title. */
export async function removeOneOfOne(key: string): Promise<boolean> {
  return isCloudEnabled() ? removeOneOfOneCloud(key) : removeOneOfOneLocal(key);
}
