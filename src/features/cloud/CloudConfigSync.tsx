import { useEffect } from 'react';
import { watchCloudConfig } from './cloudConfig';
import { isCloudEnabled } from './firebase';

/**
 * Subscribes the running app to the shared settings document.
 *
 * A component rather than a call in main.tsx, because the subscription needs to be
 * torn down on unmount — and because it renders nothing, mounting it anywhere in the
 * tree costs the same.
 */
export default function CloudConfigSync() {
  useEffect(() => {
    if (!isCloudEnabled()) return;
    return watchCloudConfig();
  }, []);

  return null;
}
