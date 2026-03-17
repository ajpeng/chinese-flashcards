import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = (import.meta as any).env.VITE_API_URL || 'https://api.ajpeng.ca';
const STORAGE_KEY = 'subtitle_jobs';
const POLL_INTERVAL_MS = 4_000;

const LANGUAGES = [
  { value: 'zh-CN', label: 'Chinese Simplified (zh-CN)' },
  { value: 'zh-TW', label: 'Chinese Traditional (zh-TW)' },
  { value: 'en-US', label: 'English (en-US)' },
  { value: 'ja-JP', label: 'Japanese (ja-JP)' },
  { value: 'ko-KR', label: 'Korean (ko-KR)' },
];

type JobStatus = 'processing' | 'done' | 'failed';

interface Job {
  jobId: string;
  filename: string;
  language: string;
  status: JobStatus;
  srtContent?: string;
  error?: string;
  durationMs?: number;
  progressPct?: number;
  createdAt: string;
}

function loadJobs(): Job[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveJobs(jobs: Job[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

function downloadSrt(filename: string, srt: string) {
  const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/\.[^.]+$/, '') + '.srt';
  a.click();
  URL.revokeObjectURL(url);
}

function calcEta(job: Job): string {
  const pct = job.progressPct ?? 0;
  if (pct <= 0) return '';
  const elapsedMs = Date.now() - new Date(job.createdAt).getTime();
  const remainingMs = (elapsedMs / pct) * (100 - pct);
  if (remainingMs <= 0) return 'almost done';
  const mins = Math.ceil(remainingMs / 60_000);
  if (mins < 1) return '< 1 min left';
  return `~${mins} min left`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const statusColor: Record<JobStatus, string> = {
  processing: 'rgba(245,158,11,0.85)',
  done: 'rgb(16,185,129)',
  failed: 'rgb(239,68,68)',
};

const statusBg: Record<JobStatus, string> = {
  processing: 'rgba(245,158,11,0.08)',
  done: 'rgba(16,185,129,0.08)',
  failed: 'rgba(239,68,68,0.08)',
};

const statusBorder: Record<JobStatus, string> = {
  processing: 'rgba(245,158,11,0.25)',
  done: 'rgba(16,185,129,0.25)',
  failed: 'rgba(239,68,68,0.25)',
};

const statusLabel: Record<JobStatus, string> = {
  processing: '⏳ Processing…',
  done: '✅ Done',
  failed: '❌ Failed',
};

export default function Subtitles(): React.ReactElement {
  useEffect(() => {
    document.title = 'Subtitle Generator · Chinese Flashcards';
    return () => { document.title = 'Chinese Flashcards'; };
  }, []);

  const [jobs, setJobs] = useState<Job[]>(loadJobs);
  const [language, setLanguage] = useState('zh-CN');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist jobs to localStorage whenever they change
  useEffect(() => { saveJobs(jobs); }, [jobs]);

  // Poll all processing jobs
  const pollJobs = useCallback(async () => {
    const processing = jobs.filter(j => j.status === 'processing');
    if (processing.length === 0) return;

    const updates = await Promise.all(
      processing.map(async (j) => {
        try {
          const res = await fetch(`${API_URL}/api/subtitles/jobs/${j.jobId}`);
          if (!res.ok) return null;
          return await res.json();
        } catch {
          return null;
        }
      })
    );

    setJobs(prev => {
      let changed = false;
      const next = prev.map(j => {
        const update = updates.find((u) => u && u.id === j.jobId);
        if (!update) return j;
        // Update whenever status OR progressPct changes
        if (update.status === j.status && (update.progressPct ?? 0) === (j.progressPct ?? 0)) return j;
        changed = true;
        return {
          ...j,
          status: update.status as JobStatus,
          srtContent: update.srtContent ?? j.srtContent,
          error: update.error ?? j.error,
          durationMs: update.durationMs ?? j.durationMs,
          progressPct: update.progressPct ?? j.progressPct,
        };
      });
      return changed ? next : prev;
    });
  }, [jobs]);

  // Set up polling interval
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    const hasProcessing = jobs.some(j => j.status === 'processing');
    if (hasProcessing) {
      pollingRef.current = setInterval(pollJobs, POLL_INTERVAL_MS);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [jobs, pollJobs]);

  const handleFile = async (file: File) => {
    setUploadError('');
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('language', language);

      const res = await fetch(`${API_URL}/api/subtitles/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const { jobId } = await res.json();

      const newJob: Job = {
        jobId,
        filename: file.name,
        language,
        status: 'processing',
        createdAt: new Date().toISOString(),
      };

      setJobs(prev => [newJob, ...prev]);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const removeJob = (jobId: string) => {
    setJobs(prev => prev.filter(j => j.jobId !== jobId));
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 'clamp(20px,4vw,26px)', fontWeight: 700, letterSpacing: '-0.02em' }}>
        Subtitle Generator
      </h2>
      <p style={{ color: 'var(--muted-color)', marginBottom: 28, fontSize: 13 }}>
        Upload an audio or video file and get a <code>.srt</code> subtitle file back.
        Processing happens in the background; you can leave and come back.
      </p>

      {/* Upload card */}
      <div style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--card-bg)', marginBottom: 24 }}>
        {/* Language selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-color)', marginBottom: 8 }}>
            Spoken Language
          </label>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            disabled={uploading}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary, rgba(128,128,128,0.06))',
              color: 'inherit', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'rgba(59,130,246,0.7)' : 'var(--border-color)'}`,
            borderRadius: 10,
            padding: '32px 20px',
            textAlign: 'center',
            cursor: uploading ? 'not-allowed' : 'pointer',
            background: dragOver ? 'rgba(59,130,246,0.05)' : 'transparent',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/mp4"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
          {uploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 24, height: 24, border: '3px solid rgba(59,130,246,0.3)',
                borderTopColor: 'rgba(59,130,246,0.85)', borderRadius: '50%',
                display: 'inline-block', animation: 'spin 0.75s linear infinite',
              }} />
              <span style={{ fontSize: 14, color: 'var(--muted-color)' }}>Uploading…</span>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎵</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                Drop an audio file here, or click to browse
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted-color)' }}>
                WAV, MP3, M4A, FLAC, OGG, MP4 · up to 500 MB
              </div>
            </>
          )}
        </div>

        {uploadError && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'rgb(239,68,68)', padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            {uploadError}
          </div>
        )}
      </div>

      {/* Jobs list */}
      {jobs.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-color)' }}>
              Recent Jobs
            </span>
            <button
              onClick={() => setJobs([])}
              style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-color)' }}
            >
              Clear all
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {jobs.map(job => (
              <div
                key={job.jobId}
                style={{
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: `1px solid ${statusBorder[job.status]}`,
                  background: statusBg[job.status],
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.filename}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted-color)', marginTop: 2 }}>
                      {LANGUAGES.find(l => l.value === job.language)?.label ?? job.language} · {timeAgo(job.createdAt)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <code style={{ fontSize: 11, color: 'var(--muted-color)', fontFamily: 'monospace' }}>
                        {job.jobId}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(job.jobId)}
                        title="Copy job ID"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-color)', fontSize: 12, padding: '0 2px', lineHeight: 1 }}
                      >
                        📋
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                      color: statusColor[job.status],
                      background: statusBg[job.status],
                      border: `1px solid ${statusBorder[job.status]}`,
                    }}>
                      {statusLabel[job.status]}
                    </span>
                    <button
                      onClick={() => removeJob(job.jobId)}
                      title="Remove"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-color)', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
                    >
                      ×
                    </button>
                  </div>
                </div>

                {job.status === 'processing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* Progress bar */}
                    <div style={{ height: 6, borderRadius: 99, background: 'rgba(245,158,11,0.15)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        borderRadius: 99,
                        background: 'rgba(245,158,11,0.85)',
                        width: `${job.progressPct ?? 0}%`,
                        transition: 'width 1s ease',
                        minWidth: job.progressPct ? undefined : '4%', // show a sliver even at 0%
                      }} />
                    </div>
                    {/* Labels */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted-color)' }}>
                      <span>
                        {job.progressPct
                          ? `${job.progressPct}% transcribed`
                          : 'Converting audio…'}
                      </span>
                      <span>{calcEta(job)}</span>
                    </div>
                  </div>
                )}

                {job.status === 'done' && job.srtContent && (
                  <button
                    onClick={() => downloadSrt(job.filename, job.srtContent!)}
                    style={{
                      alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 7,
                      border: 'none', background: 'rgba(16,185,129,0.85)', color: '#fff',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    ⬇ Download .srt
                  </button>
                )}

                {job.status === 'failed' && job.error && (
                  <div style={{ fontSize: 12, color: 'rgb(239,68,68)' }}>{job.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
