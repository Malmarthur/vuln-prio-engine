import { useEffect, useState, ReactNode } from 'react';
import { fetchVulnerability, VulnerabilityDetail } from '../api/client';
import { priorityBarClass } from '../lib/priority';
import { getErrorMessage } from '../lib/utils';

interface VulnDetailProps {
  cveId: string;
}

interface SectionProps {
  title: string;
  children: ReactNode;
}

interface CvssRowProps {
  label: string;
  vector: string | null | undefined;
  score: number | null | undefined;
  severity: string | null | undefined;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString();
}

/** Return the URL only if it uses http or https — prevents javascript: / data: injection */
function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol } = new URL(url);
    if (protocol === 'http:' || protocol === 'https:') return url;
  } catch {
    // invalid URL
  }
  return null;
}

function Section({ title, children }: SectionProps) {
  return (
    <div>
      <h4 className="label-caps mb-1 !text-[10px]">
        {title}
      </h4>
      {children}
    </div>
  );
}

function CvssRow({ label, vector, score, severity }: CvssRowProps) {
  if (!score && !vector) return null;
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="w-10 font-mono text-[11px] text-gray-500">{label}</span>
      <span className="w-8 font-mono font-semibold text-gray-900">{Number(score).toFixed(1)}</span>
      {severity && (
        <span className="inline-flex w-20 items-center gap-1.5 text-[11px] uppercase text-gray-600"><i className={`inline-block h-2 w-2 ${priorityBarClass(severity)}`} />{severity}</span>
      )}
      {vector && (
        <span className="text-xs text-gray-400 font-mono truncate max-w-sm">
          {vector}
        </span>
      )}
    </div>
  );
}

export default function VulnDetail({ cveId }: VulnDetailProps) {
  const [vuln, setVuln] = useState<VulnerabilityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setVuln(null);
    setError(null);
    fetchVulnerability(cveId, controller.signal)
      .then(setVuln)
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') {
          setError(getErrorMessage(e));
        }
      });
    return () => controller.abort();
  }, [cveId]);

  if (error) {
    return (
      <div className="notice-error border-x-0">
        Error loading detail: {error}
      </div>
    );
  }

  if (!vuln) {
    return (
      <div className="bg-gray-50 px-6 py-4 text-[13px] text-gray-500">
        Loading…
      </div>
    );
  }

  const refs = vuln.references || [];
  const cwes = vuln.cwe_ids || [];
  const products = vuln.affected_products || [];
  const euvdHref = safeHref(vuln.euvd_source_url);
  const nvdHref = safeHref(vuln.nvd_source_url);

  return (
    <div className="space-y-4 border-l-[3px] border-accent-600 bg-gray-50 px-6 py-4">
      {/* Description */}
      {vuln.description && (
        <Section title="Description">
          <p className="max-w-4xl whitespace-pre-line text-[13px] leading-relaxed text-gray-800">
            {vuln.description}
          </p>
        </Section>
      )}

      {/* CVSS Scores */}
      <Section title="CVSS scores">
        <div className="space-y-1">
          <CvssRow label="v4.0" vector={vuln.cvss_v40_vector} score={vuln.cvss_v40_score} severity={vuln.cvss_v40_severity} />
          <CvssRow label="v3.1" vector={vuln.cvss_v31_vector} score={vuln.cvss_v31_score} severity={vuln.cvss_v31_severity} />
          <CvssRow label="v3.0" vector={vuln.cvss_v30_vector} score={vuln.cvss_v30_score} severity={vuln.cvss_v30_severity} />
          <CvssRow label="v2.0" vector={vuln.cvss_v2_vector} score={vuln.cvss_v2_score} severity={vuln.cvss_v2_severity} />
        </div>
      </Section>

      {/* EPSS */}
      {vuln.epss_score != null && (
        <Section title="EPSS">
          <p className="text-[13px] text-gray-700">
            Score: <span className="font-mono">{(vuln.epss_score * 100).toFixed(2)}%</span>
            {vuln.epss_percentile != null && (
              <> &middot; Percentile: <span className="font-mono">{(vuln.epss_percentile * 100).toFixed(1)}%</span></>
            )}
            {vuln.epss_date && (
              <> &middot; Date: {vuln.epss_date}</>
            )}
          </p>
        </Section>
      )}

      {/* KEV */}
      {vuln.kev_known_exploited && (
        <Section title="CISA KEV">
          <p className="text-[13px] text-gray-700">
            Added: {fmtDate(vuln.kev_date_added)}
            {vuln.kev_due_date && <> &middot; Due: {fmtDate(vuln.kev_due_date)}</>}
            {vuln.kev_ransomware_use && (
              <span className="ml-2 border border-red-300 bg-red-50 px-1.5 text-[11px] font-medium uppercase text-red-700">
                Ransomware
              </span>
            )}
          </p>
          {vuln.kev_notes && (
            <p className="text-xs text-gray-500 mt-1">{vuln.kev_notes}</p>
          )}
        </Section>
      )}

      {/* EUVD */}
      {vuln.euvd_id && (
        <Section title="EUVD">
          <p className="text-[13px] text-gray-700">
            {vuln.euvd_id}
            {vuln.euvd_exploitation && <> &middot; {vuln.euvd_exploitation}</>}
            {euvdHref && (
              <> &middot; <a href={euvdHref} target="_blank" rel="noreferrer" className="text-accent-700 underline-offset-2 hover:underline">Source</a></>
            )}
          </p>
        </Section>
      )}

      {/* CWEs */}
      {cwes.length > 0 && (
        <Section title="CWEs">
          <div className="flex flex-wrap gap-1.5">
            {cwes.map((c) => (
              <span key={c} className="border border-gray-300 bg-white px-1.5 font-mono text-[11px] text-gray-700">
                {c}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Affected Products */}
      {products.length > 0 && (
        <Section title={`Affected products (${products.length})`}>
          <div className="max-h-32 overflow-y-auto text-xs text-gray-600 font-mono space-y-0.5">
            {products.slice(0, 20).map((p, i) => (
              <div key={i} className="truncate">{p.cpe}</div>
            ))}
            {products.length > 20 && (
              <div className="text-gray-400">... and {products.length - 20} more</div>
            )}
          </div>
        </Section>
      )}

      {/* References */}
      {refs.length > 0 && (
        <Section title={`References (${refs.length})`}>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {refs.slice(0, 10).map((r, i) => {
              const href = safeHref(r.url);
              return (
                <div key={i} className="truncate text-[13px]">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="text-accent-700 underline-offset-2 hover:underline">
                      {r.url}
                    </a>
                  ) : (
                    <span className="text-gray-500">{r.url}</span>
                  )}
                  {r.tags && r.tags.length > 0 && (
                    <span className="ml-2 text-xs text-gray-400">{r.tags.join(', ')}</span>
                  )}
                </div>
              );
            })}
            {refs.length > 10 && (
              <div className="text-xs text-gray-400">... and {refs.length - 10} more</div>
            )}
          </div>
        </Section>
      )}

      {/* Links */}
      <div className="flex gap-4 border-t border-gray-200 pt-2 text-[13px]">
        {nvdHref && (
          <a href={nvdHref} target="_blank" rel="noreferrer" className="text-accent-700 underline-offset-2 hover:underline">
            NVD
          </a>
        )}
      </div>
    </div>
  );
}
