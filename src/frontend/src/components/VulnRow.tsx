import { memo } from 'react';
import { Vulnerability } from '../api/client';
import { PriorityBadge, priorityBarClass } from '../lib/priority';

interface VulnRowProps {
  vuln: Vulnerability;
  rowKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString();
}

function fmtEpss(v: number | null | undefined): string {
  if (v == null) return '\u2014';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtCvss(v: number | null | undefined): string {
  if (v == null) return '\u2014';
  return Number(v).toFixed(1);
}

function bestSeverity(v: Vulnerability): string | null {
  return v.cvss_v31_severity || v.cvss_v30_severity || v.cvss_v2_severity;
}

function bestCvss(v: Vulnerability): number | null {
  return v.cvss_v31_score ?? v.cvss_v30_score ?? v.cvss_v2_score;
}

const VulnRow = memo(function VulnRow({ vuln, rowKey, expanded, onToggle }: VulnRowProps) {
  const sev = bestSeverity(vuln);
  const score = bestCvss(vuln);

  return (
    <tr
      onClick={() => onToggle(rowKey)}
      className={`cursor-pointer ${expanded ? 'bg-gray-50' : ''}`}
      aria-expanded={expanded}
    >
      <td className="whitespace-nowrap font-mono font-medium">
        {vuln.cve_id ? (
          <span className="text-accent-800">{vuln.cve_id}</span>
        ) : vuln.euvd_id ? (
          <span className="text-accent-800">{vuln.euvd_id}</span>
        ) : (
          <span className="text-gray-300">&mdash;</span>
        )}
        {vuln.cve_id && vuln.euvd_id && (
          <span className="ml-1.5 border border-gray-300 px-1 font-sans text-[10px] font-medium text-gray-500">EUVD</span>
        )}
      </td>
      <td className="max-w-md truncate text-gray-700">
        {vuln.summary || '\u2014'}
      </td>
      <td className="whitespace-nowrap">
        {vuln.priority_level ? <PriorityBadge level={vuln.priority_level} /> : <span className="text-gray-300">&mdash;</span>}
      </td>
      <td className="whitespace-nowrap text-right font-mono">
        {vuln.priority_score != null ? vuln.priority_score.toFixed(1) : '\u2014'}
      </td>
      <td className="whitespace-nowrap">
        {sev ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase text-gray-700">
            <i className={`inline-block h-2 w-2 ${priorityBarClass(sev)}`} />
            {sev}
          </span>
        ) : (
          <span className="text-gray-300">{'\u2014'}</span>
        )}
      </td>
      <td className="whitespace-nowrap text-right font-mono">
        {fmtCvss(score)}
      </td>
      <td className="whitespace-nowrap text-right font-mono">
        {fmtEpss(vuln.epss_score)}
      </td>
      <td className="whitespace-nowrap text-center">
        {vuln.kev_known_exploited ? (
          <span className="bg-red-700 px-1 text-[10px] font-semibold uppercase leading-4 text-white" title="CISA Known Exploited Vulnerability">
            KEV
          </span>
        ) : (
          <span className="text-gray-300">{'\u2014'}</span>
        )}
      </td>
      <td className="hidden whitespace-nowrap font-mono text-gray-500 md:table-cell">
        {fmtDate(vuln.published_date)}
      </td>
    </tr>
  );
});

export default VulnRow;
