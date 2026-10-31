import 'dotenv/config';
import mongoose from 'mongoose';
import Job from '../models/job.js';
import JobSource from '../models/jobSource.js';
import JobSyncRun from '../models/jobSyncRun.js';
import { synchronizeJobs } from '../services/jobIngestion/sync.js';

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is required to synchronize job listings.');
  process.exitCode = 1;
} else {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS) || 5000
    });
    await Promise.all([Job.init(), JobSource.init(), JobSyncRun.init()]);
    const result = await synchronizeJobs();
    console.log(JSON.stringify(result, null, 2));
    if (result.outcomes.some(outcome => outcome.status === 'failed' || outcome.status === 'partial')) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Job synchronization failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
