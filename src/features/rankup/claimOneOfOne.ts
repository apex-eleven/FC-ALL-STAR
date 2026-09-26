import { claimOneOfOneCloud } from '@/features/cloud/cloudOneOfOne';
import { isCloudEnabled } from '@/features/cloud/firebase';
import type { OneOfOneRecord, OneOfOneResult } from './oneOfOne';
import { claimOneOfOneLocal } from './oneOfOneStore';

/** The shared register when there is a server, this browser's when there is not. */
export async function claimOneOfOne(record: OneOfOneRecord): Promise<OneOfOneResult> {
  return isCloudEnabled() ? claimOneOfOneCloud(record) : claimOneOfOneLocal(record);
}
