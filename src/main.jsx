import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bold,
  Edit3,
  FileSpreadsheet,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  LogOut,
  Mail,
  Paperclip,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Underline,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import "./styles.css";

async function parseApiResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || fallbackMessage);
    return data;
  }

  const text = await response.text();
  if (!response.ok) throw new Error(text || fallbackMessage);
  return text ? { message: text } : {};
}

function templateFormData(form) {
  const formData = new FormData();
  formData.append("name", form.name);
  formData.append("subject", form.subject);
  formData.append("content", form.content);

  if (form.attachmentFile) {
    formData.append("attachment", form.attachmentFile);
  }

  if (form.removeAttachment) {
    formData.append("removeAttachment", "true");
  }

  return formData;
}

const api = {
  async me() {
    const response = await fetch("/api/auth/me", { credentials: "include" });
    return parseApiResponse(response, "Unable to check login session.");
  },
  async login(email, password) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    return parseApiResponse(response, "Login failed.");
  },
  async logout() {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    return parseApiResponse(response, "Logout failed.");
  },
  async listTemplates() {
    const response = await fetch("/api/templates", { credentials: "include" });
    return parseApiResponse(response, "Unable to load templates.");
  },
  async createTemplate(form) {
    const response = await fetch("/api/templates", {
      method: "POST",
      credentials: "include",
      body: templateFormData(form),
    });
    return parseApiResponse(response, "Unable to create template.");
  },
  async updateTemplate(id, form) {
    const response = await fetch(`/api/templates/${id}`, {
      method: "PUT",
      credentials: "include",
      body: templateFormData(form),
    });
    return parseApiResponse(response, "Unable to update template.");
  },
  async deleteTemplate(id) {
    const response = await fetch(`/api/templates/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    return parseApiResponse(response, "Unable to delete template.");
  },
  async bulkSend(file, templateId, sendOptions) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("templateId", templateId);
    formData.append("sendMode", sendOptions.mode);
    formData.append(
      "queueIntervalSeconds",
      String(sendOptions.queueIntervalSeconds)
    );

    const response = await fetch("/api/mail/bulk-send", {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    return parseApiResponse(response, "Bulk send failed.");
  },
  async getMailJob(id) {
    const response = await fetch(`/api/mail/jobs/${id}`, {
      credentials: "include",
    });
    return parseApiResponse(response, "Unable to load mail job.");
  },
  async listMailJobs() {
    const response = await fetch("/api/mail/jobs", {
      credentials: "include",
    });
    return parseApiResponse(response, "Unable to load mail jobs.");
  },
  async listMailLogs(filters = {}) {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    const query = params.toString();
    const response = await fetch(`/api/mail/logs${query ? `?${query}` : ""}`, {
      credentials: "include",
    });
    return parseApiResponse(response, "Unable to load mail logs.");
  },
  async resendMailLog(id) {
    const response = await fetch(`/api/mail/logs/${id}/resend`, {
      method: "POST",
      credentials: "include",
    });
    return parseApiResponse(response, "Unable to resend mail.");
  },
};

const emptyTemplateForm = {
  id: "",
  name: "",
  subject: "",
  content: "",
  attachmentFile: null,
  existingAttachment: null,
  removeAttachment: false,
};

const emptyAuditFilters = {
  search: "",
  templateId: "",
  status: "",
  from: "",
  to: "",
};

function App() {
  const [admin, setAdmin] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((data) => setAdmin(data.authenticated ? data.admin : null))
      .finally(() => setCheckingSession(false));
  }, []);

  if (checkingSession) {
    return (
      <main className="center-shell">
        <Loader2 className="spin" aria-hidden="true" />
      </main>
    );
  }

  return admin ? (
    <Dashboard admin={admin} onLogout={() => setAdmin(null)} />
  ) : (
    <Login onLogin={setAdmin} />
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await api.login(email, password);
      onLogin(data.admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="center-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand-mark">
          <ShieldCheck aria-hidden="true" />
        </div>
        <h1 id="login-title">Admin Login</h1>
        <p>
          Sign in to manage templates and send bulk mail from an Excel file.
        </p>

        <form onSubmit={handleSubmit} className="form-stack">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="alert error">{error}</div>}

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? (
              <Loader2 className="spin" aria-hidden="true" />
            ) : (
              <Mail aria-hidden="true" />
            )}
            Login
          </button>
        </form>
      </section>
    </main>
  );
}

function Dashboard({ admin, onLogout }) {
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateError, setTemplateError] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [file, setFile] = useState(null);
  const [sendMode, setSendMode] = useState("immediate");
  const [queueIntervalSeconds, setQueueIntervalSeconds] = useState(5);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [mailLogs, setMailLogs] = useState([]);
  const [mailLogsLoading, setMailLogsLoading] = useState(true);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLimit, setAuditLimit] = useState(25);
  const [auditPagination, setAuditPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });
  const [auditFilters, setAuditFilters] = useState(emptyAuditFilters);
  const [jobSnapshot, setJobSnapshot] = useState(null);
  const [activeJobId, setActiveJobId] = useState("");
  const [activeTab, setActiveTab] = useState("send");
  const [sending, setSending] = useState(false);

  async function loadTemplates() {
    setTemplateError("");
    setTemplatesLoading(true);

    try {
      const data = await api.listTemplates();
      setTemplates(data.templates);
      setSelectedTemplateId(
        (current) => current || data.templates?.[0]?.id || ""
      );
    } catch (err) {
      setTemplateError(err.message);
    } finally {
      setTemplatesLoading(false);
    }
  }

  useEffect(() => {
    loadTemplates();
    loadJobs();
  }, []);

  async function loadJobs() {
    setJobsLoading(true);

    try {
      const data = await api.listMailJobs();
      setJobs(data.jobs);

      if (!activeJobId && !jobSnapshot?.job) {
        const activeJob = data.jobs.find((job) =>
          ["queued", "running"].includes(job.status)
        );
        if (activeJob) {
          openJob(activeJob.id);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setJobsLoading(false);
    }
  }

  useEffect(() => {
    let stopped = false;

    async function refreshJobs() {
      try {
        const data = await api.listMailJobs();

        if (!stopped) {
          setJobs(data.jobs);
        }
      } catch (err) {
        if (!stopped) {
          setError(err.message);
        }
      }
    }

    const interval = setInterval(refreshJobs, 5000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  async function loadMailLogs(
    filters = auditFilters,
    page = auditPage,
    limit = auditLimit
  ) {
    setMailLogsLoading(true);

    try {
      const data = await api.listMailLogs({ ...filters, page, limit });
      setMailLogs(data.logs);
      setAuditPagination(data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setMailLogsLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadMailLogs(auditFilters, auditPage, auditLimit);
    }, 250);

    return () => clearTimeout(timeout);
  }, [auditFilters, auditPage, auditLimit]);

  useEffect(() => {
    let stopped = false;

    async function refreshMailLogs() {
      try {
        const data = await api.listMailLogs({
          ...auditFilters,
          page: auditPage,
          limit: auditLimit,
        });

        if (!stopped) {
          setMailLogs(data.logs);
          setAuditPagination(data.pagination);
        }
      } catch (err) {
        if (!stopped) {
          setError(err.message);
        }
      }
    }

    const interval = setInterval(refreshMailLogs, 10000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [auditFilters, auditPage, auditLimit]);

  useEffect(() => {
    if (!activeJobId) {
      return undefined;
    }

    let stopped = false;

    async function refreshJob() {
      try {
        const data = await api.getMailJob(activeJobId);

        if (!stopped) {
          setJobSnapshot(data);

          if (["completed", "failed"].includes(data.job.status)) {
            setActiveJobId("");
          }
        }
      } catch (err) {
        if (!stopped) {
          setError(err.message);
        }
      }
    }

    refreshJob();
    const interval = setInterval(refreshJob, 2500);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [activeJobId]);

  async function handleLogout() {
    await api.logout();
    onLogout();
  }

  async function openJob(jobId) {
    setError("");

    try {
      const data = await api.getMailJob(jobId);
      setJobSnapshot(data);
      setActiveJobId(
        ["queued", "running"].includes(data.job.status) ? jobId : ""
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSend(event) {
    event.preventDefault();
    setError("");
    setJobSnapshot(null);
    setActiveJobId("");

    if (!selectedTemplateId) {
      setError("Please select a template first.");
      return;
    }

    if (!file) {
      setError("Please choose an Excel file first.");
      return;
    }

    setSending(true);
    try {
      const data = await api.bulkSend(file, selectedTemplateId, {
        mode: sendMode,
        queueIntervalSeconds,
      });
      setJobSnapshot({ job: data.job, logs: [] });
      setActiveJobId(data.job.id);
      await loadJobs();
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleResend(logId) {
    setError("");
    const jobId = activeJobId || jobSnapshot?.job?.id;

    try {
      await api.resendMailLog(logId);

      if (jobId) {
        const data = await api.getMailJob(jobId);
        setJobSnapshot(data);
        setActiveJobId(jobId);
        await loadMailLogs(auditFilters, auditPage, auditLimit);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Bulk Mail Sender</span>
          <h1>Templates and bulk sending</h1>
        </div>
        <div className="admin-actions">
          <span>{admin.email}</span>
          <button
            className="icon-button"
            type="button"
            onClick={handleLogout}
            aria-label="Logout"
          >
            <LogOut aria-hidden="true" />
          </button>
        </div>
      </header>

      <nav className="dashboard-tabs" aria-label="Dashboard sections">
        {[
          ["send", "Send"],
          ["jobs", "Jobs"],
          ["templates", "Templates"],
          ["audit", "Audit trail"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={activeTab === id ? "active" : ""}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "send" && (
        <section className="workspace send-layout">
          <form className="upload-panel" onSubmit={handleSend}>
            <div className="panel-heading">
              <FileSpreadsheet aria-hidden="true" />
              <div>
                <h2>Send bulk mail</h2>
                <p>Select a saved template, then upload recipients.</p>
              </div>
            </div>

            <label>
              Template
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                disabled={templatesLoading || templates?.length === 0}
                required
              >
                <option value="">Select template</option>
                {templates?.map((template) => (
                  <option value={template.id} key={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="field-group">
              <span className="field-label">Send mode</span>
              <div className="segmented-control">
                <label className={sendMode === "immediate" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="sendMode"
                    value="immediate"
                    checked={sendMode === "immediate"}
                    onChange={() => setSendMode("immediate")}
                  />
                  One go
                </label>
                <label className={sendMode === "queued" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="sendMode"
                    value="queued"
                    checked={sendMode === "queued"}
                    onChange={() => setSendMode("queued")}
                  />
                  Queue
                </label>
              </div>
            </div>

            {sendMode === "queued" && (
              <label>
                Queue speed
                <select
                  value={queueIntervalSeconds}
                  onChange={(event) =>
                    setQueueIntervalSeconds(Number(event.target.value))
                  }
                >
                  <option value="2">1 mail per 2 seconds</option>
                  <option value="5">1 mail per 5 seconds</option>
                  <option value="10">1 mail per 10 seconds</option>
                  <option value="30">1 mail per 30 seconds</option>
                  <option value="60">1 mail per 60 seconds</option>
                </select>
              </label>
            )}

            <label className="drop-zone">
              <UploadCloud aria-hidden="true" />
              <strong>{file ? file.name : "Choose Excel file"}</strong>
              <span>Email IDs are extracted from the first sheet.</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
            </label>

            {error && <div className="alert error">{error}</div>}

            <button
              className="primary-button send-button"
              type="submit"
              disabled={sending}
            >
              {sending ? (
                <Loader2 className="spin" aria-hidden="true" />
              ) : (
                <Send aria-hidden="true" />
              )}
              {sending
                ? "Sending..."
                : sendMode === "queued"
                  ? "Queue Mail"
                  : "Send Mail"}
            </button>
          </form>

          <ResultsPanel snapshot={jobSnapshot} onResend={handleResend} />
        </section>
      )}

      {activeTab === "jobs" && (
        <section className="workspace jobs-layout">
          <JobsPanel
            jobs={jobs}
            loading={jobsLoading}
            selectedJobId={jobSnapshot?.job?.id || ""}
            onSelect={openJob}
          />

          <ResultsPanel snapshot={jobSnapshot} onResend={handleResend} />
        </section>
      )}

      {activeTab === "templates" && (
        <TemplateManager
          templates={templates}
          loading={templatesLoading}
          error={templateError}
          onTemplatesChanged={loadTemplates}
        />
      )}

      {activeTab === "audit" && (
        <MailAuditTrail
          logs={mailLogs}
          loading={mailLogsLoading}
          templates={templates}
          filters={auditFilters}
          pagination={auditPagination}
          limit={auditLimit}
          onLimitChange={(value) => {
            setAuditLimit(value);
            setAuditPage(1);
          }}
          onPageChange={setAuditPage}
          onFiltersChange={(updater) => {
            setAuditPage(1);
            setAuditFilters(updater);
          }}
          onRefresh={() => loadMailLogs(auditFilters, auditPage, auditLimit)}
        />
      )}
    </main>
  );
}

function displayDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function logEventDate(log) {
  return log.sentAt || log.failedAt || log.updatedAt || log.createdAt;
}

function MailAuditTrail({
  logs,
  loading,
  templates,
  filters,
  pagination,
  limit,
  onLimitChange,
  onPageChange,
  onFiltersChange,
  onRefresh,
}) {
  function updateFilter(field, value) {
    onFiltersChange((current) => ({ ...current, [field]: value }));
  }

  function clearFilters() {
    onFiltersChange(emptyAuditFilters);
  }

  return (
    <section className="audit-panel" aria-labelledby="audit-title">
      <div className="panel-heading spaced">
        <div>
          <h2 id="audit-title">Mail audit trail</h2>
          <p>Complete log of individual mail attempts from recent jobs.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onRefresh}>
          <Mail aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="audit-filters">
        <label>
          Search
          <input
            type="text"
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Email or subject"
          />
        </label>

        <label>
          Template
          <select
            value={filters.templateId}
            onChange={(event) => updateFilter("templateId", event.target.value)}
          >
            <option value="">All templates</option>
            {templates?.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="sending">Sending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </label>

        <label>
          From
          <input
            type="datetime-local"
            value={filters.from}
            onChange={(event) => updateFilter("from", event.target.value)}
          />
        </label>

        <label>
          To
          <input
            type="datetime-local"
            value={filters.to}
            onChange={(event) => updateFilter("to", event.target.value)}
          />
        </label>

        <button
          className="secondary-button"
          type="button"
          onClick={clearFilters}
        >
          <X aria-hidden="true" />
          Clear
        </button>
      </div>

      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Template</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Send date-time</th>
              <th>Attempts</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="7">Loading mail logs...</td>
              </tr>
            )}
            {!loading && logs?.length === 0 && (
              <tr>
                <td colSpan="7">No mail logs found.</td>
              </tr>
            )}
            {!loading &&
              logs?.map((log) => (
                <tr key={log.id}>
                  <td>{log.email}</td>
                  <td>{log.templateName}</td>
                  <td>{log.templateSubject}</td>
                  <td>
                    <span className={`status-badge ${log.status}`}>
                      {log.status}
                    </span>
                  </td>
                  <td>{displayDate(logEventDate(log))}</td>
                  <td>{log.attempts}</td>
                  <td>
                    {log.status === "failed" ? log.error : log.messageId || "-"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="pagination-bar">
        <span>
          Showing page {pagination.page} of {pagination.totalPages} ·{" "}
          {pagination.total} logs
        </span>
        <label>
          Rows
          <select
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
        <div className="pagination-actions">
          <button
            className="secondary-button compact"
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => onPageChange(pagination.page - 1)}
          >
            Previous
          </button>
          <button
            className="secondary-button compact"
            type="button"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => onPageChange(pagination.page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function JobsPanel({ jobs, loading, selectedJobId, onSelect }) {
  const activeJobs = jobs?.filter((job) =>
    ["queued", "running"].includes(job.status)
  );
  const completedJobs = jobs?.filter(
    (job) => !["queued", "running"].includes(job.status)
  );
  const visibleJobs = [
    ...activeJobs,
    ...completedJobs.slice(0, Math.max(0, 10 - activeJobs?.length)),
  ];

  return (
    <section className="jobs-panel" aria-labelledby="jobs-title">
      <div className="panel-heading">
        <Mail aria-hidden="true" />
        <div>
          <h2 id="jobs-title">Mail jobs</h2>
          <p>Running and recent jobs are loaded from the database.</p>
        </div>
      </div>

      <div className="jobs-list">
        {loading && <div className="template-empty">Loading jobs...</div>}
        {!loading && visibleJobs?.length === 0 && (
          <div className="template-empty">No mail jobs found.</div>
        )}
        {visibleJobs?.map((job) => {
          const activeCount = job.pending + job.sending;

          return (
            <button
              className={`job-item ${selectedJobId === job.id ? "selected" : ""}`}
              type="button"
              key={job.id}
              onClick={() => onSelect(job.id)}
            >
              <span>
                <strong>{job.templateName}</strong>
                <small>{new Date(job.createdAt).toLocaleString()}</small>
              </span>
              <span className={`status-badge ${job.status}`}>{job.status}</span>
              <span className="job-counts">
                {job.sent}/{job.total} sent · {activeCount} pending ·{" "}
                {job.failed} failed
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TemplateManager({ templates, loading, error, onTemplatesChanged }) {
  const [form, setForm] = useState(emptyTemplateForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyTemplateForm);
    setFormError("");
  }

  function editTemplate(template) {
    setForm({
      id: template.id,
      name: template.name,
      subject: template.subject,
      content: template.content,
      attachmentFile: null,
      existingAttachment: template.attachment,
      removeAttachment: false,
    });
    setFormError("");
  }

  async function handleSave(event) {
    event.preventDefault();
    setFormError("");
    setSaving(true);

    try {
      if (form.id) {
        await api.updateTemplate(form.id, form);
      } else {
        await api.createTemplate(form);
      }

      resetForm();
      await onTemplatesChanged();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(template) {
    if (!confirm(`Delete template "${template.name}"?`)) {
      return;
    }

    setFormError("");
    try {
      await api.deleteTemplate(template.id);
      if (form.id === template.id) {
        resetForm();
      }
      await onTemplatesChanged();
    } catch (err) {
      setFormError(err.message);
    }
  }

  return (
    <section className="template-panel" aria-labelledby="template-title">
      <div className="panel-heading spaced">
        <div>
          <h2 id="template-title">Mail templates</h2>
          <p>Create, edit, and delete reusable templates.</p>
        </div>
        <button className="secondary-button" type="button" onClick={resetForm}>
          <Plus aria-hidden="true" />
          New
        </button>
      </div>

      <form className="template-form" onSubmit={handleSave}>
        <label>
          Template name
          <input
            type="text"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Example: Monthly update"
            required
          />
        </label>

        <label>
          Subject
          <input
            type="text"
            value={form.subject}
            onChange={(event) => updateField("subject", event.target.value)}
            placeholder="Email subject"
            required
          />
        </label>

        <div className="field-group">
          <span className="field-label">Content</span>
          <RichTextEditor
            value={form.content}
            onChange={(value) => updateField("content", value)}
            placeholder="Write your email content..."
          />
        </div>

        <label>
          Attachment
          <input
            type="file"
            onChange={(event) => {
              updateField("attachmentFile", event.target.files?.[0] || null);
              updateField("removeAttachment", false);
            }}
          />
        </label>

        {(form.existingAttachment || form.attachmentFile) && (
          <div className="attachment-pill">
            <Paperclip aria-hidden="true" />
            <span>
              {form.attachmentFile?.name ||
                form.existingAttachment?.originalName ||
                form.existingAttachment?.filename}
            </span>
            {form.existingAttachment && !form.attachmentFile && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  updateField("removeAttachment", !form.removeAttachment)
                }
              >
                {form.removeAttachment ? "Keep" : "Remove"}
              </button>
            )}
          </div>
        )}

        {form.removeAttachment && (
          <div className="alert subtle">
            Attachment will be removed on save.
          </div>
        )}
        {formError && <div className="alert error">{formError}</div>}
        {error && <div className="alert error">{error}</div>}

        <div className="form-actions">
          {form.id && (
            <button
              className="secondary-button"
              type="button"
              onClick={resetForm}
            >
              <X aria-hidden="true" />
              Cancel
            </button>
          )}
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="spin" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {form.id ? "Update Template" : "Create Template"}
          </button>
        </div>
      </form>

      <div className="template-list" aria-live="polite">
        {loading && <div className="template-empty">Loading templates...</div>}
        {!loading && templates?.length === 0 && (
          <div className="template-empty">No templates created yet.</div>
        )}
        {templates?.map((template) => (
          <article className="template-item" key={template.id}>
            <div>
              <h3>{template.name}</h3>
              <p>{template.subject}</p>
              {template.attachment && (
                <span className="attachment-note">
                  <Paperclip aria-hidden="true" />
                  {template.attachment.originalName}
                </span>
              )}
            </div>
            <div className="item-actions">
              <button
                className="icon-button"
                type="button"
                onClick={() => editTemplate(template)}
                aria-label={`Edit ${template.name}`}
              >
                <Edit3 aria-hidden="true" />
              </button>
              <button
                className="icon-button danger"
                type="button"
                onClick={() => handleDelete(template)}
                aria-label={`Delete ${template.name}`}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RichTextEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  function updateValue() {
    onChange(editorRef.current?.innerHTML || "");
  }

  function runCommand(command, commandValue = null) {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    updateValue();
  }

  function handleLink() {
    const url = prompt("Enter link URL");

    if (!url) {
      return;
    }

    runCommand("createLink", url);
  }

  return (
    <div className="rich-editor">
      <div className="editor-toolbar" aria-label="Content formatting">
        <ToolbarButton label="Bold" onClick={() => runCommand("bold")}>
          <Bold aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => runCommand("italic")}>
          <Italic aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          onClick={() => runCommand("underline")}
        >
          <Underline aria-hidden="true" />
        </ToolbarButton>
        <span className="toolbar-divider" aria-hidden="true" />
        <ToolbarButton
          label="Bulleted list"
          onClick={() => runCommand("insertUnorderedList")}
        >
          <List aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          onClick={() => runCommand("insertOrderedList")}
        >
          <ListOrdered aria-hidden="true" />
        </ToolbarButton>
        <span className="toolbar-divider" aria-hidden="true" />
        <ToolbarButton label="Add link" onClick={handleLink}>
          <Link2 aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Clear formatting"
          onClick={() => runCommand("removeFormat")}
        >
          <X aria-hidden="true" />
        </ToolbarButton>
      </div>

      <div
        ref={editorRef}
        className="editor-body"
        contentEditable
        data-placeholder={placeholder}
        role="textbox"
        aria-multiline="true"
        tabIndex="0"
        onInput={updateValue}
        onBlur={updateValue}
        suppressContentEditableWarning
      />
    </div>
  );
}

function ToolbarButton({ label, onClick, children }) {
  return (
    <button
      className="toolbar-button"
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ResultsPanel({ snapshot, onResend }) {
  if (!snapshot?.job) {
    return (
      <aside className="results-panel empty">
        <Mail aria-hidden="true" />
        <h2>No mail job yet</h2>
        <p>
          After starting a send, live status and failed mails will appear here.
        </p>
      </aside>
    );
  }

  const { job, logs = [] } = snapshot;
  const failedLogs = logs?.filter((item) => item.status === "failed");
  const activeCount = job.pending + job.sending;

  return (
    <aside className="results-panel" aria-labelledby="results-title">
      <h2 id="results-title">Send status</h2>
      <p className="template-used">Template: {job.templateName}</p>
      <p className="template-used">
        Mode:{" "}
        {job.sendMode === "queued"
          ? `Queue, 1 mail per ${job.queueIntervalSeconds} seconds`
          : "One go"}
      </p>
      <p className="template-used">Status: {job.status}</p>
      <div className="stats-grid">
        <Stat label="Total" value={job.total} />
        <Stat label="Pending" value={activeCount} />
        <Stat label="Sent" value={job.sent} tone="success" />
        <Stat label="Failed" value={job.failed} tone="error" />
      </div>

      <h3 className="section-title">Failed mails</h3>
      <div className="result-list">
        {failedLogs?.length === 0 && (
          <div className="result-empty">
            {job.status === "completed"
              ? "No failed mails."
              : "Failures will appear here if any occur."}
          </div>
        )}
        {failedLogs?.map((item) => (
          <div className="result-row" key={item.email}>
            <XCircle className="error-icon" aria-hidden="true" />
            <div>
              <strong>{item.email}</strong>
              <span>{item.error}</span>
              <span>
                Template: {item.templateName} · Attempts: {item.attempts}
                {item.failedAt
                  ? ` · Failed: ${new Date(item.failedAt).toLocaleString()}`
                  : ""}
              </span>
            </div>
            <button
              className="secondary-button compact"
              type="button"
              onClick={() => onResend(item.id)}
            >
              <Send aria-hidden="true" />
              Resend
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

function Stat({ label, value, tone = "" }) {
  return (
    <div className={`stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
