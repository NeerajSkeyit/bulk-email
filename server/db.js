import { MongoClient, ObjectId } from 'mongodb';
import { config } from './config.js';

let client;
let database;

export async function getDb() {
  if (!config.mongoUri) {
    throw new Error('MONGO_URI is required for template storage.');
  }

  if (database) {
    return database;
  }

  client = new MongoClient(config.mongoUri);
  await client.connect();
  database = client.db();
  await database.collection('mailTemplates').createIndex({ updatedAt: -1 });
  await database.collection('mailJobs').createIndex({ createdAt: -1 });
  await database.collection('mailLogs').createIndex({ jobId: 1, status: 1 });
  await database.collection('mailLogs').createIndex({ updatedAt: -1 });
  await database.collection('mailLogs').createIndex({ sentAt: -1 });
  return database;
}

export function toObjectId(id) {
  if (!ObjectId.isValid(id)) {
    throw new Error('Invalid template id.');
  }

  return new ObjectId(id);
}

export function serializeTemplate(template) {
  if (!template) {
    return null;
  }

  return {
    id: template._id.toString(),
    name: template.name,
    subject: template.subject,
    content: template.content,
    attachment: template.attachment
      ? {
          originalName: template.attachment.originalName,
          filename: template.attachment.filename,
          mimetype: template.attachment.mimetype,
          size: template.attachment.size
        }
      : null,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt
  };
}

export async function listTemplates() {
  const db = await getDb();
  const templates = await db
    .collection('mailTemplates')
    .find({})
    .sort({ updatedAt: -1 })
    .toArray();

  return templates.map(serializeTemplate);
}

export async function getTemplateById(id) {
  const db = await getDb();
  return db.collection('mailTemplates').findOne({ _id: toObjectId(id) });
}

export async function createTemplate({ name, subject, content, attachment }) {
  const db = await getDb();
  const now = new Date();
  const doc = {
    name,
    subject,
    content,
    attachment: attachment || null,
    createdAt: now,
    updatedAt: now
  };

  const result = await db.collection('mailTemplates').insertOne(doc);
  return serializeTemplate({ ...doc, _id: result.insertedId });
}

export async function updateTemplate(id, updates) {
  const db = await getDb();
  const result = await db.collection('mailTemplates').findOneAndUpdate(
    { _id: toObjectId(id) },
    {
      $set: {
        ...updates,
        updatedAt: new Date()
      }
    },
    { returnDocument: 'after' }
  );

  return serializeTemplate(result);
}

export async function deleteTemplate(id) {
  const db = await getDb();
  return db.collection('mailTemplates').findOneAndDelete({ _id: toObjectId(id) });
}

export function serializeMailJob(job, counts = {}) {
  if (!job) {
    return null;
  }

  return {
    id: job._id.toString(),
    templateId: job.templateId.toString(),
    templateName: job.templateName,
    sendMode: job.sendMode,
    queueIntervalSeconds: job.queueIntervalSeconds,
    status: job.status,
    total: job.total,
    pending: counts.pending || 0,
    sending: counts.sending || 0,
    sent: counts.sent || 0,
    failed: counts.failed || 0,
    createdAt: job.createdAt,
    startedAt: job.startedAt || null,
    completedAt: job.completedAt || null,
    updatedAt: job.updatedAt
  };
}

export function serializeMailLog(log) {
  if (!log) {
    return null;
  }

  return {
    id: log._id.toString(),
    jobId: log.jobId.toString(),
    templateId: log.templateId.toString(),
    templateName: log.templateName,
    templateSubject: log.templateSubject,
    email: log.email,
    status: log.status,
    messageId: log.messageId || '',
    error: log.error || '',
    attempts: log.attempts || 0,
    sentAt: log.sentAt || null,
    failedAt: log.failedAt || null,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt
  };
}

export async function createMailJob({ template, emails, sendOptions }) {
  const db = await getDb();
  const now = new Date();
  const templateId = template._id;
  const job = {
    templateId,
    templateName: template.name,
    sendMode: sendOptions.mode,
    queueIntervalSeconds: sendOptions.delaySeconds,
    status: 'queued',
    total: emails.length,
    createdAt: now,
    updatedAt: now
  };

  const jobResult = await db.collection('mailJobs').insertOne(job);
  const jobId = jobResult.insertedId;
  const logs = emails.map((email) => ({
    jobId,
    templateId,
    templateName: template.name,
    templateSubject: template.subject,
    email,
    status: 'pending',
    attempts: 0,
    createdAt: now,
    updatedAt: now
  }));

  await db.collection('mailLogs').insertMany(logs);
  return serializeMailJob({ ...job, _id: jobId }, { pending: emails.length });
}

export async function getMailJob(id) {
  const db = await getDb();
  return db.collection('mailJobs').findOne({ _id: toObjectId(id) });
}

export async function getMailLog(id) {
  const db = await getDb();
  return db.collection('mailLogs').findOne({ _id: toObjectId(id) });
}

export async function getMailJobSnapshot(id) {
  const db = await getDb();
  const jobId = toObjectId(id);
  const [job, logs, statusCounts] = await Promise.all([
    db.collection('mailJobs').findOne({ _id: jobId }),
    db.collection('mailLogs').find({ jobId, status: 'failed' }).sort({ updatedAt: -1 }).toArray(),
    db
      .collection('mailLogs')
      .aggregate([
        { $match: { jobId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
      .toArray()
  ]);

  const counts = statusCounts.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  return {
    job: serializeMailJob(job, counts),
    logs: logs.map(serializeMailLog)
  };
}

export async function listMailJobs(completedLimit = 50) {
  const db = await getDb();
  const [activeJobs, completedJobs] = await Promise.all([
    db
      .collection('mailJobs')
      .find({ status: { $in: ['queued', 'running'] } })
      .sort({ createdAt: -1 })
      .toArray(),
    db
      .collection('mailJobs')
      .find({ status: { $nin: ['queued', 'running'] } })
      .sort({ createdAt: -1 })
      .limit(completedLimit)
      .toArray()
  ]);
  const jobs = [...activeJobs, ...completedJobs];
  const jobIds = jobs.map((job) => job._id);

  if (jobIds.length === 0) {
    return [];
  }

  const statusCounts = await db
    .collection('mailLogs')
    .aggregate([
      { $match: { jobId: { $in: jobIds } } },
      {
        $group: {
          _id: {
            jobId: '$jobId',
            status: '$status'
          },
          count: { $sum: 1 }
        }
      }
    ])
    .toArray();

  const countsByJob = statusCounts.reduce((acc, item) => {
    const jobId = item._id.jobId.toString();
    acc[jobId] = acc[jobId] || {};
    acc[jobId][item._id.status] = item.count;
    return acc;
  }, {});

  return jobs.map((job) => serializeMailJob(job, countsByJob[job._id.toString()] || {}));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listMailLogs(filters = {}) {
  const db = await getDb();
  const query = {};
  const page = Math.max(Number(filters.page) || 1, 1);
  const limit = Math.min(Number(filters.limit) || 25, 100);
  const skip = (page - 1) * limit;

  if (filters.search) {
    const pattern = new RegExp(escapeRegex(filters.search), 'i');
    query.$or = [{ email: pattern }, { templateSubject: pattern }];
  }

  if (filters.templateId && ObjectId.isValid(filters.templateId)) {
    query.templateId = toObjectId(filters.templateId);
  }

  if (filters.status) {
    query.status = filters.status;
  }

  const dateRange = {};
  if (filters.from) {
    const from = new Date(filters.from);
    if (!Number.isNaN(from.getTime())) {
      dateRange.$gte = from;
    }
  }

  if (filters.to) {
    const to = new Date(filters.to);
    if (!Number.isNaN(to.getTime())) {
      dateRange.$lte = to;
    }
  }

  if (Object.keys(dateRange).length > 0) {
    query.updatedAt = dateRange;
  }

  const [logs, total] = await Promise.all([
    db
      .collection('mailLogs')
      .find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection('mailLogs').countDocuments(query)
  ]);

  return {
    logs: logs.map(serializeMailLog),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1)
    }
  };
}

export async function getPendingLogsForJob(jobId) {
  const db = await getDb();
  return db
    .collection('mailLogs')
    .find({ jobId: toObjectId(jobId), status: 'pending' })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function updateMailJobStatus(id, status, extra = {}) {
  const db = await getDb();
  const now = new Date();
  await db.collection('mailJobs').updateOne(
    { _id: toObjectId(id) },
    {
      $set: {
        status,
        ...extra,
        updatedAt: now
      }
    }
  );
}

export async function markMailLogSending(id) {
  const db = await getDb();
  const now = new Date();
  await db.collection('mailLogs').updateOne(
    { _id: toObjectId(id) },
    {
      $set: {
        status: 'sending',
        error: '',
        updatedAt: now
      },
      $inc: { attempts: 1 }
    }
  );
}

export async function markMailLogSent(id, messageId) {
  const db = await getDb();
  const now = new Date();
  await db.collection('mailLogs').updateOne(
    { _id: toObjectId(id) },
    {
      $set: {
        status: 'sent',
        messageId,
        error: '',
        sentAt: now,
        updatedAt: now
      }
    }
  );
}

export async function markMailLogFailed(id, error) {
  const db = await getDb();
  const now = new Date();
  await db.collection('mailLogs').updateOne(
    { _id: toObjectId(id) },
    {
      $set: {
        status: 'failed',
        error,
        failedAt: now,
        updatedAt: now
      }
    }
  );
}

export async function queueMailLogForResend(id) {
  const db = await getDb();
  const now = new Date();
  const result = await db.collection('mailLogs').findOneAndUpdate(
    { _id: toObjectId(id), status: 'failed' },
    {
      $set: {
        status: 'pending',
        error: '',
        messageId: '',
        updatedAt: now
      }
    },
    { returnDocument: 'after' }
  );

  return result;
}

export async function recoverActiveMailJobs() {
  const db = await getDb();
  const activeJobs = await db
    .collection('mailJobs')
    .find({ status: { $in: ['queued', 'running'] } })
    .project({ _id: 1 })
    .toArray();
  const jobIds = activeJobs.map((job) => job._id);

  if (jobIds.length > 0) {
    await db.collection('mailLogs').updateMany(
      { jobId: { $in: jobIds }, status: 'sending' },
      {
        $set: {
          status: 'pending',
          updatedAt: new Date()
        }
      }
    );
  }

  return jobIds.map((id) => id.toString());
}
