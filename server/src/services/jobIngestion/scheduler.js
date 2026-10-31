import mongoose from 'mongoose';
import { synchronizeJobs } from './sync.js';

let intervalHandle = null;

export function startJobSyncScheduler() {
  const intervalMinutes = Number(process.env.JOB_SYNC_INTERVAL_MINUTES) || 360;
  if (intervalHandle) return;
  if (!process.env.MONGODB_URI) {
    console.warn('Job sync scheduler disabled: MONGODB_URI is not configured.');
    return;
  }
  if (mongoose.connection.readyState !== 1) {
    mongoose.connection.once('connected', startJobSyncScheduler);
    return;
  }
  const run = () => synchronizeJobs().catch(error => console.error(`Scheduled job sync failed: ${error.message}`));
  run();
  intervalHandle = setInterval(run, intervalMinutes * 60 * 1000);
  intervalHandle.unref();
}

export function stopJobSyncScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}
