import { afterEach } from 'vitest';
import { closeOpenServers } from './helpers/harness';

// Each harness owns a listening server; release them all between tests so a
// run never holds more than the handful of ports it is actually using.
afterEach(closeOpenServers);
